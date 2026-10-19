import { AssetPool } from '../AssetPool.js';
import type { GlbDecodeOptions } from './GlbLoader.js';
import { loadTexturedGlb } from './GlbLoader.js';
import { loadTextureImage } from './TextureLoader.js';
/** App-owned CPU asset leases. GPU storage remains renderer/context-owned. */
export class WebGLAssets {
  readonly #models: AssetPool<Awaited<ReturnType<typeof loadTexturedGlb>>>;
  constructor({
    maxImagePixels,
    maxTotalPixels,
    maxTexturePixels,
    maxTextureDimension,
  }: Omit<GlbDecodeOptions, 'signal'> & {
    /** Standalone texture decode budget, separate from embedded model images. */
    readonly maxTexturePixels?: number;
    /** Optional standalone texture output limit, e.g. the destination GPU capability. */
    readonly maxTextureDimension?: number;
  } = {}) {
    const textureOptions = {
      ...(maxTexturePixels === undefined
        ? {}
        : { maxPixels: maxTexturePixels }),
      ...(maxTextureDimension === undefined
        ? {}
        : { maxDimension: maxTextureDimension }),
    };
    this.#textures = new AssetPool((url, signal) =>
      loadTextureImage(url, { signal, ...textureOptions }),
    );
    this.#linear = new AssetPool((url, signal) =>
      loadTextureImage(url, {
        signal,
        colorSpace: 'linear',
        ...textureOptions,
      }),
    );
    this.#models = new AssetPool((url, signal) =>
      loadTexturedGlb(url, {
        signal,
        ...(maxImagePixels === undefined ? {} : { maxImagePixels }),
        ...(maxTotalPixels === undefined ? {} : { maxTotalPixels }),
      }),
    );
  }
  readonly #textures: AssetPool<Awaited<ReturnType<typeof loadTextureImage>>>;
  readonly #linear: AssetPool<Awaited<ReturnType<typeof loadTextureImage>>>;
  acquireModel(url: string | URL, options: { signal?: AbortSignal } = {}) {
    return this.#models.acquire(new URL(url, document.baseURI).href, options);
  }
  acquireTexture(
    url: string | URL,
    options: { signal?: AbortSignal; colorSpace?: 'srgb' | 'linear' } = {},
  ) {
    return (
      options.colorSpace === 'linear' ? this.#linear : this.#textures
    ).acquire(new URL(url, document.baseURI).href, options);
  }
  dispose(): undefined {
    this.#models.dispose();
    this.#textures.dispose();
    this.#linear.dispose();
  }
}
