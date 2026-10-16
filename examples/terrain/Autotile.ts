/** Neighbor bits, clockwise: N, NE, E, SE, S, SW, W, NW. */
export const neighborOffsets = [
  [0, -1],
  [1, -1],
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
] as const;
/** Full atlas frames: their cliff artwork is not divisible into independent quarters. */
export function resolveFrames(mask: number): readonly string[] {
  if (!Number.isInteger(mask) || mask < 0 || mask > 255)
    throw new RangeError('Neighbor mask must be an 8-bit integer');
  const has = (bit: number) => !!(mask & (1 << bit));
  const frames: string[] = [];
  const covered = new Set<number>();
  for (const [v, h, d, corner] of [
    [0, 6, 7, 'TopLeft'],
    [0, 2, 1, 'TopRight'],
    [4, 6, 5, 'BottomLeft'],
    [4, 2, 3, 'BottomRight'],
  ] as const) {
    if (has(v) && has(h)) {
      frames.push(corner);
      covered.add(v);
      covered.add(h);
    } else if (!has(v) && !has(h) && has(d)) frames.push(`${corner}Inner`);
  }
  for (const [bit, name] of [
    [0, 'Top'],
    [2, 'Right'],
    [4, 'Bottom'],
    [6, 'Left'],
  ] as const)
    if (has(bit) && !covered.has(bit)) frames.push(name);
  return frames;
}
export function higherMask(
  x: number,
  y: number,
  read: (x: number, y: number) => number,
): number {
  const center = read(x, y);
  return neighborOffsets.reduce(
    (mask, [dx, dy], index) =>
      read(x + dx, y + dy) > center ? mask | (1 << index) : mask,
    0,
  );
}
export interface DepthItem {
  readonly id: string;
  readonly x: number;
  readonly feetY: number;
}
/** World feet, never sprite top or camera-relative coordinates. Deterministic ties. */
export function compareDepth(a: DepthItem, b: DepthItem): number {
  return (
    a.feetY - b.feetY || a.x - b.x || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
export function cellRandom(seed: number, x: number, y: number): number {
  let v = Math.imul(x ^ seed, 0x45d9f3b) ^ Math.imul(y, 0x27d4eb2d);
  v = Math.imul(v ^ (v >>> 16), 0x85ebca6b);
  return ((v ^ (v >>> 13)) >>> 0) / 4294967296;
}
