import { SpatialIndex } from '../../src/SpatialIndex.js';
import type { Point } from '../../src/types.js';
import { chunkSize, type TileBounds } from '../streaming/ChunkStream.js';
import type { Cell } from '../TileBoard.js';
import type { FactoryState } from './FactoryDemo.js';
import type { ClassicObject } from '../terrain/StreamedClassicCache.js';
export interface Placement {
  readonly facilityId: string;
  readonly label: string;
  readonly cell: Readonly<Cell>;
}
interface Visual extends Placement {
  readonly incarnation: number;
}
/** Presentation lifetime only. It has no Workshop mutation or inventory authority. */
export class FacilityVisuals {
  #placements = new Map<string, Placement>();
  #index = new SpatialIndex<Placement>(chunkSize * 16);
  #visuals = new Map<string, Visual>();
  #builds = 0;
  #released = 0;
  #disposed = false;
  constructor(placements: readonly Placement[]) {
    if (new Set(placements.map((p) => p.facilityId)).size !== placements.length)
      throw new Error('Duplicate placement ID');
    for (const placement of placements) this.addPlacement(placement);
  }
  addPlacement(placement: Placement): void {
    if (this.#disposed) throw new Error('Facility visuals disposed');
    if (this.#placements.has(placement.facilityId))
      throw new Error('Duplicate placement ID');
    this.#placements.set(placement.facilityId, placement);
    this.#index.insert(
      placement.facilityId,
      facilityBounds(placement),
      placement,
    );
  }

  removePlacement(id: string): void {
    if (this.#disposed) throw new Error('Facility visuals disposed');
    const p = this.#placements.get(id);
    if (!p) throw new Error('Unknown placement');
    this.#placements.delete(id);
    this.#index.remove(id);
    if (this.#visuals.delete(id)) this.#released++;
  }
  get stats() {
    return {
      retained: this.#visuals.size,
      builds: this.#builds,
      released: this.#released,
      identities: [...this.#visuals.values()].map(
        (v) => `${v.facilityId}#${v.incarnation}`,
      ),
    };
  }
  ids(): readonly string[] {
    return [...this.#visuals.keys()];
  }
  update(ready: (cell: Readonly<Cell>) => boolean, bounds?: TileBounds): void {
    if (this.#disposed) throw new Error('Facility visuals disposed');
    const candidates = bounds
      ? this.#index
          .query({
            minX: bounds.minX * 16,
            minY: bounds.minY * 16,
            maxX: bounds.maxX * 16,
            maxY: bounds.maxY * 16,
          })
          .map((entry) => entry.value)
      : [...this.#placements.values()];
    if (bounds) {
      const wanted = new Set(candidates.map((p) => p.facilityId));
      for (const id of this.#visuals.keys())
        if (!wanted.has(id)) {
          this.#visuals.delete(id);
          this.#released++;
        }
    }
    for (const placement of candidates) {
      if (ready(placement.cell)) {
        if (!this.#visuals.has(placement.facilityId))
          this.#visuals.set(
            placement.facilityId,
            Object.freeze({ ...placement, incarnation: ++this.#builds }),
          );
      } else if (this.#visuals.delete(placement.facilityId)) this.#released++;
    }
  }
  candidates(point: Point) {
    if (this.#disposed) throw new Error('Facility visuals disposed');
    return this.#index.at(point).filter((entry) => this.#visuals.has(entry.id));
  }
  objects(state: FactoryState): readonly ClassicObject[] {
    const facilities = new Map(state.facilities.map((f) => [f.id, f]));
    return [...this.#visuals.values()].map((visual) => ({
      id: visual.facilityId,
      x: (visual.cell.x + 0.5) * 16,
      feetY: (visual.cell.y + 1) * 16,
      bounds: facilityBounds(visual),
      draw(ctx) {
        const facility = facilities.get(visual.facilityId),
          job = facility?.jobs[0],
          site = state.orders.find((o) => o.id === visual.facilityId);
        const x = (visual.cell.x + 0.5) * 16,
          y = (visual.cell.y + 1) * 16;
        if (site) {
          ctx.fillStyle = '#293c46';
          ctx.fillRect(x - 28, y - 58, 56, 58);
          ctx.strokeStyle = '#ffc66e';
          ctx.lineWidth = 2;
          ctx.strokeRect(x - 28, y - 58, 56, 58);
          ctx.beginPath();
          ctx.moveTo(x - 30, y - 38);
          ctx.lineTo(x, y - 62);
          ctx.lineTo(x + 30, y - 38);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(x - 28, y);
          ctx.lineTo(x + 28, y - 58);
          ctx.moveTo(x + 28, y);
          ctx.lineTo(x - 28, y - 58);
          ctx.stroke();
          ctx.fillStyle = '#ffc66e';
          ctx.font = '10px monospace';
          ctx.fillText(site.definitionId, x - 26, y - 34);
          ctx.fillRect(x - 24, y - 14, 48 * site.progress, 7);
          return;
        }
        ctx.fillStyle = '#203442';
        ctx.fillRect(x - 28, y - 58, 56, 58);
        ctx.fillStyle = '#87c9b3';
        ctx.fillRect(x - 26, y - 38, 52, 36);
        ctx.fillStyle = '#e4b575';
        ctx.beginPath();
        ctx.moveTo(x - 30, y - 38);
        ctx.lineTo(x, y - 62);
        ctx.lineTo(x + 30, y - 38);
        ctx.fill();
        ctx.font = '11px monospace';
        ctx.fillStyle = '#10222f';
        ctx.fillText(visual.label, x - 24, y - 22);
        ctx.fillStyle = '#1b3143';
        ctx.fillRect(x - 24, y - 14, 48, 7);
        ctx.fillStyle = job?.state === 'output-blocked' ? '#ff8e80' : '#fff';
        ctx.fillRect(x - 24, y - 14, 48 * (job?.progress ?? 0), 7);
        if ((facility?.attendance.operator ?? 0) > 0) {
          ctx.fillStyle = '#ffe381';
          ctx.fillRect(x + 19, y - 12, 5, 5);
          ctx.fillStyle = '#93dbff';
          ctx.fillRect(x + 18, y - 7, 7, 7);
        }
      },
    }));
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#released += this.#visuals.size;
    this.#visuals.clear();
    this.#index.dispose();
    this.#placements.clear();
  }
}

export function facilityBounds(placement: Placement) {
  const x = (placement.cell.x + 0.5) * 16,
    feetY = (placement.cell.y + 1) * 16;
  return { minX: x - 30, maxX: x + 30, minY: feetY - 62, maxY: feetY };
}
export function facilityContains(placement: Placement, point: Point) {
  const x = point.x - (placement.cell.x + 0.5) * 16,
    y = point.y - (placement.cell.y + 1) * 16;
  return (
    (x >= -28 && x < 28 && y >= -58 && y < 0) ||
    (y >= -62 && y < -38 && Math.abs(x) <= ((y + 62) * 30) / 24)
  );
}
