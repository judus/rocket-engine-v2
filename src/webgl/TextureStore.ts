import { VideoTextureImage } from '../3d/VideoTextureImage.js';
import {
  TextureImage,
  DynamicTextureImage,
  textureBinding,
} from '../3d/TextureImage.js';
import type { TextureBinding3D, TextureSource3D } from '../3d/TextureImage.js';
const linearWhite = new TextureImage(
  1,
  1,
  new Uint8Array([255, 255, 255, 255]),
  { colorSpace: 'linear' },
);
const white = new TextureImage(1, 1, new Uint8Array([255, 255, 255, 255]));
/** Context-local images and independent sampler state. Caller owns frame boundaries and disposal. */
export class WebGLTextureStore {
  #images = new Map<
    TextureSource3D,
    { texture: WebGLTexture; bytes: number; revision: number }
  >();
  #samplers = new Map<string, WebGLSampler>();
  #usedImages = new Set<TextureSource3D>();
  #usedSamplers = new Set<string>();
  #disposed = false;
  #allocations = 0;
  #updates = 0;
  #sourceBytes = 0;
  #mipmapBuilds = 0;
  #units = new Set<number>();
  readonly #maximum: number;
  constructor(readonly gl: WebGL2RenderingContext) {
    this.#maximum = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  }
  begin(): void {
    if (this.#disposed || this.gl.isContextLost())
      throw new Error('Texture store is unavailable');
    this.#units.clear();
    this.#usedImages.clear();
    this.#usedSamplers.clear();
  }
  bind(
    source?: TextureBinding3D,
    unit = 0,
    colorSpace: 'srgb' | 'linear' = 'srgb',
  ): void {
    if (this.#disposed || this.gl.isContextLost())
      throw new Error('Texture store is unavailable');
    // An active sampler must always have a complete texture, including untextured draws.
    if (!Number.isInteger(unit) || unit < 0 || unit > 3)
      throw new Error('Texture unit must be 0..3');
    const binding = textureBinding(
        source ?? { image: colorSpace === 'linear' ? linearWhite : white },
      ),
      { image } = binding,
      gl = this.gl;
    if (image.colorSpace !== colorSpace)
      throw new Error('Texture transfer function does not match its use');
    if (image.width > this.#maximum || image.height > this.#maximum)
      throw new Error('Texture exceeds MAX_TEXTURE_SIZE');
    if (image instanceof VideoTextureImage) image.validate();
    this.#units.add(unit);
    gl.activeTexture(gl.TEXTURE0 + unit);
    const revision =
      image instanceof DynamicTextureImage || image instanceof VideoTextureImage
        ? image.revision
        : 0;
    let entry = this.#images.get(image);
    if (!entry) {
      const texture = gl.createTexture();
      if (!texture) throw new Error('Texture allocation failed');
      try {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
        if (image instanceof VideoTextureImage)
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.SRGB8_ALPHA8,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            image.source,
          );
        else {
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            image.colorSpace === 'srgb' ? gl.SRGB8_ALPHA8 : gl.RGBA8,
            image.width,
            image.height,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            image.copyPixels(),
          );
          gl.generateMipmap(gl.TEXTURE_2D);
          this.#mipmapBuilds++;
        }
        let bytes = 0,
          w = image.width,
          h = image.height;
        for (;;) {
          bytes += w * h * 4;
          if (image instanceof VideoTextureImage || (w === 1 && h === 1)) break;
          w = Math.max(1, w >> 1);
          h = Math.max(1, h >> 1);
        }
        this.#allocations++;
        this.#sourceBytes += image.width * image.height * 4;
        entry = { texture, bytes, revision };
        this.#images.set(image, entry);
      } catch (error) {
        gl.deleteTexture(texture);
        throw error;
      }
    }
    // Preserve an existing allocation if an update throws; its revision remains unseen for retry.
    this.#usedImages.add(image);
    if (entry.revision !== revision) {
      gl.bindTexture(gl.TEXTURE_2D, entry.texture);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      if (image instanceof VideoTextureImage)
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image.source,
        );
      else {
        gl.texSubImage2D(
          gl.TEXTURE_2D,
          0,
          0,
          0,
          image.width,
          image.height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          image.copyPixels(),
        );
        gl.generateMipmap(gl.TEXTURE_2D);
        this.#mipmapBuilds++;
      }
      entry.revision = revision;
      this.#updates++;
      this.#sourceBytes += image.width * image.height * 4;
    }
    const key = `${binding.wrapS}/${binding.wrapT}/${binding.filter}`;
    let sampler = this.#samplers.get(key);
    if (!sampler) {
      sampler = gl.createSampler() ?? undefined;
      if (!sampler) throw new Error('Sampler allocation failed');
      try {
        const wrap = {
          repeat: gl.REPEAT,
          clamp: gl.CLAMP_TO_EDGE,
          mirror: gl.MIRRORED_REPEAT,
        };
        gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, wrap[binding.wrapS]);
        gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, wrap[binding.wrapT]);
        gl.samplerParameteri(
          sampler,
          gl.TEXTURE_MAG_FILTER,
          binding.filter === 'nearest' ? gl.NEAREST : gl.LINEAR,
        );
        gl.samplerParameteri(
          sampler,
          gl.TEXTURE_MIN_FILTER,
          binding.filter === 'nearest'
            ? gl.NEAREST
            : binding.filter === 'linear'
              ? gl.LINEAR
              : gl.LINEAR_MIPMAP_LINEAR,
        );
        this.#samplers.set(key, sampler);
      } catch (error) {
        gl.deleteSampler(sampler);
        throw error;
      }
    }
    this.#usedSamplers.add(key);
    gl.bindTexture(gl.TEXTURE_2D, entry.texture);
    gl.bindSampler(unit, sampler);
  }
  end(): void {
    for (const [image, entry] of this.#images)
      if (!this.#usedImages.has(image)) {
        this.gl.deleteTexture(entry.texture);
        this.#images.delete(image);
      }
    for (const [key, sampler] of this.#samplers)
      if (!this.#usedSamplers.has(key)) {
        this.gl.deleteSampler(sampler);
        this.#samplers.delete(key);
      }
    for (const unit of this.#units) {
      this.gl.activeTexture(this.gl.TEXTURE0 + unit);
      this.gl.bindSampler(unit, null);
      this.gl.bindTexture(this.gl.TEXTURE_2D, null);
    }
    this.gl.activeTexture(this.gl.TEXTURE0);
  }
  /** Context-lifetime successful submissions, not driver timings. Mipmap bytes are not transfer bytes. */
  get uploadStats() {
    return {
      allocations: this.#allocations,
      updates: this.#updates,
      sourceBytes: this.#sourceBytes,
      mipmapBuilds: this.#mipmapBuilds,
    };
  }
  get stats(): { textures: number; samplers: number; textureBytes: number } {
    return {
      textures: this.#images.size,
      samplers: this.#samplers.size,
      textureBytes: [...this.#images.values()].reduce(
        (sum, e) => sum + e.bytes,
        0,
      ),
    };
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const e of this.#images.values()) this.gl.deleteTexture(e.texture);
    for (const s of this.#samplers.values()) this.gl.deleteSampler(s);
    this.#images.clear();
    this.#samplers.clear();
  }
}
