import { AssetPool } from './AssetPool.js';
/** A scene can own a lease; reusable objects receive only its image. */
export interface ImageLease {
  readonly image: ImageBitmap;
  dispose(): undefined;
}
export class Assets {
  readonly #pool = new AssetPool(loadImage, (image) => image.close());
  async acquireImage(
    url: string | URL,
    options: { signal?: AbortSignal } = {},
  ): Promise<ImageLease> {
    const lease = await this.#pool.acquire(
      new URL(url, document.baseURI).href,
      options,
    );
    return {
      get image() {
        return lease.value;
      },
      dispose: () => lease.dispose(),
    };
  }
  dispose(): undefined {
    this.#pool.dispose();
  }
}

async function loadImage(
  url: string,
  signal: AbortSignal,
): Promise<ImageBitmap> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await createImageBitmap(await response.blob());
  } catch (cause) {
    throw new Error(`Could not load image ${url}`, { cause });
  }
}
