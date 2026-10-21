import { textureBinding } from './TextureImage.js';
import type { TextureBinding3D } from './TextureImage.js';
import type { Vec3 } from './PerspectiveCamera.js';

export interface GeometryFace {
  readonly id: string;
  /** Convex, planar, counterclockwise as seen from outside. Triangles are supported. */
  readonly indices: readonly number[];
  readonly material: number;
}
export interface ScreenDoor3D {
  /** Cells across the mesh UV domain. */
  readonly repeat: readonly [number, number];
  /** Fraction covered by wires, strictly between 0 and 1. */
  readonly fill: number;
  readonly offset?: readonly [number, number];
}
/** Shared validation at public material and low-level draw boundaries. */
export function validateScreenDoor(pattern: ScreenDoor3D): void {
  if (
    pattern.repeat.length !== 2 ||
    !pattern.repeat.every((v) => Number.isFinite(v) && v > 0 && v <= 1e5) ||
    !Number.isFinite(pattern.fill) ||
    pattern.fill <= 0 ||
    pattern.fill >= 1 ||
    (pattern.offset !== undefined &&
      (pattern.offset.length !== 2 || !pattern.offset.every(Number.isFinite)))
  )
    throw new Error('Invalid screen-door coverage');
}
export interface Material3D {
  readonly color: string;
  /** Post-shading display saturation, 0..1; 1 preserves colour. GPU only. */
  readonly saturation?: number;
  /** WebGL straight-alpha coverage, 0..1; opaque by default. */
  readonly opacity?: number;
  /** GPU surface bypasses illumination; depth and perspective remain active. */
  readonly unlit?: boolean;
  /** Filtered screen-door coverage in UV space; requires the GPU texture pipeline. */
  readonly screenDoor?: ScreenDoor3D;
  readonly baseColorTexture?: TextureBinding3D;
  /** Linear data: green roughness, blue metallic. */
  readonly metallicRoughnessTexture?: TextureBinding3D;
  /** Linear data: red occlusion, applied to indirect diffuse fill only. */
  readonly occlusionTexture?: TextureBinding3D;
  readonly occlusionStrength?: number;
  readonly normalTexture?: TextureBinding3D;
  /** Scales tangent-space X/Y before normalization. */
  readonly normalScale?: number;
  readonly name?: string;
  /** glTF linear factors consumed by optional GPU pipelines; Canvas uses color only. */
  readonly baseColorFactor?: readonly number[];
  readonly metallicFactor?: number;
  readonly roughnessFactor?: number;
  readonly emissiveFactor?: readonly number[];
}

/** Immutable indexed geometry: safe to share across independently placed meshes. */
export class MeshGeometry {
  readonly vertices: readonly Vec3[];
  readonly normals: readonly Vec3[];
  readonly tangents: readonly (readonly [number, number, number, number])[];
  readonly texCoords: readonly (readonly [number, number])[];
  readonly faces: readonly GeometryFace[];
  readonly edges: readonly (readonly [number, number])[];

  constructor(
    vertices: readonly Vec3[],
    faces: readonly GeometryFace[],
    edges: readonly (readonly [number, number])[] = [],
    attributes: {
      normals?: readonly Vec3[];
      tangents?: readonly (readonly [number, number, number, number])[];
      texCoords?: readonly (readonly [number, number])[];
    } = {},
  ) {
    this.vertices = Object.freeze(
      Array.from(vertices, (p) => {
        if (!p || ![p.x, p.y, p.z].every(Number.isFinite))
          throw new Error('Vertices must be finite');
        return Object.freeze({ ...p });
      }),
    );
    this.normals = Object.freeze(
      Array.from(attributes.normals ?? [], (v) => {
        if (!v || ![v.x, v.y, v.z].every(Number.isFinite))
          throw new Error('Invalid normal');
        return Object.freeze({ ...v });
      }),
    );
    this.tangents = Object.freeze(
      Array.from(attributes.tangents ?? [], (t) => {
        if (
          !t ||
          t.length !== 4 ||
          !Array.from(t).every(Number.isFinite) ||
          !Math.hypot(t[0], t[1], t[2]) ||
          Math.abs(t[3]) !== 1
        )
          throw new Error('Invalid tangent');
        return Object.freeze([...t]) as readonly [
          number,
          number,
          number,
          number,
        ];
      }),
    );
    this.texCoords = Object.freeze(
      Array.from(attributes.texCoords ?? [], (v) => {
        if (!v || v.length !== 2 || !Array.from(v).every(Number.isFinite))
          throw new Error('Invalid texture coordinate');
        return Object.freeze([...v]) as readonly [number, number];
      }),
    );
    if (
      (this.normals.length && this.normals.length !== vertices.length) ||
      (this.tangents.length && this.tangents.length !== vertices.length) ||
      (this.texCoords.length && this.texCoords.length !== vertices.length)
    )
      throw new Error('Geometry attribute counts must match vertices');
    const index = (i: number) => {
      if (!Number.isInteger(i) || i < 0 || i >= vertices.length)
        throw new Error('Invalid geometry index');
      return i;
    };
    const ids = new Set<string>();
    this.faces = Object.freeze(
      Array.from(faces, (f) => {
        if (
          !f ||
          f.indices.length < 3 ||
          !Number.isInteger(f.material) ||
          f.material < 0 ||
          ids.has(f.id)
        )
          throw new Error('Invalid geometry face');
        ids.add(f.id);
        return Object.freeze({
          ...f,
          indices: Object.freeze(Array.from(f.indices, index)),
        });
      }),
    );
    this.edges = Object.freeze(
      Array.from(edges, (edge) => {
        if (!edge || edge.length !== 2)
          throw new Error('Invalid geometry edge');
        return Object.freeze([index(edge[0]), index(edge[1])] as const);
      }),
    );
    Object.freeze(this);
  }
}

/** Geometry and surface bindings, separate from a node's placement. */
export class Mesh3D {
  readonly materials: readonly Material3D[];
  constructor(
    readonly geometry: MeshGeometry,
    materials: readonly Material3D[],
  ) {
    this.materials = Object.freeze(
      Array.from(materials, (m) => {
        if (!m || typeof m.color !== 'string' || !m.color)
          throw new Error('Invalid material');
        if (
          m.baseColorTexture &&
          m.baseColorTexture.image.colorSpace !== 'srgb'
        )
          throw new Error('Base color requires sRGB texture data');
        for (const binding of [m.metallicRoughnessTexture, m.occlusionTexture])
          if (binding && binding.image.colorSpace !== 'linear')
            throw new Error('Material maps require linear texture data');
        if (
          m.occlusionStrength !== undefined &&
          (!Number.isFinite(m.occlusionStrength) ||
            m.occlusionStrength < 0 ||
            m.occlusionStrength > 1)
        )
          throw new Error('Invalid occlusion strength');
        if (m.normalTexture && m.normalTexture.image.colorSpace !== 'linear')
          throw new Error('Normal maps require linear texture data');
        if (
          m.normalScale !== undefined &&
          (!Number.isFinite(m.normalScale) || Math.abs(m.normalScale) > 1e6)
        )
          throw new Error('Invalid normal scale');
        if (
          m.opacity !== undefined &&
          (!Number.isFinite(m.opacity) || m.opacity < 0 || m.opacity > 1)
        )
          throw new Error('Material opacity must be finite in 0..1');
        if (m.unlit !== undefined && typeof m.unlit !== 'boolean')
          throw new Error('Invalid unlit material flag');
        if (
          m.saturation !== undefined &&
          (!Number.isFinite(m.saturation) ||
            m.saturation < 0 ||
            m.saturation > 1)
        )
          throw new Error('Material saturation must be finite in 0..1');
        if (m.screenDoor) validateScreenDoor(m.screenDoor);
        return Object.freeze({
          ...m,
          ...(m.screenDoor
            ? {
                screenDoor: Object.freeze({
                  repeat: Object.freeze([...m.screenDoor.repeat]) as readonly [
                    number,
                    number,
                  ],
                  fill: m.screenDoor.fill,
                  ...(m.screenDoor.offset
                    ? {
                        offset: Object.freeze([
                          ...m.screenDoor.offset,
                        ]) as readonly [number, number],
                      }
                    : {}),
                }),
              }
            : {}),
          ...(m.normalTexture
            ? { normalTexture: textureBinding(m.normalTexture) }
            : {}),
          ...(m.metallicRoughnessTexture
            ? {
                metallicRoughnessTexture: textureBinding(
                  m.metallicRoughnessTexture,
                ),
              }
            : {}),
          ...(m.occlusionTexture
            ? { occlusionTexture: textureBinding(m.occlusionTexture) }
            : {}),
          ...(m.baseColorTexture
            ? { baseColorTexture: textureBinding(m.baseColorTexture) }
            : {}),
          ...(m.baseColorFactor
            ? { baseColorFactor: Object.freeze([...m.baseColorFactor]) }
            : {}),
          ...(m.emissiveFactor
            ? { emissiveFactor: Object.freeze([...m.emissiveFactor]) }
            : {}),
        });
      }),
    );
    if (geometry.faces.some((f) => !this.materials[f.material]))
      throw new Error('Missing face material');
    Object.freeze(this);
  }
}
