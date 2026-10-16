import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
  createWorkplace,
  restoreWorkplace,
  type WorkplaceCheckpoint,
} from '../examples/workshop/WorkplaceCheckpoint.js';
import { FactoryStorage } from '../examples/workshop/FactoryStorage.js';
type Model = ReturnType<typeof createWorkplace>;
function step(m: Model, dt = 1 / 60) {
  m.stream.advance(4);
  m.operator.reconcile();
  m.factory.advance(dt);
  m.operator.update(dt);
}
function run(m: Model, seconds: number) {
  for (let i = 0; i < seconds * 60; i++) step(m);
}
void test('arrived checkpoint restores production state but earns attendance only after terrain readiness', () => {
  const a = createWorkplace();
  a.operator.assign(a.smelter);
  run(a, 8);
  const save = a.save(),
    b = restoreWorkplace(save);
  try {
    assert.equal(b.operator.snapshot().status, 'arrived');
    assert.equal(b.operator.snapshot().present, null);
    assert.equal(
      b.factory.read().facilities[1]!.attendance.operator,
      undefined,
    );
    const original = a.factory.read().facilities[1]!.jobs[0]!,
      restored = b.factory.read().facilities[1]!.jobs[0]!;
    assert.equal(restored.progress, original.progress);
    assert.equal(restored.batchesCompleted, original.batchesCompleted);
    assert.deepEqual(restored.batchInputItems, original.batchInputItems);
    assert.deepEqual(b.factory.save().routes, save.factory.routes);
    assert.equal(b.factory.read().summary.tick, a.factory.read().summary.tick);
    assert.equal(b.stream.stats.running, 0);
    b.stream.advance(64);
    b.operator.reconcile();
    assert.equal(b.operator.snapshot().present, b.smelter);
    const twin = restoreWorkplace(save);
    try {
      twin.stream.advance(64);
      twin.operator.reconcile();
      run(b, 3);
      run(twin, 3);
      assert.deepEqual(b.factory.save(), twin.factory.save());
    } finally {
      twin.dispose();
    }
    b.stream.set({ x: 7, y: 1 }, 1);
    b.operator.reconcile();
    const c = restoreWorkplace(b.save());
    try {
      c.stream.advance(64);
      c.operator.reconcile();
      assert.equal(c.operator.snapshot().status, 'arrived');
      assert.equal(c.operator.snapshot().present, null);
      c.stream.set({ x: 7, y: 1 }, 0);
      c.operator.reconcile();
      assert.equal(c.operator.snapshot().present, c.smelter);
    } finally {
      c.dispose();
    }
  } finally {
    a.dispose();
    b.dispose();
  }
});
void test('travelling checkpoint rebuilds route from its precise saved pose without offline movement or production', () => {
  const a = createWorkplace();
  a.operator.assign(a.press);
  run(a, 2);
  const save = a.save(),
    b = restoreWorkplace(save);
  try {
    assert.equal(save.worker.phase, 'travelling');
    assert.deepEqual(b.operator.position, save.worker.position);
    assert.equal(b.operator.snapshot().status, 'blocked');
    assert.equal(b.operator.snapshot().present, null);
    assert.deepEqual(b.factory.save(), save.factory);
    assert.equal(b.walker.snapshot().routeDemand, true);
    run(b, 16);
    assert.equal(b.operator.snapshot().present, b.press);
    assert.equal(b.walker.snapshot().routeDemand, false);
  } finally {
    a.dispose();
    b.dispose();
  }
});
void test('restored unreachable assignment stays terminal even after its terrain opens; only a new assignment restarts', () => {
  const a = createWorkplace();
  for (let y = -8; y < -3; y++)
    for (const x of [12, 13]) a.edits.set({ x, y }, 1);
  a.operator.assign(a.press);
  run(a, 4);
  assert.equal(a.operator.snapshot().status, 'unreachable');
  const b = restoreWorkplace(a.save());
  try {
    b.stream.advance(64);
    for (let y = -8; y < -3; y++)
      for (const x of [12, 13]) {
        assert.equal(b.stream.set({ x, y }, 0), true);
      }
    b.operator.retry();
    run(b, 2);
    assert.equal(b.operator.snapshot().status, 'unreachable');
    assert.equal(b.operator.snapshot().present, null);
    assert.deepEqual(b.operator.position, a.operator.position);
    assert.equal(b.walker.snapshot().routeDemand, false);
    b.operator.assign(b.press);
    run(b, 16);
    assert.equal(b.operator.snapshot().present, b.press);
  } finally {
    a.dispose();
    b.dispose();
  }
});
void test('idle checkpoints retain pose and invalid associations, formats and terrain edits fail without altering live state', () => {
  const a = createWorkplace();
  a.operator.assign(a.smelter);
  run(a, 1);
  a.operator.cancel();
  const save = a.save(),
    b = restoreWorkplace(save);
  try {
    assert.equal(b.operator.snapshot().target, null);
    assert.deepEqual(b.operator.position, a.operator.position);
    assert.equal(b.stream.stats.owners, 1);
    for (const invalid of [
      { ...save, version: 0 },
      { ...save, terrain: 'old' },
      { ...save, worker: { ...save.worker, position: { x: NaN, y: 48 } } },
      {
        ...save,
        worker: {
          ...save.worker,
          target: 'missing',
          destination: { x: 240, y: 48 },
          phase: 'travelling',
        },
      },
      {
        ...save,
        worker: {
          ...save.worker,
          target: a.smelter,
          destination: { x: 241, y: 48 },
          phase: 'travelling',
        },
      },
      {
        ...save,
        worker: {
          ...save.worker,
          target: a.smelter,
          destination: { x: 240, y: 48 },
          phase: 'arrived',
        },
      },
      { ...save, edits: [{ x: 0, y: 0, value: 99 }] },
      {
        ...save,
        edits: [
          { x: 0, y: 0, value: 1 },
          { x: 0, y: 0, value: 1 },
        ],
      },
    ])
      assert.throws(() => restoreWorkplace(invalid));
    assert.deepEqual(a.save(), save);
  } finally {
    a.dispose();
    b.dispose();
  }
});
void test('one IndexedDB slot commits worker and Workshop atomically; failed save keeps prior checkpoint and live state', async () => {
  const factory = new IDBFactory(),
    storage = new FactoryStorage<WorkplaceCheckpoint>(factory, 'worker-test'),
    a = createWorkplace();
  try {
    const first = a.save();
    await storage.write(first);
    a.operator.assign(a.smelter);
    run(a, 4);
    const latest = a.save();
    storage.failNextWrite();
    await assert.rejects(storage.write(latest));
    assert.deepEqual(await storage.read(), first);
    assert.deepEqual(a.save(), latest);
    await storage.write(latest);
    storage.dispose();
    const reopened = new FactoryStorage<WorkplaceCheckpoint>(
      factory,
      'worker-test',
    );
    try {
      const b = restoreWorkplace(await reopened.read());
      try {
        assert.deepEqual(b.operator.position, latest.worker.position);
        assert.equal(b.operator.snapshot().present, null);
      } finally {
        b.dispose();
      }
    } finally {
      reopened.dispose();
    }
  } finally {
    storage.dispose();
    a.dispose();
  }
});
