import { validateScreenDoor } from '../3d/Mesh3D.js';
import type { ScreenDoor3D } from '../3d/Mesh3D.js';
import { WebGLSkyBackgroundPass } from './SkyBackgroundPass.js';
import type { SkyBackgroundView } from '../3d/SkyBackground.js';
import type { WebGLRenderTarget } from './RenderTarget.js';
import { WebGLShadowPass } from './ShadowPass.js';
import { shadowFragmentSource } from './ShadowShader.js';
import { validateDirectionalShadow } from '../3d/DirectionalShadow.js';
import type { DirectionalShadow3D } from '../3d/DirectionalShadow.js';
import { WebGLEnvironmentStore, blackEnvironment } from './EnvironmentStore.js';
import { EnvironmentMap } from '../3d/EnvironmentMap.js';
import type { EnvironmentLight3D } from '../3d/EnvironmentMap.js';
import {
  materialVertexSource,
  materialFragmentSource,
} from './MaterialShader.js';
import { WebGLTextureStore } from './TextureStore.js';
import type { TextureBinding3D } from '../3d/TextureImage.js';
import {
  texturedVertexSource,
  texturedFragmentSource,
} from './LightingShader.js';
import { normalMatrix, linearDeterminant } from '../3d/NormalMatrix.js';
import type { Light3D } from '../3d/Lighting3D.js';
import { lightUniforms } from './LightUniforms.js';
import { litVertexSource, litFragmentSource } from './LightingShader.js';
import type { Matrix4, Vec3, LinearColor } from '../3d/index.js';
import { identityMatrix } from '../3d/Matrix4.js';

export interface ColorVertex {
  readonly position: Vec3;
  readonly color: LinearColor;
  readonly normal?: Vec3;
  readonly emission?: LinearColor;
  readonly texCoord?: readonly [number, number];
  /** Metallic then perceptual roughness, both 0..1. */
  readonly materialFactors?: readonly [number, number];
  readonly tangent?: readonly [number, number, number, number];
}
/** Context-local immutable GPU triangle list. Renderer owns the allocations. */
export interface ColorMesh {
  readonly vertexCount: number;
  dispose(): undefined;
}
const vertexSource = `#version 300 es
layout(location=0) in vec3 position;
layout(location=1) in vec3 color;
uniform mat4 transform;
out vec3 linearColor;
void main(){gl_Position=transform*vec4(position,1.0);linearColor=color;}`;
const fragmentSource = `#version 300 es
precision highp float;
in vec3 linearColor;
out vec4 pixel;
void main(){
  vec3 c=clamp(linearColor,0.0,1.0);
  vec3 srgb=mix(1.055*pow(c,vec3(1.0/2.4))-0.055,12.92*c,lessThanEqual(c,vec3(0.0031308)));
  pixel=vec4(srgb,1.0);
}`;
export interface ColorDraw {
  /** Straight alpha. Caller orders translucent draws back-to-front. */
  readonly opacity?: number;
  readonly unlit?: boolean;
  readonly screenDoor?: ScreenDoor3D;
  readonly mesh: ColorMesh;
  readonly transform: Matrix4;
  readonly world?: Matrix4;
  readonly texture?: TextureBinding3D;
  readonly metallicRoughnessTexture?: TextureBinding3D;
  readonly occlusionTexture?: TextureBinding3D;
  readonly occlusionStrength?: number;
  readonly normalTexture?: TextureBinding3D;
  readonly normalScale?: number;
  readonly castsShadow?: boolean;
  readonly receivesShadow?: boolean;
}
interface Allocation {
  readonly vao: WebGLVertexArrayObject;
  readonly buffer: WebGLBuffer;
  readonly hasTangents: boolean;
}
/** Optional WebGL2 color pipeline. Exclusive GL state ownership; caller supplies canvas/context and frame timing. */
export class WebGLColorRenderer {
  #program: WebGLProgram;
  #transform: WebGLUniformLocation;
  #opacity: WebGLUniformLocation;
  #screenDoor?: WebGLUniformLocation;
  #meshes = new Map<ColorMesh, Allocation>();
  #disposed = false;
  #skyPass: WebGLSkyBackgroundPass | undefined;
  readonly #lighting: boolean;
  readonly #textures: boolean;
  readonly #materialResponse: boolean;
  readonly #materialMaps: boolean;
  readonly #normalMapping: boolean;
  #textureStore?: WebGLTextureStore;
  readonly #shadows: boolean;
  #shadowPass?: WebGLShadowPass;
  readonly #environment: boolean;
  #environmentStore?: WebGLEnvironmentStore;
  #textureUniform?: WebGLUniformLocation;
  #litUniforms: Record<string, WebGLUniformLocation> = {};
  constructor(
    readonly gl: WebGL2RenderingContext,
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
    this.#shadows = options.shadows ?? false;
    if (this.#shadows && !options.lighting)
      throw new Error('Shadows require lighting support');
    this.#environment = options.environment ?? false;
    if (this.#environment && !options.materialResponse)
      throw new Error('Environment lighting requires material response');
    this.#lighting = options.lighting ?? false;
    this.#textures = options.textures ?? false;
    this.#materialResponse = options.materialResponse ?? false;
    this.#materialMaps = options.materialMaps ?? false;
    this.#normalMapping = options.normalMapping ?? false;
    if (this.#normalMapping && (!this.#materialResponse || !this.#textures))
      throw new Error(
        'Normal mapping requires texture and material-response pipelines',
      );
    if (this.#materialMaps && (!this.#materialResponse || !this.#textures))
      throw new Error(
        'Material maps require texture and material-response pipelines',
      );
    if (this.#materialResponse && !this.#lighting)
      throw new Error('Material response requires lighting support');
    if (this.#textures && !this.#lighting)
      throw new Error('Texture pipeline requires lighting support');
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null;
    try {
      for (const [kind, source] of [
        [
          gl.VERTEX_SHADER,
          this.#materialResponse
            ? materialVertexSource(this.#textures, this.#normalMapping)
            : this.#textures
              ? texturedVertexSource
              : this.#lighting
                ? litVertexSource
                : vertexSource,
        ],
        [
          gl.FRAGMENT_SHADER,
          this.#materialResponse
            ? materialFragmentSource(
                this.#textures,
                this.#materialMaps,
                this.#normalMapping,
                this.#environment,
              )
            : this.#textures
              ? texturedFragmentSource
              : this.#lighting
                ? litFragmentSource
                : fragmentSource,
        ],
      ] as const) {
        const shader = gl.createShader(kind);
        if (!shader) throw new Error('WebGL shader allocation failed');
        shaders.push(shader);
        let code =
          kind === gl.FRAGMENT_SHADER && this.#shadows
            ? shadowFragmentSource(source, this.#materialResponse)
            : source;
        if (kind === gl.FRAGMENT_SHADER) {
          code =
            code.replace('void main()', 'void surfaceMain()') +
            '\nuniform float drawOpacity;\n' +
            (this.#textures
              ? `
uniform vec3 screenDoor;
float wireCoverage(){
  vec2 cell=uv*screenDoor.xy;
  vec2 footprint=max(fwidth(cell),vec2(0.0001));
  float aperture=sqrt(1.0-screenDoor.z)*0.5;
  vec2 hole=1.0-smoothstep(vec2(aperture)-footprint*0.5,vec2(aperture)+footprint*0.5,abs(fract(cell)-0.5));
  float resolved=1.0-smoothstep(0.3,1.0,max(footprint.x,footprint.y));
  return mix(screenDoor.z,1.0-hole.x*hole.y,resolved);
}
void main(){surfaceMain();pixel.a*=drawOpacity*(screenDoor.z>0.0 ? wireCoverage() : 1.0);}`
              : 'void main(){surfaceMain();pixel.a*=drawOpacity;}');
        }
        gl.shaderSource(shader, code);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(
            `WebGL shader compilation failed: ${gl.getShaderInfoLog(shader) ?? 'no diagnostic'}`,
          );
      }
      program = gl.createProgram();
      if (!program) throw new Error('WebGL program allocation failed');
      shaders.forEach((s) => gl.attachShader(program!, s));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(
          `WebGL program linking failed: ${gl.getProgramInfoLog(program) ?? 'no diagnostic'}`,
        );
      const opacity = gl.getUniformLocation(program, 'drawOpacity');
      if (opacity === null) throw new Error('Missing opacity uniform');
      this.#opacity = opacity;
      if (this.#textures) {
        const coverage = gl.getUniformLocation(program, 'screenDoor');
        if (coverage === null) throw new Error('Missing screen-door uniform');
        this.#screenDoor = coverage;
      }
      const transform = gl.getUniformLocation(program, 'transform');
      if (transform === null) throw new Error('Missing transform uniform');
      if (this.#lighting) {
        for (const name of [
          'world',
          'normalTransform',
          'lightingEnabled',
          'lightCount',
          'lightVectors[0]',
          'lightColors[0]',
          'lightMinimums[0]',
        ]) {
          const location = gl.getUniformLocation(program, name);
          if (location === null)
            throw new Error(`Missing lighting uniform ${name}`);
          this.#litUniforms[name] = location;
        }
      }
      if (this.#materialResponse) {
        for (const name of ['cameraPosition', 'materialResponseEnabled']) {
          const location = gl.getUniformLocation(program, name);
          if (location === null)
            throw new Error(`Missing material uniform ${name}`);
          this.#litUniforms[name] = location;
        }
      }
      if (this.#materialMaps) {
        for (const name of [
          'metallicRoughnessMap',
          'occlusionMap',
          'occlusionStrength',
          'materialDebug',
        ]) {
          const location = gl.getUniformLocation(program, name);
          if (location === null)
            throw new Error(`Missing material-map uniform ${name}`);
          this.#litUniforms[name] = location;
        }
      }
      if (this.#normalMapping) {
        for (const name of [
          'worldHandedness',
          'normalMap',
          'normalScale',
          'normalMapEnabled',
          'normalDebug',
        ]) {
          const location = gl.getUniformLocation(program, name);
          if (location === null)
            throw new Error(`Missing normal-map uniform ${name}`);
          this.#litUniforms[name] = location;
        }
      }
      if (this.#environment) {
        for (const name of [
          'environmentSpecular',
          'environmentDiffuse',
          'environmentBrdf',
          'environmentIntensity',
          'environmentRotation',
          'environmentMaxLod',
        ]) {
          const location = gl.getUniformLocation(program, name);
          if (location === null)
            throw new Error(`Missing environment uniform ${name}`);
          this.#litUniforms[name] = location;
        }
        this.#environmentStore = new WebGLEnvironmentStore(gl);
      }
      if (this.#textures) {
        const location = gl.getUniformLocation(program, 'baseColorMap');
        if (location === null) throw new Error('Missing baseColorMap uniform');
        this.#textureUniform = location;
        this.#textureStore = new WebGLTextureStore(gl);
      }
      if (this.#shadows) {
        for (const name of [
          'shadowDepth',
          'shadowMatrix',
          'shadowLightIndex',
          'shadowBias',
          'shadowSlopeBias',
          'shadowTexel',
          'shadowPcf',
          'receiveShadow',
          'shadowDebug',
        ]) {
          const location = gl.getUniformLocation(program, name);
          if (location === null)
            throw new Error(`Missing shadow uniform ${name}`);
          this.#litUniforms[name] = location;
        }
        this.#shadowPass = new WebGLShadowPass(gl);
      }
      this.#program = program;
      this.#transform = transform;
    } catch (error) {
      this.#textureStore?.dispose();
      this.#environmentStore?.dispose();
      this.#shadowPass?.dispose();
      if (program) {
        shaders.forEach((s) => gl.detachShader(program!, s));
        gl.deleteProgram(program);
        program = null;
      }
      throw error;
    } finally {
      shaders.forEach((s) => {
        if (program) gl.detachShader(program, s);
        gl.deleteShader(s);
      });
    }
  }
  #live(): void {
    if (this.#disposed) throw new Error('WebGL renderer is disposed');
    if (this.gl.isContextLost()) throw new Error('WebGL context is lost');
  }
  upload(vertices: readonly ColorVertex[]): ColorMesh {
    this.#live();
    if (!vertices.length || vertices.length % 3)
      throw new Error(
        'Triangle lists require a positive multiple of three vertices',
      );
    const stride =
      (this.#textures ? 14 : this.#lighting ? 12 : 6) +
      (this.#materialResponse ? 2 : 0) +
      (this.#normalMapping ? 4 : 0);
    const data = new Float32Array(vertices.length * stride);
    Array.from(vertices, (v, i) => {
      if (
        !v ||
        !v.position ||
        ![v.position.x, v.position.y, v.position.z].every(Number.isFinite) ||
        v.color.length !== 3 ||
        !Array.from(v.color).every(
          (c) => Number.isFinite(c) && c >= 0 && c <= 1,
        )
      )
        throw new Error('Invalid color vertex');
      const extra: number[] = [];
      if (this.#lighting) {
        const n = v.normal,
          emission = v.emission ?? [0, 0, 0];
        if (
          !n ||
          ![n.x, n.y, n.z].every(Number.isFinite) ||
          emission.length !== 3 ||
          !Array.from(emission).every(
            (c) => Number.isFinite(c) && c >= 0 && c <= 1,
          )
        )
          throw new Error('Invalid lit vertex');
        extra.push(n.x, n.y, n.z, ...emission);
      }
      if (this.#textures) {
        const uv = v.texCoord ?? [0, 0];
        if (uv.length !== 2 || !Array.from(uv).every(Number.isFinite))
          throw new Error('Invalid texture coordinate');
        extra.push(...uv);
      }
      if (this.#materialResponse) {
        const factors = v.materialFactors ?? [1, 1];
        if (
          factors.length !== 2 ||
          !Array.from(factors).every(
            (v) => Number.isFinite(v) && v >= 0 && v <= 1,
          )
        )
          throw new Error('Invalid metallic/roughness factors');
        extra.push(...factors);
      }
      if (this.#normalMapping) {
        const t = v.tangent,
          tangentLength = t ? Math.hypot(t[0], t[1], t[2]) : 1;
        if (t) {
          const n = v.normal!,
            nl = Math.hypot(n.x, n.y, n.z),
            tl = Math.hypot(t[0], t[1], t[2]);
          if (
            t.length !== 4 ||
            !Array.from(t).every(Number.isFinite) ||
            !tl ||
            !nl ||
            Math.abs(t[3]) !== 1 ||
            Math.abs((n.x * t[0] + n.y * t[1] + n.z * t[2]) / (nl * tl)) > 1e-3
          )
            throw new Error('Invalid orthogonal tangent basis');
        }
        extra.push(
          ...(t
            ? [
                t[0] / tangentLength,
                t[1] / tangentLength,
                t[2] / tangentLength,
                t[3],
              ]
            : [0, 0, 0, 1]),
        );
      }
      data.set(
        [v.position.x, v.position.y, v.position.z, ...v.color, ...extra],
        i * stride,
      );
      if (
        !Array.from(data.subarray(i * stride, (i + 1) * stride)).every(
          Number.isFinite,
        )
      )
        throw new Error('Vertex exceeds Float32 range');
    });
    const gl = this.gl,
      vao = gl.createVertexArray(),
      buffer = gl.createBuffer();
    if (!vao || !buffer) {
      if (vao) gl.deleteVertexArray(vao);
      if (buffer) gl.deleteBuffer(buffer);
      throw new Error('WebGL mesh allocation failed');
    }
    try {
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      if (this.#textures) {
        gl.enableVertexAttribArray(4);
        gl.vertexAttribPointer(4, 2, gl.FLOAT, false, stride * 4, 48);
      }
      if (this.#materialResponse) {
        gl.enableVertexAttribArray(5);
        gl.vertexAttribPointer(
          5,
          2,
          gl.FLOAT,
          false,
          stride * 4,
          this.#textures ? 56 : 48,
        );
      }
      if (this.#normalMapping) {
        gl.enableVertexAttribArray(6);
        gl.vertexAttribPointer(6, 4, gl.FLOAT, false, stride * 4, 64);
      }
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, stride * 4, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, stride * 4, 12);
      if (this.#lighting) {
        gl.enableVertexAttribArray(2);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, stride * 4, 24);
        gl.enableVertexAttribArray(3);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, stride * 4, 36);
      }
    } catch (error) {
      gl.deleteBuffer(buffer);
      gl.deleteVertexArray(vao);
      throw error;
    } finally {
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }
    const mesh: ColorMesh = Object.freeze({
      vertexCount: vertices.length,
      dispose: (): undefined => {
        const allocation = this.#meshes.get(mesh);
        if (!allocation) return;
        this.#meshes.delete(mesh);
        gl.deleteBuffer(allocation.buffer);
        gl.deleteVertexArray(allocation.vao);
        return;
      },
    });
    this.#meshes.set(mesh, {
      vao,
      buffer,
      hasTangents: vertices.every((v) => !!v.tangent),
    });
    return mesh;
  }
  /** Full-frame opaque unlit pass. Positions transform to homogeneous clip space. */
  draw(mesh: ColorMesh, transform: Matrix4 = identityMatrix): number {
    return this.drawFrame([{ mesh, transform }], false);
  }
  /** Clears once; opaque draws first, then caller-ordered translucent draws. GPU performs clipping and depth testing. */
  drawFrame(
    draws: readonly ColorDraw[],
    depthTest = true,
    lighting: {
      readonly target?: WebGLRenderTarget;
      readonly clearColor?: readonly [number, number, number];
      readonly background?: SkyBackgroundView;
      readonly lights: readonly Light3D[];
      readonly enabled?: boolean;
      readonly cameraPosition?: Vec3;
      readonly materialResponseEnabled?: boolean;
      readonly materialDebug?: 'none' | 'occlusion' | 'roughness' | 'metallic';
      readonly normalMappingEnabled?: boolean;
      readonly normalDebug?: boolean;
      readonly environment?: EnvironmentLight3D;
      readonly shadow?: DirectionalShadow3D;
      readonly shadowDebug?: boolean;
    } = { lights: [] },
  ): number {
    this.#live();
    const clearColor = lighting.clearColor ?? [0.035, 0.06, 0.095];
    if (
      clearColor.length !== 3 ||
      !clearColor.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)
    )
      throw new RangeError(
        'Clear color must contain three finite channels in 0..1',
      );
    if (lighting.background) {
      this.#skyPass ??= new WebGLSkyBackgroundPass(this.gl);
      this.#skyPass.validate(lighting.background);
    } else if (this.#skyPass) {
      this.#skyPass.dispose();
      this.#skyPass = undefined;
    }
    lighting.target?.assertContext(this.gl);
    if (lighting.target && depthTest && !lighting.target.hasDepth)
      throw new Error('Depth testing requires a depth render target');
    if (
      this.#materialResponse &&
      (!lighting.cameraPosition ||
        ![
          lighting.cameraPosition.x,
          lighting.cameraPosition.y,
          lighting.cameraPosition.z,
        ].every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6))
    )
      throw new Error(
        'Material response requires finite camera position within +/-1000000',
      );
    const environment = lighting.environment;
    if (
      environment &&
      (!this.#environment ||
        !(environment.map instanceof EnvironmentMap) ||
        !Number.isFinite(environment.intensity ?? 1) ||
        (environment.intensity ?? 1) < 0 ||
        (environment.intensity ?? 1) > 100 ||
        !Number.isFinite(environment.rotation ?? 0) ||
        Math.abs(environment.rotation ?? 0) > 1e6)
    )
      throw new Error('Invalid environment light or disabled pipeline');
    // Validate before sorting or touching GL state. Preserve caller order within each pass.
    for (const draw of draws) {
      const opacity = draw.opacity ?? 1;
      if (draw.screenDoor) {
        if (!this.#textures)
          throw new Error('Screen-door coverage requires the texture pipeline');
        validateScreenDoor(draw.screenDoor);
      }
      if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1)
        throw new Error('Draw opacity must be finite in 0..1');
    }
    const translucent = draws.filter(
      (d) => ((d.opacity ?? 1) < 1 || d.screenDoor) && (d.opacity ?? 1) > 0,
    );
    const blending = translucent.length > 0;
    draws = [
      ...draws.filter((d) => (d.opacity ?? 1) === 1 && !d.screenDoor),
      ...translucent,
    ];
    const shadow = lighting.shadow;
    if (shadow) {
      if (!this.#shadows) throw new Error('Shadow pipeline is not enabled');
      validateDirectionalShadow(shadow, lighting.lights);
    }
    if (lighting.shadowDebug && !this.#shadows)
      throw new Error('Shadow debug requires shadow pipeline');
    const uniforms = this.#lighting ? lightUniforms(lighting.lights) : null;
    const normals = this.#lighting
      ? draws.map((d) => normalMatrix(d.world ?? identityMatrix))
      : [];
    const debug = (
      ['none', 'occlusion', 'roughness', 'metallic'] as const
    ).indexOf(lighting.materialDebug ?? 'none');
    if (debug < 0 || (debug !== 0 && !this.#materialMaps))
      throw new Error('Material channel view requires material maps');
    if (lighting.normalDebug && !this.#normalMapping)
      throw new Error('Normal debug requires normal mapping pipeline');
    // Validate the whole pass before changing GL state.
    for (const {
      mesh,
      transform,
      texture,
      metallicRoughnessTexture,
      occlusionTexture,
      occlusionStrength,
      normalTexture,
      normalScale,
    } of draws) {
      if (
        normalTexture &&
        (!this.#normalMapping || !this.#meshes.get(mesh)?.hasTangents)
      )
        throw new Error(
          'Normal maps require enabled pipeline and tangent basis',
        );
      if (
        normalScale !== undefined &&
        (!Number.isFinite(normalScale) || Math.abs(normalScale) > 1e6)
      )
        throw new Error('Invalid normal scale');
      if ((metallicRoughnessTexture || occlusionTexture) && !this.#materialMaps)
        throw new Error('Material-map pipeline is not enabled');
      if (
        occlusionStrength !== undefined &&
        (!Number.isFinite(occlusionStrength) ||
          occlusionStrength < 0 ||
          occlusionStrength > 1)
      )
        throw new Error('Invalid occlusion strength');
      if (texture && !this.#textures)
        throw new Error('Texture pipeline is not enabled');
      if (!this.#meshes.has(mesh))
        throw new Error('Mesh is disposed or belongs to another renderer');
      if (
        transform.length !== 16 ||
        !Array.from(transform).every(
          (v) => Number.isFinite(v) && Math.abs(v) <= 3.4028234663852886e38,
        )
      )
        throw new Error('Transform must be Float32-finite');
    }
    const gl = this.gl;
    this.#shadowPass?.render(
      draws
        .filter((d) => (d.opacity ?? 1) === 1 && !d.screenDoor)
        .map((d) => ({
          vao: this.#meshes.get(d.mesh)!.vao,
          vertexCount: d.mesh.vertexCount,
          ...(d.world ? { world: d.world } : {}),
          ...(d.castsShadow !== undefined
            ? { castsShadow: d.castsShadow }
            : {}),
        })),
      shadow,
    );
    if (lighting.target) lighting.target.bind(gl);
    else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
    gl.disable(gl.SCISSOR_TEST);
    if (depthTest) gl.enable(gl.DEPTH_TEST);
    else gl.disable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);
    gl.depthRange(0, 1);
    gl.clearDepth(1);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.colorMask(true, true, true, true);
    gl.clearColor(clearColor[0]!, clearColor[1]!, clearColor[2]!, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (lighting.background) {
      this.#skyPass!.render(lighting.background);
      if (depthTest) gl.enable(gl.DEPTH_TEST);
    }
    gl.useProgram(this.#program);
    if (uniforms) {
      gl.uniform1i(
        this.#litUniforms.lightingEnabled!,
        (lighting.enabled ?? true) ? 1 : 0,
      );
      gl.uniform1i(this.#litUniforms.lightCount!, uniforms.count);
      gl.uniform4fv(this.#litUniforms['lightVectors[0]']!, uniforms.vectors);
      gl.uniform4fv(this.#litUniforms['lightColors[0]']!, uniforms.colors);
      gl.uniform1fv(this.#litUniforms['lightMinimums[0]']!, uniforms.minimums);
    }
    if (this.#materialResponse) {
      const eye = lighting.cameraPosition!;
      gl.uniform3f(this.#litUniforms.cameraPosition!, eye.x, eye.y, eye.z);
      gl.uniform1i(
        this.#litUniforms.materialResponseEnabled!,
        (lighting.materialResponseEnabled ?? true) ? 1 : 0,
      );
    }
    if (this.#materialMaps) {
      gl.uniform1i(this.#litUniforms.metallicRoughnessMap!, 1);
      gl.uniform1i(this.#litUniforms.occlusionMap!, 2);
      gl.uniform1i(this.#litUniforms.materialDebug!, debug);
    }
    if (this.#normalMapping) {
      gl.uniform1i(this.#litUniforms.normalMap!, 3);
      gl.uniform1i(
        this.#litUniforms.normalDebug!,
        lighting.normalDebug ? 1 : 0,
      );
    }
    this.#textureStore?.begin();
    if (this.#textureUniform) gl.uniform1i(this.#textureUniform, 0);
    let triangles = lighting.background ? 1 : 0;
    try {
      if (this.#shadowPass) {
        this.#shadowPass.bind();
        gl.uniform1i(this.#litUniforms.shadowDepth!, 7);
        gl.uniformMatrix4fv(
          this.#litUniforms.shadowMatrix!,
          false,
          new Float32Array(shadow?.matrix ?? identityMatrix),
        );
        gl.uniform1i(
          this.#litUniforms.shadowLightIndex!,
          shadow && (shadow.enabled ?? true) ? shadow.lightIndex : -1,
        );
        gl.uniform1f(this.#litUniforms.shadowBias!, shadow?.bias ?? 0.001);
        gl.uniform1f(
          this.#litUniforms.shadowSlopeBias!,
          shadow?.slopeBias ?? 0.002,
        );
        gl.uniform1f(
          this.#litUniforms.shadowTexel!,
          1 / this.#shadowPass.stats.resolution,
        );
        gl.uniform1i(
          this.#litUniforms.shadowPcf!,
          (shadow?.filter ?? 'pcf') === 'pcf' ? 1 : 0,
        );
        gl.uniform1i(
          this.#litUniforms.shadowDebug!,
          lighting.shadowDebug ? 1 : 0,
        );
      }
      if (this.#environmentStore) {
        const source = environment?.map ?? blackEnvironment;
        this.#environmentStore.bind(source);
        gl.uniform1i(this.#litUniforms.environmentSpecular!, 4);
        gl.uniform1i(this.#litUniforms.environmentDiffuse!, 5);
        gl.uniform1i(this.#litUniforms.environmentBrdf!, 6);
        gl.uniform1f(
          this.#litUniforms.environmentIntensity!,
          environment ? (environment.intensity ?? 1) : 0,
        );
        gl.uniform1f(
          this.#litUniforms.environmentRotation!,
          environment?.rotation ?? 0,
        );
        gl.uniform1f(
          this.#litUniforms.environmentMaxLod!,
          source.specular.length - 1,
        );
      }
      for (const [
        index,
        {
          mesh,
          transform,
          world,
          texture,
          metallicRoughnessTexture,
          occlusionTexture,
          occlusionStrength,
          normalTexture,
          normalScale,
          receivesShadow,
          unlit,
          opacity = 1,
          screenDoor,
        },
      ] of draws.entries()) {
        if (opacity < 1 || screenDoor) {
          gl.enable(gl.BLEND);
          gl.blendEquation(gl.FUNC_ADD);
          gl.blendFuncSeparate(
            gl.SRC_ALPHA,
            gl.ONE_MINUS_SRC_ALPHA,
            gl.ONE,
            gl.ONE_MINUS_SRC_ALPHA,
          );
          gl.depthMask(false);
        }
        gl.uniform1f(this.#opacity, opacity);
        if (this.#screenDoor)
          gl.uniform3fv(
            this.#screenDoor,
            screenDoor
              ? [screenDoor.repeat[0], screenDoor.repeat[1], screenDoor.fill]
              : [1, 1, 0],
          );
        if (this.#lighting)
          gl.uniform1i(
            this.#litUniforms.lightingEnabled!,
            !unlit && (lighting.enabled ?? true) ? 1 : 0,
          );
        if (this.#materialMaps)
          gl.uniform1i(this.#litUniforms.materialDebug!, unlit ? 0 : debug);
        if (this.#normalMapping)
          gl.uniform1i(
            this.#litUniforms.normalDebug!,
            !unlit && lighting.normalDebug ? 1 : 0,
          );
        gl.bindVertexArray(this.#meshes.get(mesh)!.vao);
        gl.uniformMatrix4fv(
          this.#transform,
          false,
          new Float32Array(transform),
        );
        if (this.#lighting) {
          gl.uniformMatrix4fv(
            this.#litUniforms.world!,
            false,
            new Float32Array(world ?? identityMatrix),
          );
          gl.uniformMatrix3fv(
            this.#litUniforms.normalTransform!,
            false,
            new Float32Array(normals[index]!),
          );
        }
        this.#textureStore?.bind(texture);
        if (this.#materialMaps) {
          this.#textureStore!.bind(metallicRoughnessTexture, 1, 'linear');
          this.#textureStore!.bind(occlusionTexture, 2, 'linear');
          gl.uniform1f(
            this.#litUniforms.occlusionStrength!,
            occlusionStrength ?? 1,
          );
        }
        if (this.#normalMapping) {
          gl.uniform1f(
            this.#litUniforms.worldHandedness!,
            Math.sign(linearDeterminant(world ?? identityMatrix)),
          );
          gl.uniform1f(this.#litUniforms.normalScale!, normalScale ?? 1);
          gl.uniform1i(
            this.#litUniforms.normalMapEnabled!,
            normalTexture && (lighting.normalMappingEnabled ?? true) ? 1 : 0,
          );
          this.#textureStore!.bind(normalTexture, 3, 'linear');
        }
        if (this.#shadowPass)
          gl.uniform1i(
            this.#litUniforms.receiveShadow!,
            receivesShadow === false ? 0 : 1,
          );
        gl.drawArrays(gl.TRIANGLES, 0, mesh.vertexCount);
        triangles += mesh.vertexCount / 3;
      }
    } finally {
      if (blending) {
        gl.disable(gl.BLEND);
        gl.depthMask(true);
      }
      this.#textureStore?.end();
      this.#environmentStore?.end();
      this.#shadowPass?.unbind();
      gl.bindVertexArray(null);
      gl.useProgram(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    return triangles;
  }
  /** Diagnostic only; synchronous readback can stall the GPU. Call directly after draw. Bottom-left origin. */
  readPixel(x: number, y: number): readonly number[] {
    this.#live();
    const gl = this.gl;
    if (
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x >= gl.drawingBufferWidth ||
      y >= gl.drawingBufferHeight
    )
      throw new RangeError('Pixel outside drawing buffer');
    const rgba = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    return [...rgba];
  }
  get backgroundStats() {
    return this.#skyPass?.stats;
  }
  get shadowStats() {
    return this.#shadowPass?.stats;
  }
  get environmentStats() {
    return this.#environmentStore?.stats;
  }
  get textureUploadStats() {
    return this.#textureStore?.uploadStats;
  }
  get textureStats() {
    return this.#textureStore?.stats;
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const mesh of this.#meshes.keys()) mesh.dispose();
    this.#textureStore?.dispose();
    this.#environmentStore?.dispose();
    this.#shadowPass?.dispose();
    this.#skyPass?.dispose();
    this.gl.deleteProgram(this.#program);
  }
}
