import type { Cell, Terrain } from '../TileBoard.js';

export const chunkSize = 8;
export const tileSize = 32;
const coordinateLimit = 1_000_000;
function validate(cell: Cell) {
  if (
    ![cell.x, cell.y].every(
      (n) => Number.isInteger(n) && Math.abs(n) <= coordinateLimit,
    )
  )
    throw new RangeError('Tile coordinates must be integers within ±1000000');
}
const key = (cell: Cell) => `${cell.x},${cell.y}`;
export function addressOf(cell: Cell) {
  validate(cell);
  const x = Math.floor(cell.x / chunkSize),
    y = Math.floor(cell.y / chunkSize);
  return {
    x,
    y,
    index: (cell.y - y * chunkSize) * chunkSize + cell.x - x * chunkSize,
  };
}
export function terrainAt(cell: Cell): Terrain {
  validate(cell);
  const noise =
    (Math.imul(cell.x, 73856093) ^ Math.imul(cell.y, 19349663)) >>> 0;
  return noise % 11 < 6 ? 0 : noise % 11 < 9 ? 1 : 2;
}

export type TileValue = Terrain | 3 | 4 | 5;
export interface TileEdit extends Cell {
  readonly value: TileValue;
}

/** Host-owned sparse overrides; neither eviction nor stream disposal clears edits. */
export class MemoryEdits {
  #chunks = new Map<string, Map<number, TileValue>>();
  #revision = 0;
  #base: (cell: Cell) => TileValue;
  #valueCount: number;
  get base() {
    return this.#base;
  }
  get valueCount() {
    return this.#valueCount;
  }
  constructor(base: (cell: Cell) => TileValue = terrainAt, valueCount = 3) {
    if (!Number.isInteger(valueCount) || valueCount < 1 || valueCount > 6)
      throw new RangeError('Invalid tile palette size');
    this.#base = base;
    this.#valueCount = valueCount;
  }
  accepts(value: unknown): value is TileValue {
    return (
      typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 0 &&
      value < this.valueCount
    );
  }
  get ready(): boolean {
    return true;
  }
  snapshot(): readonly TileEdit[] {
    const result: TileEdit[] = [];
    for (const [id, patch] of this.#chunks) {
      const [x, y] = id.split(',').map(Number) as [number, number];
      for (const [index, value] of patch)
        result.push(
          Object.freeze({
            x: x * chunkSize + (index % chunkSize),
            y: y * chunkSize + Math.floor(index / chunkSize),
            value,
          }),
        );
    }
    return Object.freeze(result);
  }
  protected replace(snapshot: readonly TileEdit[]): void {
    const restored = new MemoryEdits(this.base, this.valueCount);
    for (const cell of snapshot) restored.set(cell, cell.value);
    this.#chunks = restored.#chunks;
    this.#revision = 0;
  }
  get stats() {
    return Object.freeze({
      chunks: this.#chunks.size,
      cells: [...this.#chunks.values()].reduce(
        (sum, patch) => sum + patch.size,
        0,
      ),
      revision: this.#revision,
    });
  }
  get(cell: Cell): TileValue | undefined {
    const address = addressOf(cell);
    return this.#chunks.get(key(address))?.get(address.index);
  }
  set(cell: Cell, value: TileValue): undefined {
    const address = addressOf(cell);
    if (!this.accepts(value)) throw new RangeError('Invalid terrain');
    const base = this.base(cell),
      id = key(address);
    if ((this.get(cell) ?? base) === value) return;
    const patch = this.#chunks.get(id) ?? new Map<number, TileValue>();
    if (value === base) patch.delete(address.index);
    else patch.set(address.index, value);
    if (patch.size) this.#chunks.set(id, patch);
    else this.#chunks.delete(id);
    this.#revision++;
  }
}
export type TileState =
  | Readonly<{ state: 'missing' | 'pending' }>
  | Readonly<{ state: 'ready'; value: TileValue }>
  | Readonly<{ state: 'failed'; error: string }>;
export interface TileBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export type ChunkLoader = (
  chunk: Readonly<Cell>,
  signal: AbortSignal,
) => Promise<Uint8Array>;
export interface AsyncChunks {
  load?: ChunkLoader;
  maxJobs?: number;
}
export interface DemandHandle {
  set(bounds: TileBounds): undefined;
  dispose(): undefined;
}
type Job = {
  id: number;
  chunk: Chunk;
  controller: AbortController;
  settled: boolean;
  order: number;
  tiles?: Uint8Array;
  error?: string;
};
type Chunk =
  | { x: number; y: number; state: 'pending'; job?: Job }
  | { x: number; y: number; state: 'failed'; error: string }
  | { x: number; y: number; state: 'ready'; tiles: Uint8Array };

/** One controller publishes results and owns demand. Presentations remain read-only. */
export class ChunkStream {
  #chunks = new Map<string, Chunk>();
  #priority: string[] = [];
  #visible = new Set<string>();
  #owners = new Map<symbol, TileBounds | null>();
  #defaultOwner = Symbol('default demand');
  #handles = new WeakMap<DemandHandle, symbol>();
  #disposed = false;
  #generations = 0;
  #evictions = 0;
  #cancelled = 0;
  #jobs = new Set<Job>();
  #loader: ChunkLoader | undefined;
  #maxJobs: number;
  #started = 0;
  #completionOrder = 0;
  #discarded = 0;
  #failures = 0;
  #retries = 0;
  #lastResult = 'none';
  constructor(
    readonly edits: MemoryEdits,
    readonly capacity = 40,
    readonly margin = 1,
    options: AsyncChunks = {},
  ) {
    if (
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > 256 ||
      !Number.isInteger(margin) ||
      margin < 0 ||
      margin > 2
    )
      throw new RangeError('Invalid stream capacity or margin');
    const maxJobs = options.maxJobs ?? Math.min(4, capacity);
    if (
      !Number.isInteger(maxJobs) ||
      maxJobs < 1 ||
      maxJobs > Math.min(8, capacity)
    )
      throw new RangeError('Invalid concurrent job limit');
    this.#loader = options.load;
    this.#maxJobs = this.#loader ? maxJobs : 0;
  }
  get stats() {
    const ready = [...this.#chunks.values()].filter(
      (chunk) => chunk.state === 'ready',
    ).length;
    return Object.freeze({
      owners: this.#owners.size,
      retained: this.#chunks.size,
      capacity: this.capacity,
      ready,
      pending: [...this.#chunks.values()].filter(
        (chunk) => chunk.state === 'pending',
      ).length,
      failed: [...this.#chunks.values()].filter(
        (chunk) => chunk.state === 'failed',
      ).length,
      queued: [...this.#chunks.values()].filter(
        (chunk) => chunk.state === 'pending' && !chunk.job,
      ).length,
      running: this.#jobs.size,
      buffered: [...this.#jobs].filter((job) => job.settled).length,
      maxJobs: this.#maxJobs,
      started: this.#started,
      failures: this.#failures,
      retries: this.#retries,
      discarded: this.#discarded,
      lastResult: this.#lastResult,
      error:
        [...this.#chunks.values()].find((chunk) => chunk.state === 'failed')
          ?.error ?? null,
      visible: this.#visible.size,
      visibleReady: [...this.#visible].filter(
        (id) => this.#chunks.get(id)?.state === 'ready',
      ).length,
      tileBytes: ready * chunkSize * chunkSize,
      generations: this.#generations,
      evictions: this.#evictions,
      cancelled: this.#cancelled,
      disposed: this.#disposed,
    });
  }
  /** Convenience demand owner for existing single-controller consumers. */
  demand(bounds: TileBounds): undefined {
    this.#setDemand(this.#defaultOwner, bounds);
  }
  createDemand(): DemandHandle {
    this.#live();
    const owner = Symbol('demand owner');
    this.#owners.set(owner, null);
    let disposed = false;
    const handle: DemandHandle = {
      set: (bounds): undefined => {
        if (disposed) throw new Error('Demand handle is disposed');
        this.#setDemand(owner, bounds);
      },
      dispose: (): undefined => {
        if (disposed) return;
        disposed = true;
        this.#handles.delete(handle);
        if (this.#owners.delete(owner) && !this.#disposed)
          this.#applyDemand(this.#plan(this.#owners));
      },
    };
    this.#handles.set(handle, owner);
    return handle;
  }
  /** Coordinated cameras replace their complete union in one capacity-checked operation. */
  setDemands(
    updates: readonly { handle: DemandHandle; bounds: TileBounds }[],
  ): undefined {
    this.#live();
    const proposed = new Map(this.#owners),
      seen = new Set<symbol>();
    for (const { handle, bounds } of updates) {
      const owner = this.#handles.get(handle);
      if (!owner || !this.#owners.has(owner) || seen.has(owner))
        throw new Error(
          'Batch requires distinct live handles from this stream',
        );
      seen.add(owner);
      proposed.set(owner, Object.freeze({ ...bounds }));
    }
    const plan = this.#plan(proposed);
    this.#owners = proposed;
    this.#applyDemand(plan);
  }
  #setDemand(owner: symbol, bounds: TileBounds) {
    this.#live();
    const proposed = new Map(this.#owners);
    proposed.set(owner, Object.freeze({ ...bounds }));
    const plan = this.#plan(proposed); // validate union before any mutation/cancellation
    this.#owners = proposed;
    this.#applyDemand(plan);
  }
  #region(bounds: TileBounds) {
    validate({ x: bounds.minX, y: bounds.minY });
    validate({ x: bounds.maxX, y: bounds.maxY });
    if (bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY)
      throw new RangeError('Demand must have positive area');
    const minX = Math.floor(bounds.minX / chunkSize),
      minY = Math.floor(bounds.minY / chunkSize);
    const maxX = Math.floor((bounds.maxX - 1) / chunkSize),
      maxY = Math.floor((bounds.maxY - 1) / chunkSize);
    if (
      (maxX - minX + 1 + 2 * this.margin) *
        (maxY - minY + 1 + 2 * this.margin) >
      this.capacity
    )
      throw new RangeError('Demand plus retention margin exceeds capacity');
    // Validate the margin too, so every generated cell remains in our address domain.
    validate({
      x: (minX - this.margin) * chunkSize,
      y: (minY - this.margin) * chunkSize,
    });
    validate({
      x: (maxX + this.margin + 1) * chunkSize - 1,
      y: (maxY + this.margin + 1) * chunkSize - 1,
    });
    const visible: Cell[] = [],
      prefetch: Cell[] = [];
    for (let y = minY - this.margin; y <= maxY + this.margin; y++)
      for (let x = minX - this.margin; x <= maxX + this.margin; x++)
        (x >= minX && x <= maxX && y >= minY && y <= maxY
          ? visible
          : prefetch
        ).push({ x, y });
    return { visible, prefetch };
  }
  #plan(owners: ReadonlyMap<symbol, TileBounds | null>) {
    const visible = new Map<string, Cell>(),
      prefetch = new Map<string, Cell>();
    for (const bounds of owners.values()) {
      if (!bounds) continue;
      const region = this.#region(bounds);
      for (const cell of region.visible) visible.set(key(cell), cell);
      for (const cell of region.prefetch) prefetch.set(key(cell), cell);
    }
    const wanted = [
      ...visible.values(),
      ...[...prefetch]
        .filter(([id]) => !visible.has(id))
        .map(([, cell]) => cell),
    ];
    if (wanted.length > this.capacity)
      throw new RangeError('Combined demand exceeds capacity');
    return { wanted, visible: new Set(visible.keys()) };
  }
  #applyDemand({ wanted, visible }: { wanted: Cell[]; visible: Set<string> }) {
    const ids = new Set(wanted.map(key));
    for (const [id, chunk] of this.#chunks)
      if (!ids.has(id)) {
        this.#chunks.delete(id);
        if (chunk.state === 'pending' && chunk.job) this.#cancelJob(chunk.job);
        if (chunk.state === 'ready') this.#evictions++;
        else if (chunk.state === 'pending') this.#cancelled++;
      }
    for (const chunk of wanted)
      if (!this.#chunks.has(key(chunk)))
        this.#chunks.set(key(chunk), { ...chunk, state: 'pending' });
    this.#visible = visible;
    this.#priority = wanted.map(key);
  }
  advance(budget = Math.min(2, this.capacity)): undefined {
    this.#live();
    if (!Number.isInteger(budget) || budget < 1 || budget > this.capacity)
      throw new RangeError('Invalid generation budget');
    this.#publishCompleted();
    if (!this.edits.ready) return;
    for (const id of this.#priority) {
      const chunk = this.#chunks.get(id);
      if (chunk?.state !== 'pending' || chunk.job) continue;
      if (this.#loader) {
        // Aborted jobs keep their slot until their promise settles. Ignoring
        // AbortSignal therefore cannot create an unlimited trail of old jobs.
        if (this.#jobs.size >= this.#maxJobs) break;
        this.#launch(chunk);
      } else {
        const tiles = new Uint8Array(chunkSize * chunkSize);
        for (let y = 0; y < chunkSize; y++)
          for (let x = 0; x < chunkSize; x++)
            tiles[y * chunkSize + x] = this.edits.base({
              x: chunk.x * chunkSize + x,
              y: chunk.y * chunkSize + y,
            });
        this.#publish(chunk, tiles);
      }
      if (--budget === 0) break;
    }
  }
  #publish(chunk: Chunk, base: Uint8Array) {
    const tiles = new Uint8Array(base);
    // Apply current overrides at publication, never those captured at launch.
    for (let y = 0; y < chunkSize; y++)
      for (let x = 0; x < chunkSize; x++) {
        const cell = { x: chunk.x * chunkSize + x, y: chunk.y * chunkSize + y };
        tiles[y * chunkSize + x] =
          this.edits.get(cell) ?? tiles[y * chunkSize + x] ?? 0;
      }
    this.#chunks.set(key(chunk), {
      x: chunk.x,
      y: chunk.y,
      state: 'ready',
      tiles,
    });
    this.#generations++;
  }
  #launch(chunk: Chunk) {
    if (chunk.state !== 'pending' || !this.#loader) return;
    const loader = this.#loader;
    const job: Job = {
      id: ++this.#started,
      chunk,
      controller: new AbortController(),
      settled: false,
      order: 0,
    };
    chunk.job = job;
    this.#jobs.add(job);
    const settle = () => {
      job.settled = true;
      job.order = ++this.#completionOrder;
      if (
        (this.#disposed || job.controller.signal.aborted) &&
        this.#jobs.delete(job)
      )
        this.#discarded++;
    };
    void Promise.resolve()
      .then(() => {
        if (job.controller.signal.aborted)
          throw new Error('Chunk load cancelled');
        return loader(
          Object.freeze({ x: chunk.x, y: chunk.y }),
          job.controller.signal,
        );
      })
      .then(
        (tiles) => {
          try {
            if (
              !(tiles instanceof Uint8Array) ||
              tiles.length !== chunkSize * chunkSize ||
              tiles.some((value) => !this.edits.accepts(value))
            )
              throw new Error(
                'Loader must return 64 values from the configured tile palette',
              );
            job.tiles = new Uint8Array(tiles); // loader cannot mutate a buffered result
          } catch (error) {
            job.error = error instanceof Error ? error.message : String(error);
          }
          settle();
        },
        (error) => {
          job.error = error instanceof Error ? error.message : String(error);
          settle();
        },
      );
  }
  #cancelJob(job: Job) {
    job.controller.abort();
    if (job.settled && this.#jobs.delete(job)) this.#discarded++;
  }
  #publishCompleted() {
    for (const job of [...this.#jobs]
      .filter((job) => job.settled)
      .sort((a, b) => a.order - b.order)) {
      const current = this.#chunks.get(key(job.chunk));
      const obsolete =
        this.#disposed ||
        job.controller.signal.aborted ||
        current !== job.chunk;
      if (!obsolete && !this.edits.ready) continue;
      this.#jobs.delete(job);
      if (obsolete) {
        this.#discarded++;
        continue;
      }
      this.#lastResult = `#${job.id} (${job.chunk.x},${job.chunk.y})`;
      if (job.error !== undefined) {
        this.#failures++;
        this.#chunks.set(key(job.chunk), {
          x: job.chunk.x,
          y: job.chunk.y,
          state: 'failed',
          error: job.error,
        });
      } else if (job.tiles) this.#publish(job.chunk, job.tiles);
    }
  }
  retryFailures(): undefined {
    this.#live();
    for (const [id, chunk] of this.#chunks)
      if (chunk.state === 'failed') {
        this.#chunks.set(id, { x: chunk.x, y: chunk.y, state: 'pending' });
        this.#retries++;
      }
  }
  read(cell: Cell): TileState {
    this.#live();
    const address = addressOf(cell),
      chunk = this.#chunks.get(key(address));
    if (!chunk) return Object.freeze({ state: 'missing' });
    if (chunk.state === 'pending') return Object.freeze({ state: 'pending' });
    if (chunk.state === 'failed')
      return Object.freeze({ state: 'failed', error: chunk.error });
    return Object.freeze({
      state: 'ready',
      value: chunk.tiles[address.index] as TileValue,
    });
  }
  cycle(cell: Cell): boolean {
    const current = this.read(cell);
    if (current.state !== 'ready') return false;
    const value = ((current.value + 1) % this.edits.valueCount) as TileValue;
    return this.set(cell, value);
  }
  /** Write a ready tile through the edit store before changing live terrain. */
  set(cell: Cell, value: TileValue): boolean {
    if (!this.edits.accepts(value)) throw new Error('Invalid tile value');
    if (this.read(cell).state !== 'ready') return false;
    // Write-through before touching live data: a failed save cannot acknowledge an edit.
    this.edits.set(cell, value);
    const address = addressOf(cell),
      chunk = this.#chunks.get(key(address));
    if (chunk?.state === 'ready') chunk.tiles[address.index] = value;
    return true;
  }
  #live() {
    if (this.#disposed) throw new Error('Chunk stream is disposed');
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const job of this.#jobs) this.#cancelJob(job);
    this.#owners.clear();
    this.#loader = undefined;
    this.#chunks.clear();
    this.#priority = [];
    this.#visible.clear();
  }
}

/** Deterministic base generator shared by synchronous and delayed sources. */
export function generateChunk(chunk: Cell): Uint8Array {
  if (!Number.isInteger(chunk.x) || !Number.isInteger(chunk.y))
    throw new RangeError('Chunk coordinates must be integers');
  const tiles = new Uint8Array(chunkSize * chunkSize);
  for (let y = 0; y < chunkSize; y++)
    for (let x = 0; x < chunkSize; x++)
      tiles[y * chunkSize + x] = terrainAt({
        x: chunk.x * chunkSize + x,
        y: chunk.y * chunkSize + y,
      });
  return tiles;
}
