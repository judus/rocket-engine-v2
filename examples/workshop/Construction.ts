import type { Cell } from '../TileBoard.js';
import type { TileBounds } from '../streaming/ChunkStream.js';
import type { Placement } from './FacilityVisuals.js';
export type BuildingKind = 'mine' | 'smelter' | 'press';
export type Ground = (cell: Readonly<Cell>) => 'unloaded' | 'water' | 'land';
export interface PlacementPreview {
  readonly cell: Readonly<Cell>;
  readonly footprint: Readonly<TileBounds>;
  readonly valid: boolean;
  readonly reason: string;
}
const label = { mine: 'Mine', smelter: 'Smelter', press: 'Press' };
/** Page-owned anchors/occupancy; terrain and Workshop arrive as narrow dependencies. */
export class Construction {
  #placements: readonly Placement[];
  #occupied = new Set<string>();
  constructor(placements: readonly Placement[]) {
    this.#placements = Object.freeze([...placements]);
    for (const placement of placements)
      this.#occupy(this.footprint(placement.cell));
  }
  get placements() {
    return this.#placements;
  }
  footprint(cell: Readonly<Cell>): TileBounds {
    if (!Number.isSafeInteger(cell.x) || !Number.isSafeInteger(cell.y))
      throw new RangeError('Invalid placement cell');
    return {
      minX: cell.x - 1,
      maxX: cell.x + 2,
      minY: cell.y - 1,
      maxY: cell.y + 1,
    };
  }
  #occupy(bounds: TileBounds) {
    for (let y = bounds.minY; y < bounds.maxY; y++)
      for (let x = bounds.minX; x < bounds.maxX; x++)
        this.#occupied.add(`${x},${y}`);
  }
  at(cell: Readonly<Cell>): Placement | undefined {
    return this.#placements.find((p) => {
      const b = this.footprint(p.cell);
      return (
        cell.x >= b.minX &&
        cell.x < b.maxX &&
        cell.y >= b.minY &&
        cell.y < b.maxY
      );
    });
  }
  completeSite(id: string, facilityId: string, label: string): Placement {
    const previous = this.#placements.find((p) => p.facilityId === id);
    if (!previous || this.#placements.some((p) => p.facilityId === facilityId))
      throw new Error('Invalid site completion');
    const replacement = Object.freeze({ ...previous, facilityId, label });
    this.#placements = Object.freeze(
      this.#placements.map((p) => (p === previous ? replacement : p)),
    );
    return replacement;
  }
  remove(id: string): void {
    if (!this.#placements.some((p) => p.facilityId === id))
      throw new Error('Unknown placement');
    this.#placements = Object.freeze(
      this.#placements.filter((p) => p.facilityId !== id),
    );
    this.#occupied.clear();
    for (const p of this.#placements) this.#occupy(this.footprint(p.cell));
  }
  preview(cell: Readonly<Cell>, ground: Ground): PlacementPreview {
    const footprint = this.footprint(cell);
    let reason = 'Ready to build';
    for (let y = footprint.minY; y < footprint.maxY; y++)
      for (let x = footprint.minX; x < footprint.maxX; x++) {
        const tile = ground({ x, y });
        if (tile === 'unloaded') reason = 'Terrain is not ready';
        else if (reason === 'Ready to build' && tile === 'water')
          reason = 'Cannot build on water';
        else if (reason === 'Ready to build' && this.#occupied.has(`${x},${y}`))
          reason = 'Footprint is occupied';
      }
    return Object.freeze({
      cell: Object.freeze({ ...cell }),
      footprint: Object.freeze(footprint),
      valid: reason === 'Ready to build',
      reason,
    });
  }
  place(
    kind: BuildingKind,
    cell: Readonly<Cell>,
    ground: Ground,
    create: (kind: BuildingKind) => string,
  ): Placement | null {
    if (!Object.hasOwn(label, kind))
      throw new RangeError('Unknown building kind');
    const preview = this.preview(cell, ground);
    if (!preview.valid) return null;
    const facilityId = create(kind);
    const placement = Object.freeze({
      facilityId,
      label: label[kind],
      cell: preview.cell,
    });
    this.#placements = Object.freeze([...this.#placements, placement]);
    this.#occupy(preview.footprint);
    return placement;
  }
}
