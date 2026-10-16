import { createWorkerPool } from 'rocket-workers';
import type { WorkerPool } from 'rocket-workers';
import type { TerrainGenerator } from '../terrain/TerrainGenerator.js';
import type { ChunkLoader } from '../streaming/ChunkStream.js';
import { validInput, validOutput, terrainCost } from './task.js';
import type { TerrainTasks } from './task.js';
/** Scene owns pool. ChunkStream still owns demand, revisions, edits and publication. */
export class WorkerChunks {
  readonly pool: WorkerPool<TerrainTasks>;
  #count = 0;
  #compute = 0;
  #roundTrip = 0;
  #peak = 0;
  #disposed = false;
  constructor(
    private generator: TerrainGenerator,
    pool?: WorkerPool<TerrainTasks>,
    private passes = 1,
  ) {
    if (!Number.isInteger(passes) || passes < 1 || passes > 1024)
      throw new Error('Invalid generation passes');
    this.pool =
      pool ??
      createWorkerPool<TerrainTasks>({
        workerUrl: new URL('./terrain.worker.js', import.meta.url),
        size: 2,
        maxQueued: 4,
        tasks: { terrain: { input: validInput, output: validOutput } },
        // Two occupied slots plus four queued records; each cell-pass reserves one work unit.
        admission: {
          maxCost: 6 * 64 * passes,
          costs: { terrain: terrainCost },
        },
        diagnostics: { computeMs: { terrain: (output) => output.computeMs } },
        startupTimeoutMs: 5000,
        jobTimeoutMs: 10000,
      });
  }
  get reservationUnit() {
    return 'generated cell-passes';
  }
  get ready() {
    return this.pool.ready;
  }
  get stats() {
    return {
      pool: this.pool.stats,
      count: this.#count,
      computeMs: this.#count ? this.#compute / this.#count : 0,
      roundTripMs: this.#count ? this.#roundTrip / this.#count : 0,
      peakMs: this.#peak,
    };
  }
  readonly load: ChunkLoader = async (cell, signal) => {
    const input = Object.freeze({
      ...cell,
      ...this.generator.config,
      identity: this.generator.identity,
      passes: this.passes,
    });
    const started = performance.now();
    const result = await this.pool.run('terrain', input, { signal });
    signal.throwIfAborted();
    if (this.#disposed) throw new Error('Terrain worker adapter disposed');
    if (
      !validOutput(result) ||
      result.x !== input.x ||
      result.y !== input.y ||
      result.identity !== input.identity ||
      result.passes !== input.passes
    )
      throw new Error('Mismatched terrain result');
    const ms = performance.now() - started;
    this.#count++;
    this.#compute += result.computeMs;
    this.#roundTrip += ms;
    this.#peak = Math.max(this.#peak, ms);
    return result.bytes;
  };
  restartFailed(): Promise<void> {
    return Promise.all(
      this.pool.stats.slots
        .filter((s) => s.state === 'failed')
        .map((s) => this.pool.restartWorker(s.index)),
    ).then(() => undefined);
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.pool.dispose();
    return;
  }
}
