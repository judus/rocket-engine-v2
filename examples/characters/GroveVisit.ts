import type { Point } from '../../src/types.js';
import type { JourneySnapshot } from '../../src/navigation/index.js';
export const groveBounds = Object.freeze({
  minX: 496,
  minY: 176,
  maxX: 560,
  maxY: 240,
});
export const grove = Object.freeze({ x: 528, y: 208 });
/** A completed player journey anywhere in the displayed grove records a visit. */
export function isGroveArrival(journey: JourneySnapshot | undefined): boolean {
  if (journey?.status !== 'arrived') return false;
  return insideGrove(journey.position);
}
export function insideGrove({ x, y }: Readonly<Point>): boolean {
  return (
    x >= groveBounds.minX &&
    x < groveBounds.maxX &&
    y >= groveBounds.minY &&
    y < groveBounds.maxY
  );
}

export function playerJourneyLabel(
  journey: JourneySnapshot | undefined,
): string {
  if (!journey) return 'idle';
  const { x, y } = journey.destination;
  return `${journey.status} · target ${x.toFixed(1)}, ${y.toFixed(1)}${isGroveArrival(journey) ? ' (Old Grove)' : ''}`;
}
