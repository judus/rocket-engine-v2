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
  }: Omit<GlbDecodeOptions, 'signal'> = {}) {
    this.#models = new AssetPool((url, signal) =>
      loadTexturedGlb(url, {
        signal,
        ...(maxImagePixels === undefined ? {} : { maxImagePixels }),
        ...(maxTotalPixels === undefined ? {} : { maxTotalPixels }),
      }),
    );
  }
  readonly #textures = new AssetPool((url, signal) =>
    loadTextureImage(url, { signal }),
  );
  readonly #linear = new AssetPool((url, signal) =>
    loadTextureImage(url, { signal, colorSpace: 'linear' }),
  );
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
