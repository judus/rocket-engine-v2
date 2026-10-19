import { TextureImage } from '../3d/TextureImage.js';
/** Browser adapter: decode once, retain CPU pixels for independent contexts/restoration. */
export async function loadTextureImage(
  url: string | URL,
  options: {
    readonly signal?: AbortSignal;
    readonly colorSpace?: 'srgb' | 'linear';
    readonly maxPixels?: number;
    /** Fit decoded output to this dimension, preserving aspect ratio; source pixel budget still applies. */
    readonly maxDimension?: number;
  } = {},
): Promise<TextureImage> {
  const { signal } = options;
  signal?.throwIfAborted();
  const response = await fetch(url, signal ? { signal } : {});
  if (!response.ok)
    throw new Error(`Texture request failed (${response.status}): ${url}`);
  const blob = await response.blob();
  signal?.throwIfAborted();
  return decodeTextureImage(blob, options);
}
/** Decode caller-owned embedded image bytes with the same transfer-function contract. */
export async function decodeTextureImage(
  blob: Blob,
  options: {
    readonly signal?: AbortSignal;
    readonly colorSpace?: 'srgb' | 'linear';
    readonly maxPixels?: number;
    /** Fit decoded output to this dimension, preserving aspect ratio; source pixel budget still applies. */
    readonly maxDimension?: number;
  } = {},
): Promise<TextureImage> {
  const { signal } = options;
  signal?.throwIfAborted();
  const maxPixels = options.maxPixels ?? 16777216;
  if (!Number.isSafeInteger(maxPixels) || maxPixels < 1 || maxPixels > 67108864)
    throw new Error('Invalid texture pixel budget');
  const maxDimension = options.maxDimension;
  if (
    maxDimension !== undefined &&
    (!Number.isSafeInteger(maxDimension) || maxDimension < 1)
  )
    throw new Error('Invalid texture dimension limit');
  const bitmap = await createImageBitmap(blob, {
    imageOrientation: 'none',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  try {
    signal?.throwIfAborted();
    if (bitmap.width * bitmap.height > maxPixels)
      throw new Error('Texture exceeds pixel budget');
    const scale =
      maxDimension === undefined
        ? 1
        : Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.floor(bitmap.width * scale));
    const height = Math.max(1, Math.floor(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { colorSpace: 'srgb' });
    if (!context) throw new Error('Texture decode canvas is unavailable');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height);
    return new TextureImage(width, height, new Uint8Array(pixels.data), {
      colorSpace: options.colorSpace ?? 'srgb',
      maxPixels,
    });
  } finally {
    bitmap.close();
  }
}
