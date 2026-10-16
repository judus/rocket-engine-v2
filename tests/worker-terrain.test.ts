import test from 'node:test';
import assert from 'node:assert/strict';
import type { WorkerPool, PoolStats } from 'rocket-workers';
import {
  generateTerrain,
  validInput,
  validOutput,
} from '../examples/workers/task.js';
import type {
  TerrainTasks,
  TerrainInput,
  TerrainOutput,
} from '../examples/workers/task.js';
import { WorkerChunks } from '../examples/workers/WorkerChunks.js';
import { TerrainGenerator } from '../examples/terrain/TerrainGenerator.js';
import {
  ChunkStream,
  MemoryEdits,
  chunkSize,
} from '../examples/streaming/ChunkStream.js';
const generator = new TerrainGenerator({ seed: 42, scale: 96 });
const input = (x: number, y: number): TerrainInput => ({
  x,
  y,
  ...generator.config,
  identity: generator.identity,
  passes: 1,
});
void test('worker task imports same generator: signed chunks agree byte for byte and bounds validate', () => {
  for (const [x, y] of [
    [-3, -1],
    [0, 0],
    [2, -4],
  ] as const) {
    const result = generateTerrain(input(x, y));
    assert.deepEqual(result.bytes, generator.chunk(x, y, chunkSize).biomes);
    assert.equal(validOutput(result), true);
  }
  assert.equal(validInput({ ...input(0, 0), identity: 'other' }), false);
  assert.equal(validInput(input(125000, 0)), false);
  assert.equal(
    validOutput({ ...generateTerrain(input(0, 0)), bytes: new Uint8Array(1) }),
    false,
  );
});
function fake() {
  let resolve!: (result: TerrainOutput) => void;
  let dispatched: TerrainInput | undefined;
  let disposed = 0;
  const pool = {
    ready: Promise.resolve(),
    stats: { slots: [] } as unknown as PoolStats,
    run(_task: 'terrain', data: TerrainInput) {
      dispatched = data;
      return new Promise<TerrainOutput>((yes) => {
        resolve = yes;
      });
    },
    restartWorker() {
      return Promise.resolve();
    },
    dispose() {
      disposed++;
    },
  } as WorkerPool<TerrainTasks>;
  return {
    pool,
    result: (change: Partial<TerrainOutput> = {}) => {
      assert.ok(dispatched);
      resolve({ ...generateTerrain(dispatched), ...change });
    },
    get disposed() {
      return disposed;
    },
  };
}
void test('adapter rejects foreign result identity, aborted/disposed completions, and owns pool once', async () => {
  const f = fake(),
    source = new WorkerChunks(generator, f.pool),
    abort = new AbortController();
  let result = source.load({ x: 0, y: 0 }, abort.signal);
  f.result({ x: 1 });
  await assert.rejects(result, /Mismatched/);
  result = source.load({ x: 0, y: 0 }, abort.signal);
  abort.abort();
  f.result();
  await assert.rejects(result, { name: 'AbortError' });
  result = source.load({ x: 0, y: 0 }, new AbortController().signal);
  source.dispose();
  source.dispose();
  f.result();
  await assert.rejects(result, /disposed/);
  assert.equal(f.disposed, 1);
  assert.equal(source.stats.count, 0);
});
void test('worker completion is published by stream advancement with latest edits, and demand cancellation discards late completion', async () => {
  const f = fake(),
    source = new WorkerChunks(generator, f.pool),
    edits = new MemoryEdits((c) => generator.sample(c.x, c.y).biome, 6);
  const stream = new ChunkStream(edits, 4, 0, {
    load: source.load,
    maxJobs: 1,
  });
  const demand = stream.createDemand();
  stream.setDemands([
    { handle: demand, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 } },
  ]);
  stream.advance(1);
  await Promise.resolve();
  const value = ((generator.sample(0, 0).biome + 1) % 6) as
    0 | 1 | 2 | 3 | 4 | 5;
  edits.set({ x: 0, y: 0 }, value);
  f.result();
  await new Promise<void>((yes) => setImmediate(yes));
  assert.notEqual(stream.read({ x: 0, y: 0 }).state, 'ready');
  stream.advance(1);
  assert.deepEqual(stream.read({ x: 0, y: 0 }), { state: 'ready', value });
  stream.setDemands([
    { handle: demand, bounds: { minX: 80, minY: 0, maxX: 81, maxY: 1 } },
  ]);
  stream.advance(1);
  await Promise.resolve();
  demand.dispose();
  f.result();
  await new Promise<void>((yes) => setImmediate(yes));
  stream.advance(1);
  assert.notEqual(stream.read({ x: 80, y: 0 }).state, 'ready');
  stream.dispose();
  source.dispose();
  assert.equal(f.disposed, 1);
});

/** Fake native boundary exercises the installed pool plus actual consumer config. */
void test('terrain reservation survives logical cancellation, releases on physical reply and timing populations stay separate', async (t) => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  const workers: Boundary[] = [];
  class Boundary extends EventTarget {
    messages: Record<string, unknown>[] = [];
    terminated = 0;
    constructor() {
      super();
      workers.push(this);
    }
    postMessage(message: unknown) {
      this.messages.push(structuredClone(message) as Record<string, unknown>);
    }
    terminate() {
      this.terminated++;
    }
    ready() {
      this.dispatchEvent(
        new MessageEvent('message', {
          data: { ...this.messages[0], kind: 'ready' },
        }),
      );
    }
    result() {
      const message = this.messages.at(-1)!;
      this.dispatchEvent(
        new MessageEvent('message', {
          data: {
            ...message,
            kind: 'result',
            value: generateTerrain(message['input'] as TerrainInput),
          },
        }),
      );
    }
  }
  Object.defineProperty(globalThis, 'Worker', {
    configurable: true,
    value: Boundary,
  });
  const source = new WorkerChunks(generator, undefined, 16);
  t.after(() => {
    source.dispose();
    if (old) Object.defineProperty(globalThis, 'Worker', old);
    else Reflect.deleteProperty(globalThis, 'Worker');
  });
  workers.forEach((w) => w.ready());
  await source.ready;
  const cancelled = new AbortController();
  const first = source.load({ x: 0, y: 0 }, cancelled.signal);
  const rejection = assert.rejects(first, { name: 'AbortError' });
  const second = source.load({ x: 1, y: 0 }, new AbortController().signal);
  const third = source.load({ x: 2, y: 0 }, new AbortController().signal);
  assert.equal(source.pool.stats.admission.reservedCost, 3 * 64 * 16);
  assert.equal(source.pool.stats.admission.queuedCost, 64 * 16);
  cancelled.abort();
  await rejection;
  assert.equal(source.pool.stats.admission.cancelledOccupiedCost, 64 * 16);
  workers[0]!.result();
  assert.equal(source.pool.stats.admission.cancelledOccupiedCost, 0);
  assert.equal(source.pool.stats.admission.reservedCost, 2 * 64 * 16);
  workers[1]!.result();
  workers[0]!.result();
  await Promise.all([second, third]);
  assert.equal(source.pool.stats.admission.reservedCost, 0);
  assert.equal(
    source.pool.stats.timings.physical.cancelled.result.events.value,
    1,
  );
  assert.equal(
    source.pool.stats.timings.physical.active.result.events.value,
    2,
  );
  assert.equal(source.pool.stats.timings.reportedComputeMs.samples, 2);
  assert.equal(source.stats.count, 2);
  source.dispose();
  assert.equal(source.pool.stats.liveWorkers, 0);
  assert.ok(workers.every((w) => w.terminated === 1));
});
