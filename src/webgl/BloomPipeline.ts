import { WebGLBloomPass } from './BloomPass.js';
import type { BloomOptions } from './BloomPass.js';
import { WebGLRenderTarget } from './RenderTarget.js';
/** Optional retained scene → bloom composition. Scene/shadow policy stays caller-owned. */
export class WebGLBloomPipeline {
  readonly target: WebGLRenderTarget;
  readonly bloom: WebGLBloomPass;
  constructor(gl: WebGL2RenderingContext) {
    this.target = new WebGLRenderTarget(gl, 1, 1);
    try {
      this.bloom = new WebGLBloomPass(gl);
    } catch (error) {
      this.target.dispose();
      throw error;
    }
  }
  render<T>(
    width: number,
    height: number,
    draw: (target: WebGLRenderTarget) => T,
    options: BloomOptions = {},
  ): T {
    this.target.resize(width, height);
    const result = draw(this.target);
    this.bloom.render(this.target, options);
    return result;
  }
  dispose(): undefined {
    this.bloom.dispose();
    this.target.dispose();
  }
}
