import { parseGlb, embeddedGlbImages } from '../3d/GlbModel.js';
import type { GlbModel } from '../3d/GlbModel.js';
import { TextureImage } from '../3d/TextureImage.js';
import { decodeTextureImage } from './TextureLoader.js';
/** Optional browser adapter; parsing/data stay CPU-only and context-independent. */
export async function decodeTexturedGlb(
  buffer: ArrayBuffer,
  options: { readonly signal?: AbortSignal } = {},
): Promise<GlbModel> {
  options.signal?.throwIfAborted();
  if (buffer.byteLength > 64 * 1024 * 1024)
    throw new Error('GLB exceeds 64 MiB byte budget');
  const sources = embeddedGlbImages(buffer);
  if (sources.length > 32) throw new Error('GLB exceeds 32 image budget');
  const pixels = new Map<number, TextureImage>();
  let totalPixels = 0;
  for (const source of sources) {
    const image = await decodeTextureImage(
      new Blob([new Uint8Array(source.bytes)], { type: source.mimeType }),
      { ...options, colorSpace: 'linear' },
    );
    totalPixels += image.width * image.height;
    if (totalPixels > 64 * 1024 * 1024)
      throw new Error('GLB exceeds 64 megapixel decoded image budget');
    pixels.set(source.index, image);
  }
  options.signal?.throwIfAborted();
  const resolved = new Map<string, TextureImage>();
  return parseGlb(buffer, {
    resolveImage(index, colorSpace) {
      const key = `${index}/${colorSpace}`;
      const cached = resolved.get(key);
      if (cached) return cached;
      const source = pixels.get(index);
      if (!source) throw new Error('Decoded GLB image missing');
      const image =
        colorSpace === 'linear'
          ? source
          : new TextureImage(source.width, source.height, source.copyPixels(), {
              colorSpace,
            });
      resolved.set(key, image);
      return image;
    },
  });
}
export async function loadTexturedGlb(
  url: string | URL,
  options: { readonly signal?: AbortSignal } = {},
): Promise<GlbModel> {
  options.signal?.throwIfAborted();
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`GLB HTTP ${response.status}`);
  return decodeTexturedGlb(await response.arrayBuffer(), options);
}
