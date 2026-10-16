import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { TerrainGenerator } from '../examples/terrain/TerrainGenerator.js';
import {
  ChunkStream,
  MemoryEdits,
  chunkSize,
} from '../examples/streaming/ChunkStream.js';
import { PersistentEdits } from '../examples/streaming/PersistentEdits.js';
import { IndexedDbEdits } from '../examples/streaming/IndexedDbEdits.js';
import { deferred } from './helpers/images.js';
const area = { minX: -8, minY: -8, maxX: 0, maxY: 0 };
const far = { minX: 800, minY: 800, maxX: 808, maxY: 808 };
function storage(factory: IDBFactory, world: TerrainGenerator) {
  return new IndexedDbEdits(factory, {
    key: `procedural:${world.identity}`,
    identity: world.identity,
    valueCount: 6,
  });
}
async function settle() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}
void test('procedural async results use all six biomes and latest overrides before ready publication', async () => {
  const world = new TerrainGenerator({ seed: 777 });
  const edits = new MemoryEdits(
    (cell) => world.sample(cell.x, cell.y).biome,
    6,
  );
  const gate = deferred<Uint8Array>();
  const stream = new ChunkStream(edits, 1, 0, {
    load: () => gate.promise,
    maxJobs: 1,
  });
  stream.demand(area);
  stream.advance(1);
  edits.set({ x: -1, y: -1 }, 5);
  gate.resolve(world.chunk(-1, -1, chunkSize).biomes);
  await settle();
  assert.equal(stream.read({ x: -1, y: -1 }).state, 'pending');
  stream.advance(1);
  assert.deepEqual(stream.read({ x: -1, y: -1 }), { state: 'ready', value: 5 });
  assert.deepEqual(stream.read({ x: -2, y: -1 }), {
    state: 'ready',
    value: world.sample(-2, -1).biome,
  });
  stream.dispose();
});
void test('legacy, seed, scale and generator-version save namespaces remain isolated through reload', async () => {
  const factory = new IDBFactory(),
    original = new TerrainGenerator({ seed: 42 });
  const legacy = new IndexedDbEdits(factory),
    saved = storage(factory, original);
  await legacy.write([{ x: -1, y: -1, value: 1 }]);
  await saved.write([{ x: -1, y: -1, value: 5 }]);
  const variants = [
    new TerrainGenerator({ seed: 43 }),
    new TerrainGenerator({ seed: 42, scale: 48 }),
  ];
  for (const variant of variants) {
    const other = storage(factory, variant);
    assert.deepEqual(await other.read(), []);
    other.dispose();
  }
  assert.deepEqual(await legacy.read(), [{ x: -1, y: -1, value: 1 }]);
  await assert.rejects(
    legacy.write([{ x: 0, y: 0, value: 5 }]),
    /Invalid saved tile/,
  );
  assert.deepEqual(await legacy.read(), [{ x: -1, y: -1, value: 1 }]);
  saved.dispose();
  const reload = storage(factory, original);
  assert.deepEqual(await reload.read(), [{ x: -1, y: -1, value: 5 }]);
  const incompatible = new IndexedDbEdits(factory, {
    key: `procedural:${original.identity}`,
    identity: 'future-generator',
    valueCount: 6,
  });
  await assert.rejects(incompatible.read(), /incompatible/);
  incompatible.dispose();
  reload.dispose();
  legacy.dispose();
});
void test('procedural edits recover after eviction and durable reload, and restoring base prunes the override', async () => {
  const factory = new IDBFactory(),
    world = new TerrainGenerator({ seed: 42 });
  const base = (cell: { x: number; y: number }) =>
    world.sample(cell.x, cell.y).biome;
  let edits = new PersistentEdits(storage(factory, world), base, 6);
  await edits.load();
  let stream = new ChunkStream(edits, 1, 0);
  stream.demand(area);
  stream.advance(1);
  stream.cycle({ x: -1, y: -1 });
  const expected = stream.read({ x: -1, y: -1 });
  await edits.flush();
  assert.equal(edits.stats.unsaved, 0);
  stream.demand(far);
  stream.advance(1);
  assert.equal(stream.read({ x: -1, y: -1 }).state, 'missing');
  stream.demand(area);
  stream.advance(1);
  assert.deepEqual(stream.read({ x: -1, y: -1 }), expected);
  stream.dispose();
  edits.dispose();
  edits = new PersistentEdits(storage(factory, world), base, 6);
  stream = new ChunkStream(edits, 1, 0);
  stream.demand(area);
  stream.advance(1);
  assert.equal(stream.stats.ready, 0);
  await edits.load();
  stream.advance(1);
  assert.deepEqual(stream.read({ x: -1, y: -1 }), expected);
  for (let i = 0; i < 5; i++) stream.cycle({ x: -1, y: -1 });
  await edits.flush();
  assert.equal(edits.stats.cells, 0);
  assert.deepEqual(stream.read({ x: -1, y: -1 }), {
    state: 'ready',
    value: base({ x: -1, y: -1 }),
  });
  stream.dispose();
  edits.dispose();
});
