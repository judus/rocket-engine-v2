import { DynamicTextureImage } from '../3d/TextureImage.js';
/** Browser bridge only: explicit sRGB canvas snapshot, at a caller-chosen dirty boundary.
 * Fixed dimensions, opaque output, no automatic redraw/update loop or GPU ownership.
 * A tainted/unreadable canvas throws before publishing a revision.
 */
export function updateTextureFromCanvas(
  image: DynamicTextureImage,
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
): void {
  if (image.colorSpace !== 'srgb')
    throw new Error('Canvas color snapshots require an sRGB dynamic texture');
  if (
    context.canvas.width !== image.width ||
    context.canvas.height !== image.height
  )
    throw new Error('Canvas dimensions must match the dynamic texture');
  const data = context.getImageData(0, 0, image.width, image.height, {
    colorSpace: 'srgb',
  }).data;
  image.update(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}
