import { parseGlb, embeddedGlbImages } from '../3d/GlbModel.js';
import type { GlbModel } from '../3d/GlbModel.js';
import { TextureImage } from '../3d/TextureImage.js';
import { decodeTextureImage } from './TextureLoader.js';
export interface GlbDecodeOptions {
  readonly signal?: AbortSignal;
  readonly maxImagePixels?: number;
  readonly maxTotalPixels?: number;
}
/** Optional browser adapter; parsing/data stay CPU-only and context-independent. */
export async function decodeTexturedGlb(
  buffer: ArrayBuffer,
  options: GlbDecodeOptions = {},
): Promise<GlbModel> {
  options.signal?.throwIfAborted();
  if (buffer.byteLength > 64 * 1024 * 1024)
    throw new Error('GLB exceeds 64 MiB byte budget');
  const maxImagePixels = options.maxImagePixels ?? 16777216;
  const maxTotalPixels = options.maxTotalPixels ?? 67108864;
  if (
    !Number.isSafeInteger(maxTotalPixels) ||
    maxTotalPixels < 1 ||
    maxTotalPixels > 134217728
  )
    throw new Error('Invalid GLB total image pixel budget');
  const sources = embeddedGlbImages(buffer);
  if (sources.length > 32) throw new Error('GLB exceeds 32 image budget');
  const pixels: TextureImage[] = [];
  let totalPixels = 0;
  for (const source of sources) {
    const image = await decodeTextureImage(
      new Blob([new Uint8Array(source.bytes)], { type: source.mimeType }),
      {
        ...(options.signal ? { signal: options.signal } : {}),
        maxPixels: maxImagePixels,
        colorSpace: 'linear',
      },
    );
    totalPixels += image.width * image.height;
    if (totalPixels > maxTotalPixels)
      throw new Error('GLB exceeds decoded image pixel budget');
    pixels.push(image);
  }
  options.signal?.throwIfAborted();
  const resolved = new Map<string, TextureImage>();
  return parseGlb(buffer, {
    resolveImage(index, colorSpace) {
      const key = `${index}/${colorSpace}`;
      const cached = resolved.get(key);
      if (cached) return cached;
      // parseGlb validates indices against this same ordered image list.
      const source = pixels[index]!;
      const image =
        colorSpace === 'linear'
          ? source
          : new TextureImage(source.width, source.height, source.copyPixels(), {
              colorSpace,
              maxPixels: maxImagePixels,
            });
      resolved.set(key, image);
      return image;
    },
  });
}
export async function loadTexturedGlb(
  url: string | URL,
  options: GlbDecodeOptions = {},
): Promise<GlbModel> {
  options.signal?.throwIfAborted();
  const response = await fetch(
    url,
    options.signal ? { signal: options.signal } : {},
  );
  if (!response.ok) throw new Error(`GLB HTTP ${response.status}`);
  return decodeTexturedGlb(await response.arrayBuffer(), options);
}
