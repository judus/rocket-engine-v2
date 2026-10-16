/** Context-owned RGBA8 render-to-texture surface, optionally with depth.
 * Color encoding is chosen by the producer (existing scene shaders write sRGB).
 * No canvas, scene, clock or sampler ownership. Resize replaces storage atomically.
 */
export class WebGLRenderTarget {
  #texture: WebGLTexture | null = null;
  #framebuffer: WebGLFramebuffer | null = null;
  #depth: WebGLRenderbuffer | null = null;
  #width = 0;
  #height = 0;
  #disposed = false;
  constructor(
    readonly gl: WebGL2RenderingContext,
    width: number,
    height: number,
    readonly hasDepth = true,
  ) {
    this.resize(width, height);
  }
  assertContext(gl: WebGL2RenderingContext): void {
    if (this.#disposed) throw new Error('Render target is disposed');
    if (gl !== this.gl)
      throw new Error('Render target belongs to another context');
    if (gl.isContextLost()) throw new Error('Render target context is lost');
  }
  resize(width: number, height: number): void {
    const gl = this.gl;
    this.assertContext(gl);
    const limit = Math.min(
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
    );
    if (
      ![width, height].every((v) => Number.isInteger(v) && v > 0 && v <= limit)
    )
      throw new RangeError('Render target dimensions exceed context limits');
    if (width === this.#width && height === this.#height) return;
    const texture = gl.createTexture(),
      framebuffer = gl.createFramebuffer();
    const depth = this.hasDepth ? gl.createRenderbuffer() : null;
    try {
      if (!texture || !framebuffer || (this.hasDepth && !depth))
        throw new Error('Render target allocation failed');
      gl.activeTexture(gl.TEXTURE0);
      gl.bindSampler(0, null);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        width,
        height,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        texture,
        0,
      );
      if (depth) {
        gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
        gl.renderbufferStorage(
          gl.RENDERBUFFER,
          gl.DEPTH_COMPONENT24,
          width,
          height,
        );
        gl.framebufferRenderbuffer(
          gl.FRAMEBUFFER,
          gl.DEPTH_ATTACHMENT,
          gl.RENDERBUFFER,
          depth,
        );
      }
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('Render target framebuffer incomplete');
    } catch (error) {
      if (texture) gl.deleteTexture(texture);
      if (framebuffer) gl.deleteFramebuffer(framebuffer);
      if (depth) gl.deleteRenderbuffer(depth);
      throw error;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    }
    this.#release();
    this.#texture = texture;
    this.#framebuffer = framebuffer;
    this.#depth = depth;
    this.#width = width;
    this.#height = height;
  }
  bind(gl: WebGL2RenderingContext): void {
    this.assertContext(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.#framebuffer);
    gl.viewport(0, 0, this.#width, this.#height);
  }
  get texture(): WebGLTexture {
    this.assertContext(this.gl);
    return this.#texture!;
  }
  get width(): number {
    return this.#width;
  }
  get height(): number {
    return this.#height;
  }
  get estimatedBytes(): number {
    return this.#width * this.#height * (this.hasDepth ? 8 : 4);
  }
  #release(): void {
    if (this.#texture) this.gl.deleteTexture(this.#texture);
    if (this.#framebuffer) this.gl.deleteFramebuffer(this.#framebuffer);
    if (this.#depth) this.gl.deleteRenderbuffer(this.#depth);
    this.#texture = null;
    this.#framebuffer = null;
    this.#depth = null;
  }
  dispose(): undefined {
    if (!this.#disposed) {
      this.#release();
      this.#disposed = true;
    }
  }
}
