import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { ChunkStream, terrainAt } from '../examples/streaming/ChunkStream.js';
import type { TileEdit } from '../examples/streaming/ChunkStream.js';
import { PersistentEdits } from '../examples/streaming/PersistentEdits.js';
import type { EditStorage } from '../examples/streaming/PersistentEdits.js';
import {
  IndexedDbEdits,
  decodeSnapshot,
  generatorVersion,
} from '../examples/streaming/IndexedDbEdits.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const area = { minX: -8, minY: -8, maxX: 0, maxY: 0 };
const cell = { x: -1, y: -1 };

void test('saved edits load completely before generation or editing; a failed load stays pending until retry', async () => {
  const gate = deferred<readonly TileEdit[]>();
  let fail = true;
  const storage: EditStorage = {
    read() {
      if (fail) throw new Error('Read failed');
      return gate.promise;
    },
    async write() {},
    dispose() {},
  };
  const edits = new PersistentEdits(storage),
    stream = new ChunkStream(edits, 9);
  stream.demand(area);
  await edits.load();
  assert.equal(edits.stats.phase, 'load-error');
  stream.advance(9);
  assert.equal(stream.stats.ready, 0);
  assert.equal(stream.read(cell).state, 'pending');
  assert.throws(() => edits.set(cell, 1), /load/);
  fail = false;
  const retried = edits.retry();
  assert.equal(edits.stats.phase, 'loading');
  stream.advance(9);
  assert.equal(stream.stats.ready, 0);
  gate.resolve([{ ...cell, value: 1 }]);
  await retried;
  stream.advance(1);
  assert.deepEqual(stream.read(cell), { state: 'ready', value: 1 });
  assert.equal(edits.stats.unsaved, 0);
  assert.equal(edits.stats.loadError, null);
  stream.dispose();
  edits.dispose();
});

void test('in-flight saves serialize and coalesce revisions; stale commit cannot acknowledge newer edits', async () => {
  const first = deferred<void>(),
    second = deferred<void>();
  const writes: (readonly TileEdit[])[] = [];
  const storage: EditStorage = {
    async read() {
      return [];
    },
    write(snapshot) {
      writes.push(snapshot);
      return writes.length === 1 ? first.promise : second.promise;
    },
    dispose() {},
  };
  const edits = new PersistentEdits(storage);
  await edits.load();
  edits.set(cell, 1);
  edits.set(cell, 2);
  edits.set(cell, terrainAt(cell));
  assert.equal(edits.stats.saving, true);
  assert.equal(edits.stats.unsaved, 3);
  assert.deepEqual(writes[0], [{ ...cell, value: 1 }]);
  const completed = edits.flush();
  first.resolve();
  await first.promise;
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[1], []); // deletion is saved, not a stale earlier value
  assert.equal(edits.stats.unsaved, 2);
  second.resolve();
  await completed;
  assert.equal(edits.stats.unsaved, 0);
  assert.equal(edits.stats.saving, false);
  assert.equal(edits.stats.cells, 0);
  edits.dispose();
});

void test('save failures retain edits across eviction, avoid retry storms and retry the latest memory snapshot', async () => {
  let fail = true,
    attempts = 0;
  let durable: readonly TileEdit[] = [];
  const storage: EditStorage = {
    async read() {
      return durable;
    },
    write(snapshot) {
      attempts++;
      if (fail) throw new Error('Save failed');
      durable = snapshot;
      return Promise.resolve();
    },
    dispose() {},
  };
  const edits = new PersistentEdits(storage),
    stream = new ChunkStream(edits, 9);
  await edits.load();
  stream.demand(area);
  stream.advance(1);
  stream.cycle(cell);
  await edits.flush();
  assert.equal(edits.stats.saveError, 'Save failed');
  assert.equal(edits.stats.unsaved, 1);
  stream.cycle(cell);
  await edits.flush();
  assert.equal(attempts, 1);
  stream.demand({ minX: 800, minY: 800, maxX: 808, maxY: 808 });
  stream.advance(1);
  stream.demand(area);
  stream.advance(1);
  assert.deepEqual(stream.read(cell), { state: 'ready', value: 2 });
  fail = false;
  await edits.retry();
  assert.equal(attempts, 2);
  assert.deepEqual(durable, [{ ...cell, value: 2 }]);
  assert.equal(edits.stats.unsaved, 0);
  assert.equal(edits.stats.saveError, null);
  stream.dispose();
  edits.dispose();
});

void test('host disposal ignores late loads/commits and never marks pending edits durable', async () => {
  const load = deferred<readonly TileEdit[]>(),
    save = deferred<void>();
  let closed = 0;
  const loading = new PersistentEdits({
    read: () => load.promise,
    async write() {},
    dispose() {
      closed++;
    },
  });
  const completion = loading.load();
  loading.dispose();
  loading.dispose();
  load.resolve([{ ...cell, value: 1 }]);
  await completion;
  assert.equal(loading.stats.phase, 'disposed');
  assert.equal(loading.stats.cells, 0);
  const saving = new PersistentEdits({
    async read() {
      return [];
    },
    write: () => save.promise,
    dispose() {
      closed++;
    },
  });
  await saving.load();
  saving.set(cell, 1);
  const committed = saving.flush();
  saving.dispose();
  save.resolve();
  await committed;
  assert.equal(saving.stats.phase, 'disposed');
  assert.equal(saving.stats.unsaved, 1);
  assert.equal(closed, 2);
});

void test('IndexedDB stores signed edits through reopen; aborted transactions preserve the previous durable snapshot', async () => {
  const factory = new IDBFactory();
  const writer = new IndexedDbEdits(factory);
  const snapshot: TileEdit[] = [
    { ...cell, value: 1 },
    { x: 8, y: -9, value: 2 },
  ];
  try {
    assert.deepEqual(await writer.read(), []);
    await writer.write(snapshot);
    writer.dispose();
    const reader = new IndexedDbEdits(factory);
    try {
      assert.deepEqual(await reader.read(), snapshot);
      reader.failNextSave();
      await assert.rejects(reader.write([]), /aborted/);
      assert.deepEqual(await reader.read(), snapshot);
      await reader.write([]);
      assert.deepEqual(await reader.read(), []);
    } finally {
      reader.dispose();
    }
  } finally {
    writer.dispose();
  }
});

void test('snapshot validation rejects incompatible generators and malformed/duplicate tiles atomically', () => {
  assert.deepEqual(decodeSnapshot(undefined), []);
  assert.deepEqual(
    decodeSnapshot({
      generator: generatorVersion,
      edits: [{ ...cell, value: 0 }],
    }),
    [{ ...cell, value: 0 }],
  );
  for (const value of [
    null,
    { generator: 'future', edits: [] },
    { generator: generatorVersion, edits: 'bad' },
    { generator: generatorVersion, edits: [{ ...cell, value: 9 }] },
    { generator: generatorVersion, edits: [{ x: NaN, y: 0, value: 1 }] },
    {
      generator: generatorVersion,
      edits: [
        { ...cell, value: 1 },
        { ...cell, value: 2 },
      ],
    },
  ])
    assert.throws(() => decodeSnapshot(value));
});

void test('unavailable or disposed IndexedDB storage fails clearly; a late open closes safely', async () => {
  const absent = new IndexedDbEdits(undefined);
  // Node has no browser indexedDB, so the default also remains unavailable.
  await assert.rejects(absent.read(), /unavailable/);
  absent.dispose();
  const factory = new IDBFactory(),
    abandoned = new IndexedDbEdits(factory);
  const pending = abandoned.read();
  abandoned.dispose();
  await assert.rejects(pending, /cancelled|disposed/);
  const retry = new IndexedDbEdits(factory);
  try {
    assert.deepEqual(await retry.read(), []);
  } finally {
    retry.dispose();
  }
});
