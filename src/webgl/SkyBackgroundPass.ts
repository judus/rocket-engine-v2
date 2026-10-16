import type { SkyBackgroundView } from '../3d/SkyBackground.js';
import { TextureImage } from '../3d/TextureImage.js';
import { WebGLTextureStore } from './TextureStore.js';

const vertex = `#version 300 es
out vec2 ndc;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);ndc=p*2.0-1.0;gl_Position=vec4(ndc,0.0,1.0);}`;
const fragment = `#version 300 es
precision highp float;
in vec2 ndc;
uniform sampler2D panorama;
uniform vec3 forwardRay;
uniform vec3 rightRay;
uniform vec3 upRay;
out vec4 pixel;
void main(){
  vec3 d=normalize(forwardRay+ndc.x*rightRay+ndc.y*upRay);
  vec2 uv=vec2(atan(d.x,d.z)/6.28318530718+0.5,acos(clamp(d.y,-1.0,1.0))/3.14159265359);
  // Explicit gradients avoid an artificial mip blur line at the longitude wrap.
  vec2 dx=dFdx(uv),dy=dFdy(uv);
  dx.x-=round(dx.x);dy.x-=round(dy.x);
  vec3 c=textureGrad(panorama,uv,dx,dy).rgb;
  pixel=vec4(mix(1.055*pow(c,vec3(1.0/2.4))-0.055,12.92*c,lessThanEqual(c,vec3(0.0031308))),1.0);
}`;

/** Renderer-owned single fullscreen triangle. Caller binds/clears the target.
 * No depth writes, lighting, shadows, clock or event ownership.
 */
export class WebGLSkyBackgroundPass {
  #program: WebGLProgram | null = null;
  #vao: WebGLVertexArrayObject | null = null;
  #uniforms: Record<string, WebGLUniformLocation> = {};
  #store: WebGLTextureStore;
  #disposed = false;
  readonly #maximum: number;
  constructor(readonly gl: WebGL2RenderingContext) {
    this.#store = new WebGLTextureStore(gl);
    this.#maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const shaders: WebGLShader[] = [];
    try {
      for (const [type, source] of [
        [gl.VERTEX_SHADER, vertex],
        [gl.FRAGMENT_SHADER, fragment],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Sky shader allocation failed');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(`Sky shader compile: ${gl.getShaderInfoLog(shader)}`);
      }
      this.#program = gl.createProgram();
      if (!this.#program) throw new Error('Sky program allocation failed');
      for (const shader of shaders) gl.attachShader(this.#program, shader);
      gl.linkProgram(this.#program);
      if (!gl.getProgramParameter(this.#program, gl.LINK_STATUS))
        throw new Error(
          `Sky program link: ${gl.getProgramInfoLog(this.#program)}`,
        );
      for (const name of ['panorama', 'forwardRay', 'rightRay', 'upRay']) {
        const location = gl.getUniformLocation(this.#program, name);
        if (location === null) throw new Error(`Missing sky uniform: ${name}`);
        this.#uniforms[name] = location;
      }
      this.#vao = gl.createVertexArray();
      if (!this.#vao) throw new Error('Sky VAO allocation failed');
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      for (const shader of shaders) {
        if (this.#program) gl.detachShader(this.#program, shader);
        gl.deleteShader(shader);
      }
    }
  }
  render(view: SkyBackgroundView): void {
    if (this.#disposed || this.gl.isContextLost())
      throw new Error('Sky pass is unavailable');
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.useProgram(this.#program);
    gl.bindVertexArray(this.#vao);
    this.#store.begin();
    try {
      this.#store.bind(
        { image: view.image, wrapS: 'repeat', wrapT: 'clamp' },
        0,
      );
      gl.uniform1i(this.#uniforms.panorama!, 0);
      for (const [name, v] of [
        ['forwardRay', view.forward],
        ['rightRay', view.right],
        ['upRay', view.up],
      ] as const)
        gl.uniform3f(this.#uniforms[name]!, v.x, v.y, v.z);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    } finally {
      this.#store.end();
      gl.bindVertexArray(null);
      gl.depthMask(true);
    }
  }
  /** Validate before changing GL state, including when textures are disabled on meshes. */
  validate(view: SkyBackgroundView): void {
    if (
      !(view.image instanceof TextureImage) ||
      view.image.colorSpace !== 'srgb' ||
      view.image.width > this.#maximum ||
      view.image.height > this.#maximum ||
      ![view.forward, view.right, view.up].every((v) =>
        [v.x, v.y, v.z].every(Number.isFinite),
      )
    )
      throw new Error('Invalid sky background image or rays');
  }
  get stats() {
    return this.#store.stats;
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#store.dispose();
    if (this.#vao) this.gl.deleteVertexArray(this.#vao);
    if (this.#program) this.gl.deleteProgram(this.#program);
    this.#vao = this.#program = null;
  }
}
