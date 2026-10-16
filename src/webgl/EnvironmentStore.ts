import { EnvironmentMap, bakeEnvironment } from '../3d/EnvironmentMap.js';
import type { CubeFaces } from '../3d/EnvironmentMap.js';
/** One environment per context. Replace atomically; retire on switch/dispose. Units 4..6. */
export class WebGLEnvironmentStore {
  #source: EnvironmentMap | undefined;
  #textures: WebGLTexture[] = [];
  #disposed = false;
  #bytes = 0;
  constructor(readonly gl: WebGL2RenderingContext) {}
  bind(source: EnvironmentMap): void {
    if (this.#disposed || this.gl.isContextLost())
      throw new Error('Environment store unavailable');
    const gl = this.gl;
    if (source !== this.#source) {
      const cubeLimit = gl.getParameter(gl.MAX_CUBE_MAP_TEXTURE_SIZE) as number,
        imageLimit = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      if (
        source.specular[0]![0].width > cubeLimit ||
        source.diffuse[0].width > cubeLimit ||
        source.brdf.width > imageLimit
      )
        throw new Error('Environment exceeds context texture limits');
      const textures: WebGLTexture[] = [];
      let bytes = 0;
      try {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        const create = () => {
          const t = gl.createTexture();
          if (!t) throw new Error('Environment allocation failed');
          textures.push(t);
          return t;
        };
        const cube = (levels: readonly CubeFaces[], unit: number) => {
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindSampler(unit, null);
          gl.bindTexture(gl.TEXTURE_CUBE_MAP, create());
          levels.forEach((faces, level) =>
            faces.forEach((f, i) => {
              gl.texImage2D(
                gl.TEXTURE_CUBE_MAP_POSITIVE_X + i,
                level,
                gl.RGBA8,
                f.width,
                f.height,
                0,
                gl.RGBA,
                gl.UNSIGNED_BYTE,
                f.copyPixels(),
              );
              bytes += f.width * f.height * 4;
            }),
          );
          gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_BASE_LEVEL, 0);
          gl.texParameteri(
            gl.TEXTURE_CUBE_MAP,
            gl.TEXTURE_MAX_LEVEL,
            levels.length - 1,
          );
          gl.texParameteri(
            gl.TEXTURE_CUBE_MAP,
            gl.TEXTURE_MIN_FILTER,
            levels.length > 1 ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR,
          );
          gl.texParameteri(
            gl.TEXTURE_CUBE_MAP,
            gl.TEXTURE_MAG_FILTER,
            gl.LINEAR,
          );
          for (const wrap of [
            gl.TEXTURE_WRAP_S,
            gl.TEXTURE_WRAP_T,
            gl.TEXTURE_WRAP_R,
          ])
            gl.texParameteri(gl.TEXTURE_CUBE_MAP, wrap, gl.CLAMP_TO_EDGE);
        };
        cube(source.specular, 4);
        cube([source.diffuse], 5);
        gl.activeTexture(gl.TEXTURE0 + 6);
        gl.bindSampler(6, null);
        gl.bindTexture(gl.TEXTURE_2D, create());
        const f = source.brdf;
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA8,
          f.width,
          f.height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          f.copyPixels(),
        );
        bytes += f.width * f.height * 4;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      } catch (error) {
        textures.forEach((t) => gl.deleteTexture(t));
        this.end();
        throw error;
      }
      this.#textures.forEach((t) => gl.deleteTexture(t));
      this.#textures = textures;
      this.#source = source;
      this.#bytes = bytes;
    }
    this.#textures.forEach((t, i) => {
      gl.activeTexture(gl.TEXTURE0 + 4 + i);
      gl.bindSampler(4 + i, null);
      gl.bindTexture(i < 2 ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D, t);
    });
  }
  end(): void {
    const gl = this.gl;
    for (let i = 4; i <= 6; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindSampler(i, null);
      gl.bindTexture(i < 6 ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D, null);
    }
    gl.activeTexture(gl.TEXTURE0);
  }
  get stats() {
    return { textures: this.#textures.length, textureBytes: this.#bytes };
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#textures.forEach((t) => this.gl.deleteTexture(t));
    this.#textures = [];
    this.#source = undefined;
    this.#bytes = 0;
  }
}
// Complete black samplers for disabled/unassigned environment pipelines; retained CPU data only.
export const blackEnvironment = bakeEnvironment(() => [0, 0, 0], {
  size: 2,
  diffuseSize: 1,
  lutSize: 2,
  samples: 16,
});
