import type { Point } from './types.js';
export interface Bounds2D {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}
export interface SpatialEntry<T> {
  readonly id: string;
  readonly bounds: Bounds2D;
  readonly value: T;
}
function point(value: Point) {
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y))
    throw new RangeError('Point must be finite');
}
function bounds(value: Bounds2D): Bounds2D {
  if (
    ![value.minX, value.minY, value.maxX, value.maxY].every(Number.isFinite) ||
    value.minX >= value.maxX ||
    value.minY >= value.maxY
  )
    throw new RangeError('Bounds must be finite and nonempty');
  return Object.freeze({ ...value });
}
function contains(b: Bounds2D, p: Point) {
  return p.x >= b.minX && p.x < b.maxX && p.y >= b.minY && p.y < b.maxY;
}
/** Frontmost hit according to the consumer's ascending draw comparator; stable ID ties. */
export function pickTop<T>(
  candidates: readonly SpatialEntry<T>[],
  p: Point,
  compare: (a: T, b: T) => number,
  hit?: (value: T, p: Point) => boolean,
): SpatialEntry<T> | null {
  point(p);
  let best: SpatialEntry<T> | null = null;
  for (const entry of candidates) {
    if (!contains(entry.bounds, p)) continue;
    if (hit) {
      const result = hit(entry.value, p);
      if (typeof result !== 'boolean')
        throw new Error('Pick geometry must return a synchronous boolean');
      if (!result) continue;
    }
    const order = best ? compare(entry.value, best.value) : 1;
    if (!Number.isFinite(order))
      throw new Error('Pick comparator must return a finite number');
    if (!best || order > 0 || (order === 0 && entry.id > best.id)) best = entry;
  }
  return best;
}
/** Explicit world-space membership. Values are caller-owned; bounds are copied snapshots. */
export class SpatialIndex<T> {
  #entries = new Map<string, SpatialEntry<T>>();
  #cells = new Map<string, Set<string>>();
  #memberships = new Map<string, readonly string[]>();
  #disposed = false;
  constructor(
    readonly cellSize = 128,
    readonly maxCells = 4096,
  ) {
    if (
      !Number.isFinite(cellSize) ||
      cellSize <= 0 ||
      !Number.isSafeInteger(maxCells) ||
      maxCells < 1 ||
      maxCells > 1000000
    )
      throw new RangeError('Invalid spatial index options');
  }
  get size() {
    return this.#entries.size;
  }
  get buckets() {
    return this.#cells.size;
  }
  #live() {
    if (this.#disposed) throw new Error('Spatial index disposed');
  }
  #key(x: number, y: number) {
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y))
      throw new RangeError('Spatial address exceeds safe integers');
    return `${x},${y}`;
  }
  #keys(b: Bounds2D): string[] {
    const minX = Math.floor(b.minX / this.cellSize),
      minY = Math.floor(b.minY / this.cellSize);
    const maxX = Math.ceil(b.maxX / this.cellSize) - 1,
      maxY = Math.ceil(b.maxY / this.cellSize) - 1;
    this.#key(minX, minY);
    this.#key(maxX, maxY);
    const count = (maxX - minX + 1) * (maxY - minY + 1);
    if (!Number.isSafeInteger(count) || count < 1 || count > this.maxCells)
      throw new RangeError('Spatial operation exceeds cell budget');
    const result: string[] = [];
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) result.push(this.#key(x, y));
    return result;
  }
  #attach(entry: SpatialEntry<T>, keys: readonly string[]) {
    this.#entries.set(entry.id, entry);
    this.#memberships.set(entry.id, keys);
    for (const key of keys) {
      let cell = this.#cells.get(key);
      if (!cell) {
        cell = new Set();
        this.#cells.set(key, cell);
      }
      cell.add(entry.id);
    }
  }
  insert(id: string, b: Bounds2D, value: T): void {
    this.#live();
    if (typeof id !== 'string' || !id || this.#entries.has(id))
      throw new Error('Empty or duplicate spatial ID');
    const copy = bounds(b),
      keys = this.#keys(copy);
    this.#attach(Object.freeze({ id, bounds: copy, value }), keys);
  }
  update(id: string, b: Bounds2D): void {
    this.#live();
    const entry = this.#entries.get(id);
    if (!entry) throw new Error('Unknown spatial ID');
    const copy = bounds(b),
      keys = this.#keys(copy); // Validate before releasing old membership.
    this.remove(id);
    this.#attach(Object.freeze({ ...entry, bounds: copy }), keys);
  }
  remove(id: string): boolean {
    this.#live();
    const keys = this.#memberships.get(id);
    if (!keys) return false;
    for (const key of keys) {
      const cell = this.#cells.get(key)!;
      cell.delete(id);
      if (!cell.size) this.#cells.delete(key);
    }
    this.#memberships.delete(id);
    this.#entries.delete(id);
    return true;
  }
  #candidates(keys: readonly string[]): SpatialEntry<T>[] {
    const ids = new Set<string>();
    for (const key of keys)
      for (const id of this.#cells.get(key) ?? []) ids.add(id);
    return [...ids].sort().map((id) => this.#entries.get(id)!);
  }
  query(b: Bounds2D): readonly SpatialEntry<T>[] {
    this.#live();
    const copy = bounds(b);
    return this.#candidates(this.#keys(copy)).filter(
      ({ bounds: a }) =>
        a.maxX > copy.minX &&
        a.minX < copy.maxX &&
        a.maxY > copy.minY &&
        a.minY < copy.maxY,
    );
  }
  at(p: Point): readonly SpatialEntry<T>[] {
    this.#live();
    point(p);
    return this.#candidates([
      this.#key(
        Math.floor(p.x / this.cellSize),
        Math.floor(p.y / this.cellSize),
      ),
    ]).filter((entry) => contains(entry.bounds, p));
  }
  pick(
    p: Point,
    compare: (a: T, b: T) => number,
    hit?: (value: T, p: Point) => boolean,
  ) {
    return pickTop(this.at(p), p, compare, hit);
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#entries.clear();
    this.#cells.clear();
    this.#memberships.clear();
  }
}
