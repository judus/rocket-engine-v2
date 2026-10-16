import type { Placement } from './FacilityVisuals.js';

/** Seeded sampling without replacement: unique tile anchors, not collision-free footprints. */
export function scatterFacilities(
  ids: readonly string[],
  radius = 128,
  seed = 42,
): readonly Placement[] {
  if (!Number.isInteger(radius) || radius < 40 || radius > 512)
    throw new RangeError('Radius must be 40–512 tiles');
  const side = radius * 2 + 1,
    cells = new Uint32Array(side * side);
  if (ids.length > cells.length)
    throw new RangeError('Not enough placement cells');
  for (let i = 0; i < cells.length; i++) cells[i] = i;
  let random = seed >>> 0;
  return Object.freeze(
    ids.map((facilityId, index) => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      const selected =
        index + Math.floor((random / 4294967296) * (cells.length - index));
      const value = cells[selected]!;
      cells[selected] = cells[index]!;
      cells[index] = value;
      return Object.freeze({
        facilityId,
        label: ['Mine', 'Smelter', 'Press'][index % 3]!,
        cell: Object.freeze({
          x: (value % side) - radius,
          y: Math.floor(value / side) - radius,
        }),
      });
    }),
  );
}
