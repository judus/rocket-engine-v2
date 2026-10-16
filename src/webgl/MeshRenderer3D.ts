import type { WebGLRenderTarget } from './RenderTarget.js';
import type { DirectionalShadow3D } from '../3d/DirectionalShadow.js';
import type { EnvironmentLight3D } from '../3d/EnvironmentMap.js';
import type {
  Mesh3D,
  Node3D,
  PerspectiveCamera,
  Light3D,
  LinearColor,
} from '../3d/index.js';
import { multiplyMatrices } from '../3d/Matrix4.js';
import { WebGLColorRenderer } from './ColorRenderer.js';
import type { ColorMesh, ColorDraw, ColorVertex } from './ColorRenderer.js';

/** Expand immutable convex faces once; placement and perspective stay on the GPU.
 * Opaque #rrggbb colors match the CPU depth renderer; the lit variant also retains linear factors and normals.
 */
export function meshColorVertices(
  mesh: Mesh3D,
  lighting = false,
  materialResponse = false,
  normalMapping = false,
): readonly ColorVertex[] {
  const vertices: ColorVertex[] = [];
  for (const face of mesh.geometry.faces) {
    const material = mesh.materials[face.material]!;
    const hex = material.color;
    if (!/^#[0-9a-f]{6}$/i.test(hex))
      throw new Error('WebGL mesh colors require opaque #rrggbb');
    const rgb = Number.parseInt(hex.slice(1), 16);
    const decode = (n: number) => {
      n /= 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    };
    let color: LinearColor = [
      decode(rgb >> 16),
      decode((rgb >> 8) & 255),
      decode(rgb & 255),
    ];
    const factors = [
      material.metallicFactor ?? 1,
      material.roughnessFactor ?? 1,
    ] as const;
    if (
      materialResponse &&
      !factors.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)
    )
      throw new Error('Invalid metallic/roughness factors');
    const emission = material.emissiveFactor ?? [0, 0, 0];
    let flat = { x: 0, y: 0, z: 0 };
    if (lighting) {
      const base = material.baseColorFactor;
      if (base) {
        if (
          base.length !== 4 ||
          !Array.from(base).every(
            (v) => Number.isFinite(v) && v >= 0 && v <= 1,
          ) ||
          base[3] !== 1
        )
          throw new Error(
            'GPU lighting requires opaque linear baseColorFactor',
          );
        color = [base[0]!, base[1]!, base[2]!];
      }
      if (
        emission.length !== 3 ||
        !Array.from(emission).every(
          (v) => Number.isFinite(v) && v >= 0 && v <= 1,
        )
      )
        throw new Error('Invalid emissiveFactor');
      // Newell normal, matching the existing CPU flat-lighting convention.
      for (let i = 0; i < face.indices.length; i++) {
        const p = mesh.geometry.vertices[face.indices[i]!]!,
          q =
            mesh.geometry.vertices[
              face.indices[(i + 1) % face.indices.length]!
            ]!;
        flat.x += (p.y - q.y) * (p.z + q.z);
        flat.y += (p.z - q.z) * (p.x + q.x);
        flat.z += (p.x - q.x) * (p.y + q.y);
      }
    }
    for (let i = 1; i < face.indices.length - 1; i++) {
      for (const index of [
        face.indices[0]!,
        face.indices[i]!,
        face.indices[i + 1]!,
      ]) {
        if (!lighting)
          vertices.push({ position: mesh.geometry.vertices[index]!, color });
        else {
          const n = mesh.geometry.normals[index] ?? flat,
            length = Math.hypot(n.x, n.y, n.z);
          if (!Number.isFinite(length))
            throw new Error('Invalid geometry normal');
          vertices.push({
            position: mesh.geometry.vertices[index]!,
            color,
            normal: length
              ? { x: n.x / length, y: n.y / length, z: n.z / length }
              : { x: 0, y: 0, z: 0 },
            emission: emission as LinearColor,
            ...(normalMapping && mesh.geometry.tangents[index]
              ? { tangent: mesh.geometry.tangents[index] }
              : {}),
            ...(materialResponse ? { materialFactors: factors } : {}),
            ...(mesh.geometry.texCoords[index]
              ? { texCoord: mesh.geometry.texCoords[index] }
              : {}),
          });
        }
      }
    }
  }
  return vertices;
}

export interface MeshRenderStats {
  readonly drawCalls: number;
  readonly triangles: number;
  readonly cachedMeshes: number;
  readonly uploadedBytes: number;
}
/** Optional unlit Node3D adapter, using existing mesh/material bindings and camera.
 * Context-local cache by immutable Mesh3D identity. Unused entries retire after each render.
 * No scene, camera, canvas, event or clock ownership. Recreate after context restoration.
 * Faces are two-sided; optional per-fragment Lambert lighting, no CPU projection. Optional opaque base-color textures; one binding per mesh primitive.
 */
export class WebGLMeshRenderer3D {
  readonly #renderer: WebGLColorRenderer;
  #cache = new Map<Mesh3D, ColorMesh>();
  #disposed = false;
  readonly #lighting: boolean;
  readonly #textures: boolean;
  readonly #materialResponse: boolean;
  readonly #materialMaps: boolean;
  readonly #normalMapping: boolean;
  constructor(
    gl: WebGL2RenderingContext,
    options: {
      readonly lighting?: boolean;
      readonly textures?: boolean;
      readonly materialResponse?: boolean;
      readonly materialMaps?: boolean;
      readonly normalMapping?: boolean;
      readonly environment?: boolean;
      readonly shadows?: boolean;
    } = {},
  ) {
    this.#lighting = options.lighting ?? false;
    this.#textures = options.textures ?? false;
    this.#materialResponse = options.materialResponse ?? false;
    this.#materialMaps = options.materialMaps ?? false;
    this.#normalMapping = options.normalMapping ?? false;
    if (!gl.getContextAttributes()?.depth)
      throw new Error('WebGL mesh renderer requires a depth buffer');
    this.#renderer = new WebGLColorRenderer(gl, {
      lighting: this.#lighting,
      textures: this.#textures,
      materialResponse: this.#materialResponse,
      materialMaps: this.#materialMaps,
      normalMapping: this.#normalMapping,
      environment: options.environment ?? false,
      shadows: options.shadows ?? false,
    });
  }

  render(
    root: Node3D,
    camera: PerspectiveCamera,
    width: number,
    height: number,
    options: {
      readonly target?: WebGLRenderTarget;
      readonly clearColor?: readonly [number, number, number];
      readonly depthTest?: boolean;
      readonly reverseOrder?: boolean;
      readonly lights?: readonly Light3D[];
      readonly lightingEnabled?: boolean;
      readonly materialResponseEnabled?: boolean;
      readonly materialDebug?: 'none' | 'occlusion' | 'roughness' | 'metallic';
      readonly normalMappingEnabled?: boolean;
      readonly normalDebug?: boolean;
      readonly environment?: EnvironmentLight3D;
      readonly shadow?: DirectionalShadow3D;
      readonly shadowDebug?: boolean;
    } = {},
  ): MeshRenderStats {
    if (this.#disposed) throw new Error('WebGL mesh renderer is disposed');
    options.target?.assertContext(this.#renderer.gl);
    if (
      options.target &&
      (width !== options.target.width || height !== options.target.height)
    )
      throw new Error('Camera viewport must match render target dimensions');
    if (
      options.target &&
      (options.depthTest ?? true) &&
      !options.target.hasDepth
    )
      throw new Error('Depth testing requires a depth render target');
    const clip = camera.clipMatrix(width, height);
    const used = new Set<Mesh3D>(),
      draws: ColorDraw[] = [];
    root.traverse((node, world) => {
      if (!node.mesh || !node.mesh.geometry.faces.length) return;
      const material =
        node.mesh.materials[node.mesh.geometry.faces[0]!.material]!;
      const texture = material.baseColorTexture,
        metallicRoughnessTexture = material.metallicRoughnessTexture,
        occlusionTexture = material.occlusionTexture,
        normalTexture = material.normalTexture;
      used.add(node.mesh);
      let mesh = this.#cache.get(node.mesh);
      if (!mesh) {
        if (
          node.mesh.geometry.faces.some(
            (f) =>
              (node.mesh!.materials[f.material]!.unlit ?? false) !==
              (material.unlit ?? false),
          )
        )
          throw new Error(
            'Split lit and unlit materials into separate primitives',
          );
        for (const key of [
          'baseColorTexture',
          'metallicRoughnessTexture',
          'occlusionTexture',
          'normalTexture',
        ] as const) {
          const first = material[key];
          for (const face of node.mesh.geometry.faces) {
            const binding = node.mesh.materials[face.material]![key];
            if (
              binding?.image !== first?.image ||
              binding?.filter !== first?.filter ||
              binding?.wrapS !== first?.wrapS ||
              binding?.wrapT !== first?.wrapT
            )
              throw new Error(
                'Split meshes with different texture bindings into separate primitives',
              );
          }
        }
        if (
          normalTexture &&
          (!this.#normalMapping ||
            node.mesh.geometry.normals.length !==
              node.mesh.geometry.vertices.length ||
            node.mesh.geometry.tangents.length !==
              node.mesh.geometry.vertices.length)
        )
          throw new Error(
            'Normal maps require enabled pipeline, vertex normals and tangents',
          );
        if (
          this.#normalMapping &&
          node.mesh.geometry.faces.some(
            (f) =>
              (node.mesh!.materials[f.material]!.normalScale ?? 1) !==
              (material.normalScale ?? 1),
          )
        )
          throw new Error(
            'Split different normal scales into separate primitives',
          );
        if (
          this.#materialMaps &&
          node.mesh.geometry.faces.some(
            (f) =>
              (node.mesh!.materials[f.material]!.occlusionStrength ?? 1) !==
              (material.occlusionStrength ?? 1),
          )
        )
          throw new Error(
            'Split different occlusion strengths into separate primitives',
          );
        if (
          (metallicRoughnessTexture || occlusionTexture) &&
          !this.#materialMaps
        )
          throw new Error('Material-map pipeline is not enabled');
        if (
          (texture ||
            metallicRoughnessTexture ||
            occlusionTexture ||
            normalTexture) &&
          (!this.#textures ||
            node.mesh.geometry.texCoords.length !==
              node.mesh.geometry.vertices.length)
        )
          throw new Error(
            'Textured meshes require texture pipeline and UV coordinates',
          );
        mesh = this.#renderer.upload(
          meshColorVertices(
            node.mesh,
            this.#lighting,
            this.#materialResponse,
            this.#normalMapping,
          ),
        );
        this.#cache.set(node.mesh, mesh);
      }
      draws.push({
        mesh,
        unlit: material.unlit ?? false,
        castsShadow: node.castsShadow,
        receivesShadow: node.receivesShadow,
        transform: multiplyMatrices(clip, world),
        world,
        ...(texture ? { texture } : {}),
        ...(normalTexture ? { normalTexture } : {}),
        ...(material.normalScale !== undefined
          ? { normalScale: material.normalScale }
          : {}),
        ...(metallicRoughnessTexture ? { metallicRoughnessTexture } : {}),
        ...(occlusionTexture ? { occlusionTexture } : {}),
        ...(material.occlusionStrength !== undefined
          ? { occlusionStrength: material.occlusionStrength }
          : {}),
      });
    });
    for (const [source, mesh] of this.#cache) {
      if (used.has(source)) continue;
      mesh.dispose();
      this.#cache.delete(source);
    }
    if (options.reverseOrder) draws.reverse();
    const triangles = this.#renderer.drawFrame(
      draws,
      options.depthTest ?? true,
      {
        ...(options.target ? { target: options.target } : {}),
        ...(options.clearColor ? { clearColor: options.clearColor } : {}),
        lights: options.lights ?? [],
        enabled: options.lightingEnabled ?? true,
        cameraPosition: { x: camera.x, y: camera.y, z: camera.z },
        materialResponseEnabled: options.materialResponseEnabled ?? true,
        materialDebug: options.materialDebug ?? 'none',
        normalMappingEnabled: options.normalMappingEnabled ?? true,
        normalDebug: options.normalDebug ?? false,
        ...(options.environment ? { environment: options.environment } : {}),
        ...(options.shadow ? { shadow: options.shadow } : {}),
        shadowDebug: options.shadowDebug ?? false,
      },
    );
    return {
      drawCalls: draws.length,
      triangles,
      cachedMeshes: this.#cache.size,
      uploadedBytes: [...this.#cache.values()].reduce(
        (sum, m) =>
          sum +
          m.vertexCount *
            ((this.#textures ? 56 : this.#lighting ? 48 : 24) +
              (this.#materialResponse ? 8 : 0) +
              (this.#normalMapping ? 16 : 0)),
        0,
      ),
    };
  }

  get shadowStats() {
    return this.#renderer.shadowStats;
  }
  get environmentStats() {
    return this.#renderer.environmentStats;
  }
  get textureUploadStats() {
    return this.#renderer.textureUploadStats;
  }
  get textureStats() {
    return this.#renderer.textureStats;
  }

  /** Diagnostic synchronous readback; exclude from performance comparisons. */
  readPixel(x: number, y: number): readonly number[] {
    return this.#renderer.readPixel(x, y);
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#cache.clear();
    this.#renderer.dispose();
  }
}
