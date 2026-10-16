import type { Node2D } from '../Node2D.js';
import type { View } from '../View.js';
export interface FollowOptions {
  /** Exponential half-life in seconds, independent of refresh rate; zero snaps. */
  halfLife?: number;
  bounds?: { x: number; y: number; width: number; height: number };
}
/** Camera policy only. Does not move the subject or create an input/clock owner. */
export function followCamera(
  view: Pick<View, 'camera' | 'width' | 'height'>,
  subject: Node2D,
  dt: number,
  { halfLife = 0, bounds }: FollowOptions = {},
): void {
  if (
    !Number.isFinite(dt) ||
    dt < 0 ||
    !Number.isFinite(halfLife) ||
    halfLife < 0
  )
    throw new RangeError('dt and halfLife must be finite and nonnegative');
  const point = subject.localToWorld({ x: 0, y: 0 });
  const width = view.width / view.camera.zoom,
    height = view.height / view.camera.zoom;
  let x = point.x - width / 2,
    y = point.y - height / 2;
  if (bounds) {
    if (
      ![bounds.x, bounds.y, bounds.width, bounds.height].every(
        Number.isFinite,
      ) ||
      bounds.width <= 0 ||
      bounds.height <= 0
    )
      throw new RangeError('Invalid camera bounds');
    x =
      bounds.width < width
        ? bounds.x + (bounds.width - width) / 2
        : Math.max(bounds.x, Math.min(bounds.x + bounds.width - width, x));
    y =
      bounds.height < height
        ? bounds.y + (bounds.height - height) / 2
        : Math.max(bounds.y, Math.min(bounds.y + bounds.height - height, y));
  }
  const alpha = halfLife === 0 ? 1 : 1 - Math.pow(2, -dt / halfLife);
  view.camera.x += (x - view.camera.x) * alpha;
  view.camera.y += (y - view.camera.y) * alpha;
}
