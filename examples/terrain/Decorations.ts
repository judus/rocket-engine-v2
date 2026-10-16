import { cellRandom, higherMask, type DepthItem } from './Autotile.js';
import {
  decorationRules,
  decorationSprites,
  type DecorationRule,
  type DecorationSprite,
} from './DecorationCatalog.js';
export interface Decoration extends DepthItem {
  readonly sprite: DecorationSprite;
}
export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}
const tile = 16,
  size = 16;
export function clusterDensity(seed: number, x: number, y: number): number {
  const gx = Math.floor(x / 24),
    gy = Math.floor(y / 24);
  const smooth = (t: number) => t * t * (3 - 2 * t),
    fx = smooth(x / 24 - gx),
    fy = smooth(y / 24 - gy);
  const seedSalt = seed ^ 0x6c8e9cf5;
  const a =
    cellRandom(seedSalt, gx, gy) * (1 - fx) +
    cellRandom(seedSalt, gx + 1, gy) * fx;
  const b =
    cellRandom(seedSalt, gx, gy + 1) * (1 - fx) +
    cellRandom(seedSalt, gx + 1, gy + 1) * fx;
  return a * (1 - fy) + b * fy;
}
/** Independent placement and variant streams. Density is an actual probability. */
export function chooseSprite(
  rule: DecorationRule,
  phase: number,
  cluster: number,
  placement: number,
  variant: number,
): DecorationSprite | null {
  if (!rule.bands.length) return null;
  const index = Math.min(
    rule.bands.length - 1,
    Math.floor(phase * rule.bands.length),
  );
  const band = rule.bands[rule.reverse ? rule.bands.length - 1 - index : index];
  if (
    !band ||
    placement >= Math.min(1, band.density * (0.1 + 2.4 * cluster * cluster))
  )
    return null;
  const id =
    band.sprites[
      Math.min(
        band.sprites.length - 1,
        Math.floor(variant * band.sprites.length),
      )
    ];
  return id ? (decorationSprites[id] ?? null) : null;
}
export function decorationAt(
  seed: number,
  x: number,
  y: number,
  tier: number,
  height: number,
  mask: number,
): Decoration | null {
  if (mask) return null;
  const rule = decorationRules[tier];
  if (!rule) return null;
  const phase = height * 16 - Math.floor(height * 16);
  const sprite = chooseSprite(
    rule,
    phase,
    clusterDensity(seed, x, y),
    cellRandom(seed ^ 0x153e7c91, x, y),
    cellRandom(seed ^ 0x72a4bc63, x, y),
  );
  return sprite
    ? Object.freeze({
        id: `decoration:${x},${y}`,
        x: (x + 0.5) * tile,
        feetY: (y + 1) * tile,
        sprite,
      })
    : null;
}
/** Camera demand owns bounded region records; visibility queries never generate. */
export class Decorations {
  #regions = new Map<string, readonly Decoration[]>();
  #builds = 0;
  #cells = 0;
  #evictions = 0;
  #lastMs = 0;
  #peakMs = 0;
  #disposed = false;
  constructor(
    private readonly sample: (
      x: number,
      y: number,
    ) => { tier: number; height: number },
    private readonly seed: number,
    private readonly capacity = 32,
  ) {
    if (
      !Number.isInteger(seed) ||
      seed < 0 ||
      seed > 0xffffffff ||
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > 64
    )
      throw new RangeError('Invalid decoration cache configuration');
  }
  get stats() {
    let records = 0;
    for (const region of this.#regions.values()) records += region.length;
    return Object.freeze({
      retained: this.#regions.size,
      capacity: this.capacity,
      records,
      builds: this.#builds,
      cells: this.#cells,
      evictions: this.#evictions,
      lastMs: this.#lastMs,
      peakMs: this.#peakMs,
    });
  }
  retain(bounds: Bounds): void {
    if (this.#disposed) throw new Error('Decorations disposed');
    if (
      ![bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].every(
        (v) => Number.isInteger(v) && Math.abs(v) <= 999800,
      ) ||
      bounds.minX >= bounds.maxX ||
      bounds.minY >= bounds.maxY
    )
      throw new RangeError('Invalid decoration demand');
    const minX = Math.floor(bounds.minX / size),
      minY = Math.floor(bounds.minY / size),
      maxX = Math.ceil(bounds.maxX / size),
      maxY = Math.ceil(bounds.maxY / size);
    if ((maxX - minX) * (maxY - minY) > this.capacity)
      throw new RangeError('Decoration demand exceeds capacity');
    const next = new Map<string, readonly Decoration[]>();
    for (let cy = minY; cy < maxY; cy++)
      for (let cx = minX; cx < maxX; cx++) {
        const key = `${cx},${cy}`;
        next.set(key, this.#regions.get(key) ?? this.#build(cx, cy));
      }
    for (const key of this.#regions.keys())
      if (!next.has(key)) this.#evictions++;
    this.#regions = next;
  }
  region(cx: number, cy: number): readonly Decoration[] {
    return this.#regions.get(`${cx},${cy}`) ?? [];
  }
  visible(bounds: Bounds): readonly Decoration[] {
    const result: Decoration[] = [];
    for (const region of this.#regions.values())
      for (const record of region) {
        const rect = record.sprite.rect;
        if (
          record.sprite.layer === 'object' &&
          record.x + rect[2] / 2 > bounds.minX &&
          record.x - rect[2] / 2 < bounds.maxX &&
          record.feetY > bounds.minY &&
          record.feetY - rect[3] < bounds.maxY
        )
          result.push(record);
      }
    return result;
  }
  invalidate(): void {
    if (this.#disposed) throw new Error('Decorations disposed');
    this.#regions.clear();
  }
  dispose(): undefined {
    this.#regions.clear();
    this.#disposed = true;
  }
  #build(cx: number, cy: number): readonly Decoration[] {
    const started = performance.now(),
      width = size + 2;
    const tiers = new Uint8Array(width * width),
      heights = new Float64Array(width * width);
    for (let y = -1; y <= size; y++)
      for (let x = -1; x <= size; x++) {
        const sample = this.sample(cx * size + x, cy * size + y);
        if (
          !Number.isInteger(sample.tier) ||
          sample.tier < 0 ||
          sample.tier > 11 ||
          !Number.isFinite(sample.height) ||
          sample.height < 0 ||
          sample.height > 1
        )
          throw new RangeError('Invalid decoration terrain sample');
        const index = (y + 1) * width + x + 1;
        tiers[index] = sample.tier;
        heights[index] = sample.height;
      }
    const read = (x: number, y: number) => tiers[(y + 1) * width + x + 1] ?? 0;
    const records: Decoration[] = [];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const record = decorationAt(
          this.seed,
          cx * size + x,
          cy * size + y,
          read(x, y),
          heights[(y + 1) * width + x + 1] ?? 0,
          higherMask(x, y, read),
        );
        if (record) records.push(record);
      }
    this.#builds++;
    this.#cells += size * size;
    this.#lastMs = performance.now() - started;
    this.#peakMs = Math.max(this.#peakMs, this.#lastMs);
    return Object.freeze(records);
  }
}
