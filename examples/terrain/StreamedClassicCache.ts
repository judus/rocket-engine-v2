import { SpatialIndex } from '../../src/SpatialIndex.js';
import type { Point } from '../../src/types.js';
import {
  chunkSize,
  type ChunkStream,
  type TileBounds,
} from '../streaming/ChunkStream.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { TileFriendlyTerrain } from './TileFriendlyTerrain.js';
import { higherMask, compareDepth, type DepthItem } from './Autotile.js';
import { paintLegacyTile } from './LegacyTilePainter.js';
import { decorationAt, type Decoration } from './Decorations.js';
export const classicPixels = 16;
export const biomeTiers = [2, 3, 5, 6, 10, 11] as const;
export function classicTier(
  generated: number,
  override: number | undefined,
): number {
  if (override === undefined) return generated;
  const tier = biomeTiers[override];
  if (tier === undefined) throw new RangeError('Unknown biome override');
  return tier;
}
export function classicDemand(bounds: TileBounds): TileBounds {
  return {
    minX: bounds.minX - 3,
    minY: bounds.minY,
    maxX: bounds.maxX + 3,
    maxY: bounds.maxY + 7,
  };
}
export interface ClassicObject extends DepthItem {
  /** World-pixel bounds, including roof/other overhang beyond the feet. */
  readonly bounds: TileBounds;
  draw(ctx: CanvasRenderingContext2D): void;
}
interface Entry {
  readonly x: number;
  readonly y: number;
  readonly canvas: HTMLCanvasElement;
  readonly objects: readonly Decoration[];
  revision: number;
  signature: string;
}
/** View-owned artwork and decoration records; loaded one-cell halos are mandatory. */
export class StreamedClassicCache {
  #entries = new Map<string, Entry>();
  #disposed = false;
  #objectIndex = new SpatialIndex<Decoration>(chunkSize * classicPixels);
  #builds = 0;
  #invalidations = 0;
  #lastMs = 0;
  #peakMs = 0;
  #drawStats: Readonly<{
    queriedRegions: number;
    scannedRecords: number;
    objects: number;
    extras: number;
  }> = Object.freeze({
    queriedRegions: 0,
    scannedRecords: 0,
    objects: 0,
    extras: 0,
  });
  #shaped: TileFriendlyTerrain;
  constructor(
    private readonly stream: ChunkStream,
    private readonly generator: TerrainGenerator,
    private readonly terrain: ImageBitmap,
    private readonly decorations: ImageBitmap,
  ) {
    this.#shaped = new TileFriendlyTerrain((x, y) =>
      Math.max(
        0,
        Math.min(11, Math.floor(generator.sample(x, y).height * 16) - 3),
      ),
    );
  }
  get disposed() {
    return this.#disposed;
  }
  get drawStats() {
    return this.#drawStats;
  }
  get stats() {
    let records = 0;
    for (const entry of this.#entries.values()) records += entry.objects.length;
    return {
      regions: this.#entries.size,
      records,
      pickableObjects: this.#objectIndex.size,
      builds: this.#builds,
      invalidations: this.#invalidations,
      lastMs: this.#lastMs,
      peakMs: this.#peakMs,
      pixelBytes: this.#entries.size * (chunkSize * classicPixels) ** 2 * 4,
    };
  }
  #ready(x: number, y: number): boolean {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (
          this.stream.read({ x: (x + dx) * chunkSize, y: (y + dy) * chunkSize })
            .state !== 'ready'
        )
          return false;
    return true;
  }
  #signature(x: number, y: number): string {
    let result = '';
    for (let cy = -1; cy <= chunkSize; cy++)
      for (let cx = -1; cx <= chunkSize; cx++)
        result += String(
          this.stream.edits.get({
            x: x * chunkSize + cx,
            y: y * chunkSize + cy,
          }) ?? '-',
        );
    return result;
  }
  prepare(bounds: TileBounds, budget = 2, maxBuildMs = Infinity): void {
    if (this.#disposed) throw new Error('Classic cache disposed');
    if (!Number.isInteger(budget) || budget < 0 || budget > 16)
      throw new RangeError('Invalid artwork budget');
    if (!(maxBuildMs > 0)) throw new RangeError('Invalid artwork time budget');
    const started = performance.now();
    const expanded = classicDemand(bounds),
      wanted = new Set<string>();
    for (
      let y = Math.floor(expanded.minY / chunkSize);
      y < Math.ceil(expanded.maxY / chunkSize);
      y++
    )
      for (
        let x = Math.floor(expanded.minX / chunkSize);
        x < Math.ceil(expanded.maxX / chunkSize);
        x++
      )
        wanted.add(`${x},${y}`);
    for (const [key, entry] of this.#entries)
      if (!wanted.has(key) || !this.#ready(entry.x, entry.y)) {
        this.#removeObjects(entry);
        entry.canvas.width = 0;
        this.#entries.delete(key);
        this.#invalidations++;
      }
    const revision = this.stream.edits.stats.revision;
    for (
      let y = Math.floor(expanded.minY / chunkSize);
      y < Math.ceil(expanded.maxY / chunkSize);
      y++
    )
      for (
        let x = Math.floor(expanded.minX / chunkSize);
        x < Math.ceil(expanded.maxX / chunkSize);
        x++
      ) {
        const key = `${x},${y}`;
        if (!this.#ready(x, y)) continue;
        let entry = this.#entries.get(key);
        if (entry && entry.revision === revision) continue;
        const signature = this.#signature(x, y);
        if (entry && entry.signature === signature) {
          entry.revision = revision;
          continue;
        }
        if (entry) {
          this.#removeObjects(entry);
          entry.canvas.width = 0;
          this.#entries.delete(key);
          this.#invalidations++;
          entry = undefined;
        }
        if (
          budget > 0 &&
          performance.now() - started < maxBuildMs &&
          this.#entries.size < this.stream.capacity
        ) {
          this.#entries.set(key, this.#build(x, y, signature, revision));
          budget--;
        }
      }
  }
  #build(x: number, y: number, signature: string, revision: number): Entry {
    const started = performance.now(),
      width = chunkSize + 2;
    const tiers = new Uint8Array(width * width),
      heights = new Float64Array(width * width);
    for (let cy = -1; cy <= chunkSize; cy++)
      for (let cx = -1; cx <= chunkSize; cx++) {
        const wx = x * chunkSize + cx,
          wy = y * chunkSize + cy,
          index = (cy + 1) * width + cx + 1;
        tiers[index] = classicTier(
          this.#shaped.read(wx, wy),
          this.stream.edits.get({ x: wx, y: wy }),
        );
        heights[index] = this.generator.sample(wx, wy).height;
      }
    const read = (cx: number, cy: number) =>
      tiers[(cy + 1) * width + cx + 1] ?? 0;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = chunkSize * classicPixels;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    const objects: Decoration[] = [];
    for (let cy = 0; cy < chunkSize; cy++)
      for (let cx = 0; cx < chunkSize; cx++) {
        const mask = higherMask(cx, cy, read),
          tier = read(cx, cy);
        paintLegacyTile(
          ctx,
          this.terrain,
          tier,
          mask,
          cx * classicPixels,
          cy * classicPixels,
        );
        const record = decorationAt(
          this.generator.config.seed,
          x * chunkSize + cx,
          y * chunkSize + cy,
          tier,
          heights[(cy + 1) * width + cx + 1] ?? 0,
          mask,
        );
        if (record?.sprite.layer === 'ground')
          ctx.drawImage(
            this.terrain,
            ...record.sprite.rect,
            cx * classicPixels,
            cy * classicPixels,
            classicPixels,
            classicPixels,
          );
        else if (record) objects.push(record);
      }
    for (const object of objects) {
      const rect = object.sprite.rect;
      this.#objectIndex.insert(
        object.id,
        {
          minX: object.x - rect[2] / 2,
          maxX: object.x + rect[2] / 2,
          minY: object.feetY - rect[3],
          maxY: object.feetY,
        },
        object,
      );
    }
    this.#builds++;
    this.#lastMs = performance.now() - started;
    this.#peakMs = Math.max(this.#peakMs, this.#lastMs);
    return {
      x,
      y,
      canvas,
      objects: Object.freeze(objects),
      revision,
      signature,
    };
  }
  #removeObjects(entry: Entry) {
    for (const object of entry.objects) this.#objectIndex.remove(object.id);
  }
  candidates(point: Point) {
    if (this.#disposed) throw new Error('Classic cache disposed');
    return this.#objectIndex.at(point);
  }
  ready(cell: { x: number; y: number }): boolean {
    return (
      !this.#disposed &&
      this.#entries.has(
        `${Math.floor(cell.x / chunkSize)},${Math.floor(cell.y / chunkSize)}`,
      )
    );
  }
  /** Exact displayed tier, available only after this cell's artwork is ready. */
  tier(cell: { x: number; y: number }): number | undefined {
    if (!this.ready(cell)) return undefined;
    return classicTier(
      this.#shaped.read(cell.x, cell.y),
      this.stream.edits.get(cell),
    );
  }
  draw(
    ctx: CanvasRenderingContext2D,
    bounds: TileBounds,
    extras: readonly ClassicObject[] = [],
  ): void {
    if (this.#disposed) throw new Error('Classic cache disposed');
    ctx.imageSmoothingEnabled = false;
    const pixels = chunkSize * classicPixels;
    for (
      let y = Math.floor(bounds.minY / chunkSize);
      y < Math.ceil(bounds.maxY / chunkSize);
      y++
    )
      for (
        let x = Math.floor(bounds.minX / chunkSize);
        x < Math.ceil(bounds.maxX / chunkSize);
        x++
      ) {
        const entry = this.#entries.get(`${x},${y}`);
        if (entry) ctx.drawImage(entry.canvas, x * pixels, y * pixels);
        else {
          ctx.fillStyle =
            this.stream.read({ x: x * chunkSize, y: y * chunkSize }).state ===
            'failed'
              ? '#6c2f45'
              : '#253445';
          ctx.fillRect(x * pixels, y * pixels, pixels, pixels);
        }
      }
    const objects: (Decoration | ClassicObject)[] = [];
    const expanded = classicDemand(bounds);
    let queriedRegions = 0,
      scannedRecords = 0;
    const overlaps = (minX: number, minY: number, maxX: number, maxY: number) =>
      maxX > bounds.minX * classicPixels &&
      minX < bounds.maxX * classicPixels &&
      maxY > bounds.minY * classicPixels &&
      minY < bounds.maxY * classicPixels;
    // Include sprite overhang, but not the artwork prefetch ring.
    for (
      let y = Math.floor(expanded.minY / chunkSize);
      y < Math.ceil(expanded.maxY / chunkSize);
      y++
    )
      for (
        let x = Math.floor(expanded.minX / chunkSize);
        x < Math.ceil(expanded.maxX / chunkSize);
        x++
      ) {
        const entry = this.#entries.get(`${x},${y}`);
        if (!entry) continue;
        queriedRegions++;
        scannedRecords += entry.objects.length;
        for (const record of entry.objects) {
          const rect = record.sprite.rect;
          if (
            overlaps(
              record.x - rect[2] / 2,
              record.feetY - rect[3],
              record.x + rect[2] / 2,
              record.feetY,
            )
          )
            objects.push(record);
        }
      }
    let visibleExtras = 0;
    for (const object of extras)
      if (
        overlaps(
          object.bounds.minX,
          object.bounds.minY,
          object.bounds.maxX,
          object.bounds.maxY,
        )
      ) {
        objects.push(object);
        visibleExtras++;
      }
    objects.sort(compareDepth);
    this.#drawStats = Object.freeze({
      queriedRegions,
      scannedRecords,
      objects: objects.length,
      extras: visibleExtras,
    });
    for (const record of objects) {
      if ('draw' in record) {
        record.draw(ctx);
        continue;
      }
      const rect = record.sprite.rect;
      ctx.drawImage(
        record.sprite.sheet === 'terrain' ? this.terrain : this.decorations,
        ...rect,
        record.x - rect[2] / 2,
        record.feetY - rect[3],
        rect[2],
        rect[3],
      );
    }
  }

  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const entry of this.#entries.values()) entry.canvas.width = 0;
    this.#entries.clear();
    this.#objectIndex.dispose();
    this.#drawStats = Object.freeze({
      queriedRegions: 0,
      scannedRecords: 0,
      objects: 0,
      extras: 0,
    });
    this.#shaped.dispose();
  }
}
