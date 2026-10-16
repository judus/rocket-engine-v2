import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ChunkStream,
  MemoryEdits,
  generateChunk,
} from '../examples/streaming/ChunkStream.js';
import type { ChunkLoader } from '../examples/streaming/ChunkStream.js';
import type { Cell } from '../examples/TileBoard.js';
import { PersistentEdits } from '../examples/streaming/PersistentEdits.js';
import { DelayedChunks } from '../examples/streaming/DelayedChunks.js';
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function loader() {
  const requests: {
    cell: Cell;
    signal: AbortSignal;
    gate: ReturnType<typeof deferred<Uint8Array>>;
  }[] = [];
  const load: ChunkLoader = (cell, signal) => {
    const gate = deferred<Uint8Array>();
    requests.push({ cell, signal, gate });
    return gate.promise;
  };
  return { load, requests };
}
// Drain only known promise adoption/settlement reactions, without real-time sleeps.
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}
const area = { minX: 0, minY: 0, maxX: 16, maxY: 8 };
const elsewhere = { minX: 800, minY: 800, maxX: 816, maxY: 808 };

void test('out-of-order results publish only in controller phase and latest edits overlay copied base data', async () => {
  const source = loader(),
    edits = new MemoryEdits();
  const stream = new ChunkStream(edits, 2, 0, {
    load: source.load,
    maxJobs: 2,
  });
  stream.demand(area);
  stream.advance(2);
  await settle();
  assert.equal(source.requests.length, 2);
  const first = source.requests[0],
    second = source.requests[1];
  assert.ok(first);
  assert.ok(second);
  const base = generateChunk(second.cell);
  second.gate.resolve(base);
  await settle();
  assert.equal(stream.read({ x: 8, y: 0 }).state, 'pending');
  assert.equal(stream.stats.buffered, 1);
  edits.set({ x: 8, y: 0 }, 2);
  base.fill(1); // source cannot mutate the captured result before publication
  stream.advance(1);
  assert.deepEqual(stream.read({ x: 8, y: 0 }), { state: 'ready', value: 2 });
  assert.deepEqual(stream.read({ x: 9, y: 0 }), {
    state: 'ready',
    value: generateChunk(second.cell)[1],
  });
  assert.equal(stream.read({ x: 0, y: 0 }).state, 'pending');
  assert.match(stream.stats.lastResult, /#2/);
  first.gate.resolve(generateChunk(first.cell));
  await settle();
  stream.advance(1);
  assert.match(stream.stats.lastResult, /#1/);
  assert.equal(stream.stats.ready, 2);
  assert.equal(stream.stats.running, 0);
  stream.dispose();
});
void test('cancelled noncooperative jobs occupy bounded slots until settlement; re-demand rejects old identity', async () => {
  const source = loader(),
    stream = new ChunkStream(new MemoryEdits(), 2, 0, {
      load: source.load,
      maxJobs: 2,
    });
  stream.demand(area);
  stream.advance(2);
  await settle();
  for (let i = 0; i < 20; i++) {
    stream.demand(i % 2 ? area : elsewhere);
    stream.advance(2);
    await settle();
    assert.equal(stream.stats.running, 2);
    assert.equal(stream.stats.retained, 2);
    assert.equal(source.requests.length, 2);
  }
  stream.demand(area);
  stream.advance(2);
  for (const request of source.requests) {
    assert.equal(request.signal.aborted, true);
    request.gate.resolve(generateChunk(request.cell));
  }
  await settle();
  stream.advance(2);
  await settle();
  assert.equal(stream.stats.discarded, 2);
  assert.equal(stream.stats.ready, 0); // same address is a new record, never the old result
  assert.equal(source.requests.length, 4);
  for (const request of source.requests.slice(2))
    request.gate.resolve(generateChunk(request.cell));
  await settle();
  stream.advance(1);
  assert.equal(stream.stats.ready, 2);
  stream.dispose();
});
void test('failure is readable, noneditable, retained without retry storms; retry starts a fresh job', async () => {
  const source = loader(),
    stream = new ChunkStream(new MemoryEdits(), 2, 0, {
      load: source.load,
      maxJobs: 1,
    });
  stream.demand(area);
  stream.advance(2);
  await settle();
  const request = source.requests[0];
  assert.ok(request);
  request.gate.reject(new Error('Load failed'));
  await settle();
  stream.advance(1);
  await settle();
  assert.deepEqual(stream.read({ x: 0, y: 0 }), {
    state: 'failed',
    error: 'Load failed',
  });
  assert.equal(stream.cycle({ x: 0, y: 0 }), false);
  for (let i = 0; i < 20; i++) {
    stream.demand(area);
    stream.advance(2);
  }
  assert.equal(stream.stats.started, 2); // only the other, unrelated chunk started
  const other = source.requests[1];
  assert.ok(other);
  other.gate.resolve(generateChunk(other.cell));
  await settle();
  stream.advance(1);
  stream.retryFailures();
  stream.advance(1);
  await settle();
  assert.equal(stream.read({ x: 0, y: 0 }).state, 'pending');
  const retry = source.requests[2];
  assert.ok(retry);
  retry.gate.resolve(generateChunk(retry.cell));
  await settle();
  stream.advance(1);
  assert.equal(stream.stats.failed, 0);
  assert.equal(stream.stats.retries, 1);
  assert.equal(stream.stats.ready, 2);
  stream.dispose();
});
void test('storage loading gates job launch and saved overrides apply before first ready publication', async () => {
  const saved = deferred<readonly { x: number; y: number; value: 2 }[]>();
  const edits = new PersistentEdits({
    read: () => saved.promise,
    async write() {},
    dispose() {},
  });
  const loading = edits.load();
  const source = loader(),
    stream = new ChunkStream(edits, 2, 0, { load: source.load, maxJobs: 2 });
  stream.demand(area);
  stream.advance(2);
  await settle();
  assert.equal(source.requests.length, 0);
  saved.resolve([{ x: 0, y: 0, value: 2 }]);
  await loading;
  stream.advance(2);
  await settle();
  for (const request of source.requests)
    request.gate.resolve(generateChunk(request.cell));
  await settle();
  stream.advance(1);
  assert.deepEqual(stream.read({ x: 0, y: 0 }), { state: 'ready', value: 2 });
  assert.equal(edits.stats.unsaved, 0);
  stream.dispose();
  edits.dispose();
});
void test('malformed results and synchronous throws become retryable failures, not unhandled rejections', async () => {
  for (const load of [
    () => Promise.resolve(new Uint8Array(2)),
    () => Promise.resolve(new Uint8Array(64).fill(9)),
    () => {
      throw new Error('Synchronous failure');
    },
  ]) {
    const stream = new ChunkStream(new MemoryEdits(), 1, 0, {
      load,
      maxJobs: 1,
    });
    stream.demand({ minX: 0, minY: 0, maxX: 8, maxY: 8 });
    stream.advance(1);
    await settle();
    stream.advance(1);
    assert.equal(stream.stats.failed, 1);
    assert.equal(stream.stats.running, 0);
    assert.equal(stream.stats.ready, 0);
    stream.dispose();
  }
});
void test('disposal aborts owned jobs and discards late success/failure without restoring chunks', async () => {
  const source = loader(),
    stream = new ChunkStream(new MemoryEdits(), 2, 0, {
      load: source.load,
      maxJobs: 2,
    });
  stream.demand(area);
  stream.advance(2);
  await settle();
  stream.dispose();
  stream.dispose();
  assert.equal(stream.stats.retained, 0);
  assert.equal(stream.stats.queued, 0);
  assert.equal(stream.stats.running, 2); // cannot forcibly settle a noncooperative promise
  for (const [index, request] of source.requests.entries()) {
    assert.equal(request.signal.aborted, true);
    if (index) request.gate.reject(new Error('Late failure'));
    else request.gate.resolve(generateChunk(request.cell));
  }
  await settle();
  assert.equal(stream.stats.running, 0);
  assert.equal(stream.stats.ready, 0);
  assert.equal(stream.stats.discarded, 2);
  assert.equal(stream.stats.failures, 0);
  assert.throws(() => stream.retryFailures(), /disposed/);
});
void test('demo delayed source cancels timers and its armed failure is retryable', async () => {
  const source = new DelayedChunks(),
    controller = new AbortController();
  source.delayMs = 1000;
  const pending = source.load({ x: -1, y: -1 }, controller.signal);
  controller.abort();
  await assert.rejects(pending, /cancelled/);
  source.delayMs = 0;
  source.failNext();
  await assert.rejects(
    source.load({ x: -1, y: -1 }, new AbortController().signal),
    /Simulated/,
  );
  assert.equal(source.failureArmed, false);
  assert.deepEqual(
    await source.load({ x: -1, y: -1 }, new AbortController().signal),
    generateChunk({ x: -1, y: -1 }),
  );
});

void test('all owners visible chunks outrank prefetch; overlap never duplicates jobs or cancels shared work', async () => {
  const source = loader(),
    stream = new ChunkStream(new MemoryEdits(), 18, 1, {
      load: source.load,
      maxJobs: 2,
    });
  const a = stream.createDemand(),
    b = stream.createDemand();
  a.set({ minX: 0, minY: 0, maxX: 8, maxY: 8 });
  b.set({ minX: 800, minY: 800, maxX: 808, maxY: 808 });
  stream.advance(2);
  await settle();
  assert.deepEqual(
    source.requests.map((request) => request.cell),
    [
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ],
  );
  b.set({ minX: 0, minY: 0, maxX: 8, maxY: 8 });
  const shared = source.requests[0],
    obsolete = source.requests[1];
  assert.ok(shared);
  assert.ok(obsolete);
  assert.equal(shared.signal.aborted, false);
  assert.equal(obsolete.signal.aborted, true);
  a.dispose();
  stream.advance(2);
  await settle();
  assert.equal(shared.signal.aborted, false);
  assert.equal(source.requests.length, 2); // cancelled but unsettled slot remains occupied
  shared.gate.resolve(generateChunk(shared.cell));
  obsolete.gate.resolve(generateChunk(obsolete.cell));
  await settle();
  stream.advance(1);
  await settle();
  assert.deepEqual(stream.read({ x: 0, y: 0 }), { state: 'ready', value: 0 });
  assert.equal(stream.stats.discarded, 1);
  assert.equal(stream.stats.owners, 1);
  b.dispose();
  for (const request of source.requests.slice(2))
    request.gate.reject(new Error('Cancelled source'));
  await settle();
  assert.equal(stream.stats.running, 0);
  assert.equal(stream.stats.retained, 0);
  stream.dispose();
});

void test('closing one owner cancels exclusive jobs while preserving shared and other-owner jobs', async () => {
  const source = loader(),
    stream = new ChunkStream(new MemoryEdits(), 3, 0, {
      load: source.load,
      maxJobs: 3,
    });
  const a = stream.createDemand(),
    b = stream.createDemand();
  a.set(area);
  b.set({ minX: 8, minY: 0, maxX: 24, maxY: 8 });
  stream.advance(3);
  await settle();
  assert.equal(source.requests.length, 3);
  a.dispose();
  for (const request of source.requests) {
    assert.equal(request.signal.aborted, request.cell.x === 0);
    request.gate.resolve(generateChunk(request.cell));
  }
  await settle();
  stream.advance(1);
  assert.equal(stream.stats.ready, 2);
  assert.equal(stream.stats.discarded, 1);
  assert.equal(stream.read({ x: 0, y: 0 }).state, 'missing');
  assert.equal(stream.read({ x: 8, y: 0 }).state, 'ready');
  b.dispose();
  assert.equal(stream.stats.owners, 0);
  assert.equal(stream.stats.retained, 0);
  stream.dispose();
});

void test('synchronous abort reentry cannot restore disposed state or overwrite newer demand', async () => {
  for (const action of ['dispose', 'replace']) {
    let stream: ChunkStream;
    let resolve!: (tiles: Uint8Array) => void;
    stream = new ChunkStream(new MemoryEdits(), 1, 0, {
      maxJobs: 1,
      load(_cell, signal) {
        signal.addEventListener(
          'abort',
          () => {
            if (action === 'dispose') stream.dispose();
            else stream.demand({ minX: 16, minY: 0, maxX: 24, maxY: 8 });
            resolve(new Uint8Array(64));
          },
          { once: true },
        );
        return new Promise<Uint8Array>((done) => {
          resolve = done;
        });
      },
    });
    stream.demand({ minX: 0, minY: 0, maxX: 8, maxY: 8 });
    stream.advance(1);
    await settle();
    stream.demand({ minX: 8, minY: 0, maxX: 16, maxY: 8 });
    await settle();
    if (action === 'dispose') {
      assert.equal(stream.stats.retained, 0);
      assert.equal(stream.stats.queued, 0);
      assert.equal(stream.stats.visible, 0);
      assert.equal(stream.stats.running, 0);
    } else {
      assert.equal(stream.read({ x: 8, y: 0 }).state, 'missing');
      assert.equal(stream.read({ x: 16, y: 0 }).state, 'pending');
    }
    stream.dispose();
  }
});
