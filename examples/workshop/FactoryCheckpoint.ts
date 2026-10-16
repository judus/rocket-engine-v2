import { FactoryDemo, type FactorySave } from './FactoryDemo.js';
import { Construction } from './Construction.js';
import type { Placement } from './FacilityVisuals.js';
import {
  TerrainGenerator,
  terrainVersion,
} from '../terrain/TerrainGenerator.js';
export interface FactoryCheckpoint {
  readonly format: 'rocket-factory';
  readonly version: 4;
  readonly terrain: {
    readonly version: string;
    readonly presentation: 'classic-v1';
    readonly seed: number;
    readonly scale: number;
  };
  readonly factory: FactorySave;
  readonly placements: readonly Placement[];
}
export function captureFactory(
  factory: FactoryDemo,
  placements: readonly Placement[],
  generator: TerrainGenerator,
): FactoryCheckpoint {
  if (placements.length > 10000)
    throw new Error('Checkpoint supports at most 10,000 buildings');
  return {
    format: 'rocket-factory',
    version: 4,
    terrain: {
      version: terrainVersion,
      presentation: 'classic-v1',
      ...generator.config,
    },
    factory: factory.save(),
    placements: placements.map((p) => ({ ...p, cell: { ...p.cell } })),
  };
}
/** Publish neither subsystem until the complete checkpoint and ID associations validate. */
export function restoreFactory(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    !('format' in value) ||
    value.format !== 'rocket-factory' ||
    !('version' in value) ||
    value.version !== 4 ||
    !('terrain' in value) ||
    !('factory' in value) ||
    !('placements' in value)
  )
    throw new Error('Incompatible factory checkpoint');
  const t = value.terrain;
  if (
    !t ||
    typeof t !== 'object' ||
    !('version' in t) ||
    t.version !== terrainVersion ||
    !('presentation' in t) ||
    t.presentation !== 'classic-v1' ||
    !('seed' in t) ||
    typeof t.seed !== 'number' ||
    !('scale' in t) ||
    typeof t.scale !== 'number'
  )
    throw new Error('Incompatible terrain identity');
  const generator = new TerrainGenerator({ seed: t.seed, scale: t.scale });
  if (!Array.isArray(value.placements) || value.placements.length > 10000)
    throw new Error('Invalid placement list');
  const factory = FactoryDemo.restore(value.factory);
  try {
    const facilities = new Map(
      factory.read().facilities.map((f) => [f.id, f.definitionId]),
    );
    const siteIds = new Set<string>();
    for (const order of factory.read().orders) {
      facilities.set(order.id, order.definitionId);
      siteIds.add(order.id);
    }
    const placements: Placement[] = [];
    const seen = new Set<string>(),
      occupied = new Set<string>();
    for (const raw of value.placements as unknown[]) {
      if (
        !raw ||
        typeof raw !== 'object' ||
        !('facilityId' in raw) ||
        typeof raw.facilityId !== 'string' ||
        !('cell' in raw) ||
        !raw.cell ||
        typeof raw.cell !== 'object' ||
        !('x' in raw.cell) ||
        !('y' in raw.cell) ||
        typeof raw.cell.x !== 'number' ||
        typeof raw.cell.y !== 'number' ||
        !Number.isSafeInteger(raw.cell.x) ||
        !Number.isSafeInteger(raw.cell.y) ||
        Math.abs(raw.cell.x) > 999800 ||
        Math.abs(raw.cell.y) > 999800
      )
        throw new Error('Invalid placement');
      const kind = facilities.get(raw.facilityId);
      if (!kind || seen.has(raw.facilityId))
        throw new Error('Unknown or duplicate facility placement');
      seen.add(raw.facilityId);
      const cell = Object.freeze({ x: raw.cell.x, y: raw.cell.y });
      for (let y = cell.y - 1; y < cell.y + 1; y++)
        for (let x = cell.x - 1; x < cell.x + 2; x++) {
          const key = `${x},${y}`;
          if (occupied.has(key))
            throw new Error('Overlapping saved foundations');
          occupied.add(key);
        }
      placements.push(
        Object.freeze({
          facilityId: raw.facilityId,
          cell,
          label:
            (kind === 'mine'
              ? 'Mine'
              : kind === 'smelter'
                ? 'Smelter'
                : 'Press') + (siteIds.has(raw.facilityId) ? ' site' : ''),
        }),
      );
    }
    if (seen.size !== facilities.size)
      throw new Error('Missing facility placements');
    return { factory, construction: new Construction(placements), generator };
  } catch (error) {
    factory.dispose();
    throw error;
  }
}
