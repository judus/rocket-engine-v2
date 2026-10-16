import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addressOf,
  ChunkStream,
  MemoryEdits,
  terrainAt,
} from '../examples/streaming/ChunkStream.js';

const origin = { minX: -8, minY: -8, maxX: 0, maxY: 0 };
const far = { minX: 800, minY: -800, maxX: 808, maxY: -792 };
void test('signed chunk lookup floors negative coordinates without row aliasing', () => {
  assert.deepEqual(addressOf({ x: -1, y: -1 }), { x: -1, y: -1, index: 63 });
  assert.deepEqual(addressOf({ x: -8, y: -8 }), { x: -1, y: -1, index: 0 });
  assert.deepEqual(addressOf({ x: -9, y: 0 }), { x: -2, y: 0, index: 7 });
  assert.deepEqual(addressOf({ x: 0, y: 8 }), { x: 0, y: 1, index: 0 });
  for (const x of [NaN, Infinity, 0.5, 1000001])
    assert.throws(() => addressOf({ x, y: 0 }), RangeError);
});
void test('pending differs from ready empty terrain, budget prioritizes visible chunks and reads never advance', () => {
  const stream = new ChunkStream(new MemoryEdits(), 9);
  const cell = { x: -8, y: -8 };
  assert.equal(stream.read(cell).state, 'missing');
  stream.demand(origin);
  assert.equal(stream.read(cell).state, 'pending');
  assert.equal(stream.cycle(cell), false);
  assert.equal(stream.edits.stats.revision, 0);
  for (let i = 0; i < 10; i++) stream.read(cell);
  assert.equal(stream.stats.generations, 0);
  stream.advance(1);
  assert.deepEqual(stream.read(cell), {
    state: 'ready',
    value: terrainAt(cell),
  });
  assert.equal(stream.stats.visibleReady, 1);
  assert.equal(stream.stats.ready, 1);
  assert.equal(stream.stats.pending, 8);
  stream.advance(8);
  assert.deepEqual(stream.read({ x: 0, y: 0 }), { state: 'ready', value: 0 });
  stream.dispose();
});
void test('retention and queued generation remain bounded through signed boundary travel and invalid demand is atomic', () => {
  const stream = new ChunkStream(new MemoryEdits(), 9);
  stream.demand(origin);
  stream.advance(1);
  const before = stream.stats;
  assert.throws(
    () => stream.demand({ minX: -100, minY: -100, maxX: 100, maxY: 100 }),
    /capacity/,
  );
  assert.deepEqual(stream.stats, before);
  for (let x = -100; x <= 100; x++) {
    stream.demand({ minX: x * 8, minY: -8, maxX: x * 8 + 8, maxY: 0 });
    stream.advance(1);
    assert.equal(stream.stats.retained, 9);
    assert.ok(stream.stats.tileBytes <= 9 * 64);
  }
  stream.demand(far);
  assert.equal(stream.read({ x: -8, y: -8 }).state, 'missing');
  assert.equal(stream.read({ x: 800, y: -800 }).state, 'pending');
  stream.advance(1);
  assert.equal(stream.read({ x: 800, y: -800 }).state, 'ready');
  assert.ok(stream.stats.evictions > 0);
  assert.ok(stream.stats.cancelled > 0);
  assert.throws(() => stream.advance(0), RangeError);
  stream.dispose();
});
void test('write-through edits survive eviction and stream recreation; returning to base removes sparse override', () => {
  const edits = new MemoryEdits();
  let stream = new ChunkStream(edits, 9);
  const cell = { x: -1, y: -1 },
    neighbor = { x: -2, y: -1 };
  stream.demand(origin);
  stream.advance(1);
  stream.cycle(cell);
  const edited = stream.read(cell);
  assert.equal(edits.stats.cells, 1);
  assert.equal(edits.stats.chunks, 1);
  assert.deepEqual(stream.read(neighbor), {
    state: 'ready',
    value: terrainAt(neighbor),
  });
  stream.demand(far);
  stream.advance(9);
  assert.equal(stream.read(cell).state, 'missing');
  stream.demand(origin);
  stream.advance(1);
  assert.deepEqual(stream.read(cell), edited);
  stream.dispose();
  stream.dispose();
  assert.equal(stream.stats.retained, 0);
  assert.equal(stream.stats.pending, 0);
  assert.equal(stream.stats.tileBytes, 0);
  assert.equal(edits.stats.cells, 1);
  assert.throws(() => stream.demand(origin), /disposed/);
  assert.throws(() => stream.read(cell), /disposed/);
  stream = new ChunkStream(edits, 9);
  stream.demand(origin);
  stream.advance(1);
  assert.deepEqual(stream.read(cell), edited);
  stream.cycle(cell);
  stream.cycle(cell);
  assert.equal(edits.stats.cells, 0);
  assert.equal(edits.stats.chunks, 0);
  assert.deepEqual(stream.read(cell), {
    state: 'ready',
    value: terrainAt(cell),
  });
  stream.dispose();
});
void test('save failure does not change the live tile or acknowledge an edit', () => {
  class FailingEdits extends MemoryEdits {
    override set(): undefined {
      throw new Error('Save failed');
    }
  }
  const stream = new ChunkStream(new FailingEdits(), 9);
  stream.demand(origin);
  stream.advance(1);
  const cell = { x: -1, y: -1 },
    before = stream.read(cell);
  assert.throws(() => stream.cycle(cell), /Save failed/);
  assert.deepEqual(stream.read(cell), before);
  assert.equal(stream.edits.stats.revision, 0);
  stream.dispose();
});

void test('demand owners deduplicate overlapping margins and release only their exclusive chunks', () => {
  const edits = new MemoryEdits(),
    stream = new ChunkStream(edits, 12, 1);
  const a = stream.createDemand(),
    b = stream.createDemand();
  const bounds = { ...origin };
  a.set(bounds);
  stream.advance(12);
  assert.equal(stream.stats.generations, 9);
  bounds.minX = -1000; // stored demand is a snapshot, not the caller's mutable object
  b.set({ minX: 0, minY: -8, maxX: 8, maxY: 0 });
  stream.advance(12);
  assert.equal(stream.stats.owners, 2);
  assert.equal(stream.stats.retained, 12);
  assert.equal(stream.stats.generations, 12); // shared margin chunks generated once
  const shared = { x: 0, y: -1 };
  stream.cycle(shared);
  const value = stream.read(shared);
  a.dispose();
  a.dispose();
  assert.equal(stream.stats.owners, 1);
  assert.equal(stream.stats.retained, 9);
  assert.deepEqual(stream.read(shared), value);
  stream.advance(12);
  assert.equal(stream.stats.generations, 12);
  assert.throws(() => a.set(origin), /disposed/);
  b.dispose();
  assert.equal(stream.stats.owners, 0);
  assert.equal(stream.stats.retained, 0);
  assert.equal(edits.stats.cells, 1);
  stream.dispose();
  b.dispose();
});

void test('combined over-capacity demand fails atomically; handles are invalidated by final stream cleanup', () => {
  const stream = new ChunkStream(new MemoryEdits(), 9, 1);
  const a = stream.createDemand(),
    b = stream.createDemand();
  a.set(origin);
  stream.advance(9);
  const before = stream.stats;
  assert.throws(() => b.set(far), /Combined demand/);
  assert.deepEqual(stream.stats, before);
  assert.equal(stream.read({ x: 800, y: -800 }).state, 'missing');
  b.set(origin);
  assert.equal(stream.stats.retained, 9);
  a.dispose();
  assert.equal(stream.stats.retained, 9);
  stream.dispose();
  assert.equal(stream.stats.owners, 0);
  assert.throws(() => b.set(origin), /disposed/);
  b.dispose();
  b.dispose();
});

void test('batched linked-camera moves replace the union atomically without temporary over-capacity or swap churn', () => {
  const stream = new ChunkStream(new MemoryEdits(), 9, 1),
    foreign = new ChunkStream(new MemoryEdits(), 9, 1);
  const a = stream.createDemand(),
    b = stream.createDemand(),
    wrong = foreign.createDemand();
  stream.setDemands([
    { handle: a, bounds: origin },
    { handle: b, bounds: origin },
  ]);
  stream.advance(9);
  assert.throws(() => a.set(far), /Combined/);
  stream.setDemands([
    { handle: a, bounds: far },
    { handle: b, bounds: far },
  ]);
  assert.equal(stream.stats.retained, 9);
  assert.equal(stream.stats.ready, 0);
  assert.equal(stream.stats.evictions, 9);
  stream.advance(9);
  const before = stream.stats;
  assert.throws(
    () =>
      stream.setDemands([
        { handle: a, bounds: origin },
        { handle: wrong, bounds: origin },
      ]),
    /live handles/,
  );
  assert.throws(
    () =>
      stream.setDemands([
        { handle: a, bounds: origin },
        { handle: a, bounds: origin },
      ]),
    /distinct/,
  );
  assert.deepEqual(stream.stats, before);
  stream.dispose();
  foreign.dispose();
  const two = new ChunkStream(new MemoryEdits(), 2, 0),
    x = two.createDemand(),
    y = two.createDemand();
  two.setDemands([
    { handle: x, bounds: origin },
    { handle: y, bounds: far },
  ]);
  two.advance(2);
  const swap = two.stats;
  two.setDemands([
    { handle: x, bounds: far },
    { handle: y, bounds: origin },
  ]);
  assert.deepEqual(two.stats, swap);
  x.dispose();
  assert.throws(
    () => two.setDemands([{ handle: x, bounds: far }]),
    /live handles/,
  );
  two.dispose();
});
