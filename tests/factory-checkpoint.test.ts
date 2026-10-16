import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { FactoryDemo } from '../examples/workshop/FactoryDemo.js';
import { Construction } from '../examples/workshop/Construction.js';
import { TerrainGenerator } from '../examples/terrain/TerrainGenerator.js';
import {
  captureFactory,
  restoreFactory,
} from '../examples/workshop/FactoryCheckpoint.js';
import { FactoryStorage } from '../examples/workshop/FactoryStorage.js';
function world() {
  const factory = new FactoryDemo();
  const construction = new Construction(
    factory.ids.map((facilityId, index) => ({
      facilityId,
      label: 'Initial',
      cell: { x: index * 8, y: 4 },
    })),
  );
  construction.place(
    'press',
    { x: -8, y: -8 },
    () => 'land',
    (kind) => factory.addFacility(kind),
  );
  const generator = new TerrainGenerator({ seed: 42, scale: 48 });
  factory.advance(5.017);
  factory.collect();
  factory.advance(0.347);
  return { factory, construction, generator };
}
void test('combined checkpoints restore mid-batch jobs, pending time, stock, IDs, counters and occupied foundations', () => {
  const w = world();
  const record = captureFactory(
    w.factory,
    w.construction.placements,
    w.generator,
  );
  const restored = restoreFactory(structuredClone(record));
  try {
    const a = w.factory.read(),
      b = restored.factory.read();
    assert.deepEqual(b.summary, a.summary);
    assert.deepEqual(b.stock, a.stock);
    assert.deepEqual(b.facilities, a.facilities);
    assert.equal(b.completed, a.completed);
    assert.equal(b.collected, a.collected);
    assert.equal(b.advances, a.advances);
    assert.ok(b.summary.pendingSeconds > 0);
    assert.ok(
      b.facilities.some((f) =>
        f.jobs.some((j) => j.progress > 0 && j.progress < 1),
      ),
    );
    assert.equal(
      restored.construction.preview({ x: -8, y: -8 }, () => 'land').valid,
      false,
    );
    assert.deepEqual(restored.generator.config, w.generator.config);
    w.factory.advance(1.5);
    restored.factory.advance(1.5);
    assert.deepEqual(
      restored.factory.read().facilities,
      w.factory.read().facilities,
    );
    assert.equal(restored.factory.read().completed, w.factory.read().completed);
    assert.equal(
      restored.factory.addFacility('mine'),
      w.factory.addFacility('mine'),
    );
  } finally {
    w.factory.dispose();
    restored.factory.dispose();
  }
});
void test('invalid versions, identities, placements, overlaps and counters reject the whole checkpoint', () => {
  const w = world();
  try {
    const r = captureFactory(w.factory, w.construction.placements, w.generator);
    const invalid = [
      { ...r, version: 1 },
      { ...r, version: 2 },
      { ...r, version: 3 },
      { ...r, terrain: { ...r.terrain, version: 'other' } },
      { ...r, placements: r.placements.slice(1) },
      { ...r, placements: [...r.placements, r.placements[0]] },
      {
        ...r,
        placements: r.placements.map((p, i) =>
          i === 1 ? { ...p, cell: r.placements[0]!.cell } : p,
        ),
      },
      {
        ...r,
        placements: r.placements.map((p, i) =>
          i === 1 ? { ...p, facilityId: 'unknown' } : p,
        ),
      },
      {
        ...r,
        placements: r.placements.map((p, i) =>
          i === 1 ? { ...p, cell: { x: NaN, y: 0 } } : p,
        ),
      },
      { ...r, factory: { ...r.factory, completed: r.factory.completed + 1 } },
    ];
    invalid.push({
      ...r,
      factory: { ...r.factory, collected: r.factory.collected + 1 },
    });
    for (const value of invalid) assert.throws(() => restoreFactory(value));
    const restored = restoreFactory(r);
    restored.factory.dispose();
    assert.equal(w.factory.ids.length, 4);
  } finally {
    w.factory.dispose();
  }
});
void test('IndexedDB commits detached checkpoints, preserves previous saves on abort and retries', async () => {
  const w = world(),
    idb = new IDBFactory(),
    storage = new FactoryStorage(idb);
  try {
    assert.equal(await storage.read(), undefined);
    const first = captureFactory(
      w.factory,
      w.construction.placements,
      w.generator,
    );
    const write = storage.write(first);
    const original = structuredClone(first);
    first.factory.simulation.tick = 999;
    await write;
    assert.deepEqual(await storage.read(), original);
    w.factory.advance(1);
    const next = captureFactory(
      w.factory,
      w.construction.placements,
      w.generator,
    );
    storage.failNextWrite();
    await assert.rejects(storage.write(next));
    assert.deepEqual(await storage.read(), original);
    await storage.write(next);
    storage.dispose();
    const reloaded = new FactoryStorage(idb);
    try {
      assert.deepEqual(await reloaded.read(), next);
      const restored = restoreFactory(await reloaded.read());
      assert.deepEqual(
        restored.factory.read().summary,
        w.factory.read().summary,
      );
      restored.factory.dispose();
    } finally {
      reloaded.dispose();
    }
    assert.deepEqual(
      w.factory.read().summary.tick,
      next.factory.simulation.tick,
    );
  } finally {
    storage.dispose();
    w.factory.dispose();
  }
});

void test('unreadable checkpoints remain untouched and storage cleanup rejects late operations', async () => {
  const w = world(),
    storage = new FactoryStorage(new IDBFactory());
  try {
    const record = {
      ...captureFactory(w.factory, w.construction.placements, w.generator),
      placements: [],
    };
    await storage.write(record);
    const unreadable = await storage.read();
    assert.throws(() => restoreFactory(unreadable), /Missing/);
    assert.deepEqual(await storage.read(), unreadable);
    storage.dispose();
    await assert.rejects(storage.read(), /disposed/);
  } finally {
    storage.dispose();
    w.factory.dispose();
  }
  const unavailable = new FactoryStorage();
  await assert.rejects(unavailable.read(), /unavailable/);
  unavailable.dispose();
  const pending = new FactoryStorage(new IDBFactory());
  const read = pending.read();
  pending.dispose();
  await assert.rejects(read, /cancelled/);
});
