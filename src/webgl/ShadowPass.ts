import type { DirectionalShadow3D } from '../3d/DirectionalShadow.js';
import type { Matrix4 } from '../3d/Matrix4.js';
import { multiplyMatrices, identityMatrix } from '../3d/Matrix4.js';
export interface ShadowDraw {
  readonly vao: WebGLVertexArrayObject;
  readonly vertexCount: number;
  readonly world?: Matrix4;
  readonly castsShadow?: boolean;
}
/** Context-local depth program, framebuffer and depth texture. Reuses renderer VAOs; no geometry copies. */
export class WebGLShadowPass {
  #program: WebGLProgram;
  #transform: WebGLUniformLocation;
  #texture: WebGLTexture | null = null;
  #framebuffer: WebGLFramebuffer | null = null;
  #size = 0;
  #disposed = false;
  #draws = 0;
  #triangles = 0;
  constructor(readonly gl: WebGL2RenderingContext) {
    const shaders: WebGLShader[] = [];
    let program: WebGLProgram | null = null;
    try {
      for (const [type, source] of [
        [
          gl.VERTEX_SHADER,
          '#version 300 es\nlayout(location=0) in vec3 position; uniform mat4 transform; void main(){gl_Position=transform*vec4(position,1.0);}',
        ],
        [
          gl.FRAGMENT_SHADER,
          '#version 300 es\nprecision highp float; void main(){}',
        ],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Shadow shader allocation failed');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(
            `Shadow shader compile: ${gl.getShaderInfoLog(shader)}`,
          );
      }
      program = gl.createProgram();
      if (!program) throw new Error('Shadow program allocation failed');
      shaders.forEach((s) => gl.attachShader(program!, s));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(
          `Shadow program link: ${gl.getProgramInfoLog(program)}`,
        );
      const transform = gl.getUniformLocation(program, 'transform');
      if (transform === null) throw new Error('Missing shadow transform');
      this.#program = program;
      this.#transform = transform;
    } catch (error) {
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
  #allocate(size: number): void {
    if (size === this.#size) return;
    const gl = this.gl;
    if (size > (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number))
      throw new Error('Shadow resolution exceeds context limit');
    const texture = gl.createTexture(),
      framebuffer = gl.createFramebuffer();
    if (!texture || !framebuffer) {
      if (texture) gl.deleteTexture(texture);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      throw new Error('Shadow allocation failed');
    }
    try {
      gl.activeTexture(gl.TEXTURE0 + 7);
      gl.bindSampler(7, null);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.DEPTH_COMPONENT24,
        size,
        size,
        0,
        gl.DEPTH_COMPONENT,
        gl.UNSIGNED_INT,
        null,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.NONE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.DEPTH_ATTACHMENT,
        gl.TEXTURE_2D,
        texture,
        0,
      );
      gl.drawBuffers([gl.NONE]);
      gl.readBuffer(gl.NONE);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('Incomplete shadow framebuffer');
      gl.viewport(0, 0, size, size);
      gl.disable(gl.SCISSOR_TEST);
      gl.depthMask(true);
      gl.clearDepth(1);
      gl.clear(gl.DEPTH_BUFFER_BIT);
    } catch (error) {
      gl.deleteTexture(texture);
      gl.deleteFramebuffer(framebuffer);
      throw error;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.unbind();
    }
    if (this.#texture) gl.deleteTexture(this.#texture);
    if (this.#framebuffer) gl.deleteFramebuffer(this.#framebuffer);
    this.#texture = texture;
    this.#framebuffer = framebuffer;
    this.#size = size;
  }
  render(draws: readonly ShadowDraw[], shadow?: DirectionalShadow3D): void {
    if (this.#disposed || this.gl.isContextLost())
      throw new Error('Shadow pass unavailable');
    const active = shadow && (shadow.enabled ?? true);
    this.#draws = 0;
    this.#triangles = 0;
    const prepared = active
      ? draws
          .filter((d) => d.castsShadow !== false)
          .map((d) => {
            const matrix = new Float32Array(
              multiplyMatrices(shadow.matrix, d.world ?? identityMatrix),
            );
            if (!Array.from(matrix).every(Number.isFinite))
              throw new Error('Shadow transform must be Float32-finite');
            return { draw: d, matrix };
          })
      : [];
    this.#allocate(active ? (shadow.resolution ?? 512) : this.#size || 1);
    if (!active) return;
    const gl = this.gl;
    try {
      // Remove a prior sampler binding before attaching this texture for writing.
      this.unbind();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
      gl.viewport(0, 0, this.#size, this.#size);
      gl.disable(gl.SCISSOR_TEST);
      gl.disable(gl.BLEND);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.RASTERIZER_DISCARD);
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.depthFunc(gl.LESS);
      gl.depthRange(0, 1);
      gl.clearDepth(1);
      gl.colorMask(false, false, false, false);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.#program);
      for (const { draw: d, matrix } of prepared) {
        gl.bindVertexArray(d.vao);
        gl.uniformMatrix4fv(this.#transform, false, matrix);
        gl.drawArrays(gl.TRIANGLES, 0, d.vertexCount);
        this.#draws++;
        this.#triangles += d.vertexCount / 3;
      }
    } finally {
      gl.bindVertexArray(null);
      gl.useProgram(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.colorMask(true, true, true, true);
    }
  }
  bind(): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + 7);
    gl.bindSampler(7, null);
    gl.bindTexture(gl.TEXTURE_2D, this.#texture);
  }
  unbind(): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + 7);
    gl.bindSampler(7, null);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
  }
  get stats() {
    return {
      resolution: this.#size,
      depthBytes: this.#size * this.#size * 4,
      drawCalls: this.#draws,
      triangles: this.#triangles,
    };
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const gl = this.gl;
    if (this.#texture) gl.deleteTexture(this.#texture);
    if (this.#framebuffer) gl.deleteFramebuffer(this.#framebuffer);
    gl.deleteProgram(this.#program);
    this.#texture = null;
    this.#framebuffer = null;
    this.#size = 0;
  }
}
