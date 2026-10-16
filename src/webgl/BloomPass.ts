import { WebGLRenderTarget } from './RenderTarget.js';

export interface BloomOptions {
  /** Linear RGB peak-channel threshold, 0..1, with a fixed 0.08 soft transition. */
  readonly threshold?: number;
  readonly strength?: number;
  /** Gaussian sample spacing in half-resolution texels, 0..8. */
  readonly radius?: number;
  readonly view?: 'composite' | 'scene' | 'bright' | 'bloom';
}
const vertex = `#version 300 es
out vec2 uv;
void main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);uv=p;gl_Position=vec4(p*2.0-1.0,0.0,1.0);}`;
const fragment = `#version 300 es
precision highp float;
in vec2 uv;
uniform sampler2D sourceMap;
uniform sampler2D sceneMap;
uniform int mode;
uniform int view;
uniform vec2 direction;
uniform float threshold;
uniform float strength;
out vec4 pixel;
vec3 decode(vec3 c){return mix(pow((c+0.055)/1.055,vec3(2.4)),c/12.92,lessThanEqual(c,vec3(0.04045)));}
vec3 encode(vec3 c){c=clamp(c,0.0,1.0);return mix(1.055*pow(c,vec3(1.0/2.4))-0.055,12.92*c,lessThanEqual(c,vec3(0.0031308)));}
void main(){
  if(mode==0){
    // Decode/extract each source tap before averaging into the half-size target.
    vec2 texel=1.0/vec2(textureSize(sourceMap,0));vec3 result=vec3(0.0);
    for(int y=0;y<2;y++)for(int x=0;x<2;x++){
      vec3 c=decode(texture(sourceMap,uv+(vec2(float(x),float(y))-0.5)*texel).rgb);
      result+=c*smoothstep(threshold,threshold+0.08,max(c.r,max(c.g,c.b)))*0.25;
    }
    pixel=vec4(result,1.0);return;
  }
  if(mode==1){
    // Separable nine-tap Gaussian; alternating targets avoid texture feedback.
    vec3 c=texture(sourceMap,uv).rgb*0.2270270270;
    float weights[4]=float[](0.1945945946,0.1216216216,0.0540540541,0.0162162162);
    for(int i=1;i<=4;i++)c+=(texture(sourceMap,uv+direction*float(i)).rgb+texture(sourceMap,uv-direction*float(i)).rgb)*weights[i-1];
    pixel=vec4(c,1.0);return;
  }
  vec3 scene=texture(sceneMap,uv).rgb;
  if(view==1 || (view==0 && strength==0.0)){pixel=vec4(scene,1.0);return;}
  vec3 glow=texture(sourceMap,uv).rgb;
  pixel=vec4(encode(view>=2 ? glow : decode(scene)+glow*strength),1.0);
}`;

/** Optional LDR bloom over an sRGB-encoded RGBA8 scene target.
 * Half-resolution linear bright pass, two horizontal/vertical Gaussian pairs,
 * then linear addition and sRGB output. No HDR/exposure, scene, lights or clock.
 * Owns only its program/VAO/two scratch targets; caller owns the scene target.
 * Like other backends, owns GL state during the pass and presents to the default framebuffer.
 */
export class WebGLBloomPass {
  #program: WebGLProgram | null = null;
  #vao: WebGLVertexArrayObject | null = null;
  #uniforms: Record<string, WebGLUniformLocation> = {};
  #targets: [WebGLRenderTarget, WebGLRenderTarget] | undefined;
  #disposed = false;
  #draws = 0;
  constructor(readonly gl: WebGL2RenderingContext) {
    const shaders: WebGLShader[] = [];
    try {
      for (const [type, source] of [
        [gl.VERTEX_SHADER, vertex],
        [gl.FRAGMENT_SHADER, fragment],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Bloom shader allocation failed');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(
            `Bloom shader compile: ${gl.getShaderInfoLog(shader)}`,
          );
      }
      this.#program = gl.createProgram();
      if (!this.#program) throw new Error('Bloom program allocation failed');
      for (const shader of shaders) gl.attachShader(this.#program, shader);
      gl.linkProgram(this.#program);
      if (!gl.getProgramParameter(this.#program, gl.LINK_STATUS))
        throw new Error(
          `Bloom program link: ${gl.getProgramInfoLog(this.#program)}`,
        );
      for (const name of [
        'sourceMap',
        'sceneMap',
        'mode',
        'view',
        'direction',
        'threshold',
        'strength',
      ]) {
        const location = gl.getUniformLocation(this.#program, name);
        if (location === null)
          throw new Error(`Missing bloom uniform: ${name}`);
        this.#uniforms[name] = location;
      }
      this.#vao = gl.createVertexArray();
      if (!this.#vao) throw new Error('Bloom VAO allocation failed');
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
  render(scene: WebGLRenderTarget, options: BloomOptions = {}): void {
    if (this.#disposed) throw new Error('Bloom pass is disposed');
    const gl = this.gl;
    scene.assertContext(gl);
    const threshold = options.threshold ?? 0.6,
      strength = options.strength ?? 0.6,
      radius = options.radius ?? 2;
    for (const [value, max] of [
      [threshold, 1],
      [strength, 4],
      [radius, 8],
    ])
      if (!Number.isFinite(value) || value! < 0 || value! > max!)
        throw new RangeError('Invalid bloom parameter');
    const view = ['composite', 'scene', 'bright', 'bloom'].indexOf(
      options.view ?? 'composite',
    );
    if (view < 0) throw new Error('Invalid bloom view');
    const active = view !== 1 && (view !== 0 || strength > 0);
    const width = Math.max(1, Math.ceil(scene.width / 2)),
      height = Math.max(1, Math.ceil(scene.height / 2));
    if (
      active &&
      (!this.#targets ||
        this.#targets[0].width !== width ||
        this.#targets[0].height !== height)
    ) {
      let a: WebGLRenderTarget | undefined, b: WebGLRenderTarget | undefined;
      try {
        a = new WebGLRenderTarget(gl, width, height, false);
        b = new WebGLRenderTarget(gl, width, height, false);
      } catch (error) {
        a?.dispose();
        b?.dispose();
        throw error;
      }
      this.#targets?.forEach((t) => t.dispose());
      this.#targets = [a, b];
    }
    this.#draws = 0;
    gl.useProgram(this.#program);
    gl.bindVertexArray(this.#vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.colorMask(true, true, true, true);
    gl.depthMask(false);
    gl.uniform1i(this.#uniforms.sourceMap!, 0);
    gl.uniform1i(this.#uniforms.sceneMap!, 1);
    gl.uniform1i(this.#uniforms.view!, view);
    gl.uniform1f(this.#uniforms.threshold!, threshold);
    gl.uniform1f(this.#uniforms.strength!, strength);
    const bind = (unit: number, texture: WebGLTexture) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindSampler(unit, null);
      gl.bindTexture(gl.TEXTURE_2D, texture);
    };
    const draw = () => {
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.#draws++;
    };
    let glow = scene.texture;
    try {
      if (active) {
        const [a, b] = this.#targets!;
        a.bind(gl);
        bind(0, scene.texture);
        gl.uniform1i(this.#uniforms.mode!, 0);
        draw();
        if (view !== 2) {
          gl.uniform1i(this.#uniforms.mode!, 1);
          for (let pair = 0; pair < 2; pair++) {
            b.bind(gl);
            bind(0, a.texture);
            gl.uniform2f(this.#uniforms.direction!, radius / width, 0);
            draw();
            a.bind(gl);
            bind(0, b.texture);
            gl.uniform2f(this.#uniforms.direction!, 0, radius / height);
            draw();
          }
        }
        glow = a.texture;
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1i(this.#uniforms.mode!, 2);
      bind(0, glow);
      bind(1, scene.texture);
      draw();
    } finally {
      for (const unit of [0, 1]) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, null);
        gl.bindSampler(unit, null);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindVertexArray(null);
      gl.useProgram(null);
      gl.depthMask(true);
    }
  }
  get stats() {
    return {
      drawCalls: this.#draws,
      width: this.#targets?.[0].width ?? 0,
      height: this.#targets?.[0].height ?? 0,
      estimatedBytes:
        this.#targets?.reduce((n, t) => n + t.estimatedBytes, 0) ?? 0,
    };
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#targets?.forEach((t) => t.dispose());
    this.#targets = undefined;
    if (this.#vao) this.gl.deleteVertexArray(this.#vao);
    if (this.#program) this.gl.deleteProgram(this.#program);
    this.#vao = null;
    this.#program = null;
  }
}
