import { resolveFrames } from './Autotile.js';
import { legacyStyles } from './LegacyAtlas.js';
/** The legacy atlas contains full-height transparent cliff overlays, not quarter tiles. */
export function paintLegacyTile(
  ctx: CanvasRenderingContext2D,
  image: ImageBitmap,
  level: number,
  mask: number,
  x: number,
  y: number,
): void {
  const style = legacyStyles[level];
  if (!style) throw new RangeError('Unknown legacy terrain tier');
  const frames = resolveFrames(mask);
  ctx.fillStyle =
    level === 2 && mask ? (legacyStyles[3]?.color ?? style.color) : style.color;
  ctx.fillRect(x, y, 16, 16);
  for (const name of frames) {
    const rect = style.edges[name];
    if (rect) ctx.drawImage(image, ...rect, x, y, 16, 16);
  }
}
