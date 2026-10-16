import { pickTop, type SpatialEntry } from '../../src/SpatialIndex.js';
import type { Point } from '../../src/types.js';
import { compareDepth } from '../terrain/Autotile.js';
import type { StreamedClassicCache } from '../terrain/StreamedClassicCache.js';
import {
  facilityContains,
  type FacilityVisuals,
  type Placement,
} from './FacilityVisuals.js';
export type FactoryPickTarget = {
  readonly id: string;
  readonly x: number;
  readonly feetY: number;
} & (
  | { readonly kind: 'building'; readonly placement: Placement }
  | { readonly kind: 'decoration'; readonly label: string }
);
/** Combine two world indexes using the exact ascending comparator used for rendering. */
export function pickFactory(
  point: Point,
  visuals: FacilityVisuals,
  terrain: Pick<StreamedClassicCache, 'candidates'>,
): SpatialEntry<FactoryPickTarget> | null {
  const candidates: SpatialEntry<FactoryPickTarget>[] = [
    ...visuals
      .candidates(point)
      .map((entry): SpatialEntry<FactoryPickTarget> => ({
        ...entry,
        value: {
          id: entry.id,
          x: (entry.value.cell.x + 0.5) * 16,
          feetY: (entry.value.cell.y + 1) * 16,
          kind: 'building',
          placement: entry.value,
        },
      })),
    ...terrain
      .candidates(point)
      .map((entry): SpatialEntry<FactoryPickTarget> => ({
        ...entry,
        value: {
          id: entry.id,
          x: entry.value.x,
          feetY: entry.value.feetY,
          kind: 'decoration',
          label: `${entry.value.sprite.kind} · ${entry.value.sprite.id}`,
        },
      })),
  ];
  return pickTop(
    candidates,
    point,
    compareDepth,
    (target, p) =>
      target.kind !== 'building' || facilityContains(target.placement, p),
  );
}
