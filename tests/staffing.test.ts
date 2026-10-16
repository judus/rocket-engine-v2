import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
  createStaffedWorkplace,
  restoreStaffedWorkplace,
  type StaffingCheckpoint,
} from '../examples/workshop/StaffingCheckpoint.js';
import { FactoryStorage } from '../examples/workshop/FactoryStorage.js';
import { Staffing } from '../examples/workshop/StaffingCoordinator.js';
import {
  GridTraversal,
  GridNavigator,
  Movement,
} from '../src/navigation/index.js';
type Model = ReturnType<typeof createStaffedWorkplace>;
const a = 'worker-a',
  b = 'worker-b',
  smelter = 'smelter.operator.0',
  press = 'press.operator.0';
function step(m: Model, dt = 1 / 60) {
  m.stream.advance(4);
  m.staffing.reconcile();
  m.factory.advance(dt);
  m.staffing.update(dt);
}
function run(m: Model, seconds: number) {
  for (let i = 0; i < seconds * 60; i++) step(m);
}
const worker = (m: Model, id: string) =>
  m.staffing.snapshot().workers.find((w) => w.id === id)!;
const count = (m: Model, id: string) =>
  m.factory.read().facilities.find((f) => f.id === id)!.attendance.operator ??
  0;
void test('exclusive slot claim rejects the second worker atomically without clearing their existing assignment', () => {
  const m = createStaffedWorkplace();
  try {
    m.staffing.assign(a, press);
    m.staffing.assign(b, smelter);
    const before = m.save(),
      owners = m.stream.stats.owners;
    assert.throws(() => m.staffing.assign(b, press), /reserved by worker-a/);
    assert.deepEqual(m.save(), before);
    assert.equal(m.stream.stats.owners, owners);
    assert.equal(count(m, m.smelter), 0);
    assert.equal(count(m, m.press), 0);
    run(m, 24);
    assert.equal(count(m, m.smelter), 1);
    assert.equal(count(m, m.press), 1);
    assert.equal(worker(m, a).present, press);
    assert.equal(worker(m, b).present, smelter);
    assert.ok(m.factory.read().completed > 0);
  } finally {
    m.dispose();
  }
});
void test('one coordinator publishes aggregate counts for two distinct slots at the same workplace', () => {
  const domain = { minX: 0, minY: 0, columns: 10, rows: 4, tileSize: 10 };
  const world = new GridTraversal(
    domain,
    () => ({ status: 'passable', cost: 1 }),
    () => 0,
  );
  const changes: number[] = [];
  const staffing = new Staffing({
    slots: () => [
      { id: 'one', workplace: 'shop', position: { x: 35, y: 15 } },
      { id: 'two', workplace: 'shop', position: { x: 65, y: 15 } },
    ],
    canStand: () => true,
    setAttendance(_id, n) {
      changes.push(n);
    },
  });
  const profile = { radius: 2, clearance: 0, capabilities: ['walk'] };
  staffing.add(
    a,
    new Movement(new GridNavigator(world, domain), { x: 15, y: 15 }, profile),
  );
  staffing.add(
    b,
    new Movement(new GridNavigator(world, domain), { x: 15, y: 25 }, profile),
  );
  try {
    staffing.assign(a, 'one');
    staffing.assign(b, 'two');
    staffing.update(1);
    assert.equal(changes.at(-1), 2);
    staffing.cancel(a);
    assert.equal(changes.at(-1), 1);
    staffing.remove(b);
    assert.equal(changes.at(-1), 0);
  } finally {
    staffing.dispose();
  }
});
void test('blocked on-site terrain clears only attendance while preserving its exclusive reservation', () => {
  const m = createStaffedWorkplace();
  try {
    m.staffing.assign(a, smelter);
    m.staffing.assign(b, press);
    run(m, 16);
    const before = m.factory.read().facilities[1]!.jobs[0]!.progress;
    assert.ok(m.stream.set({ x: 7, y: 1 }, 1));
    m.staffing.reconcile();
    assert.equal(count(m, m.smelter), 0);
    assert.equal(count(m, m.press), 1);
    assert.throws(() => m.staffing.assign(b, smelter), /reserved/);
    run(m, 1);
    assert.equal(m.factory.read().facilities[1]!.jobs[0]!.progress, before);
    assert.equal(worker(m, b).target, press);
    assert.ok(m.stream.set({ x: 7, y: 1 }, 0));
    m.staffing.reconcile();
    assert.equal(count(m, m.smelter), 1);
  } finally {
    m.dispose();
  }
});
void test('cancel, reassignment and disposal free reservations and only their own movement demand', () => {
  const m = createStaffedWorkplace();
  try {
    m.staffing.assign(a, smelter);
    m.staffing.assign(b, press);
    assert.equal(m.stream.stats.owners, 4);
    m.staffing.cancel(a);
    assert.equal(m.stream.stats.owners, 3);
    assert.deepEqual(m.staffing.snapshot().reservations, [
      { slot: press, worker: b },
    ]);
    m.staffing.assign(b, smelter);
    assert.deepEqual(m.staffing.snapshot().reservations, [
      { slot: smelter, worker: b },
    ]);
    m.removeWorker(b);
    assert.equal(m.stream.stats.owners, 1);
    assert.equal(m.staffing.snapshot().reservations.length, 0);
    assert.equal(m.save().workers.length, 1);
    m.staffing.assign(a, smelter);
    run(m, 3);
    assert.equal(count(m, m.smelter), 1);
    m.dispose();
    m.dispose();
    assert.equal(m.stream.stats.owners, 0);
  } finally {
    m.dispose();
  }
});
void test('terminal failure frees the slot but opening the passage never silently retries an intention', () => {
  const m = createStaffedWorkplace();
  try {
    for (let y = -8; y < -3; y++)
      for (const x of [12, 13]) m.edits.set({ x, y }, 1);
    m.staffing.assign(a, press);
    run(m, 4);
    assert.equal(worker(m, a).status, 'unreachable');
    assert.equal(m.staffing.snapshot().reservations.length, 0);
    m.staffing.assign(b, press);
    run(m, 4);
    assert.equal(worker(m, b).status, 'unreachable');
    for (let y = -8; y < -3; y++)
      for (const x of [12, 13]) assert.ok(m.stream.set({ x, y }, 0));
    run(m, 1);
    assert.equal(worker(m, a).status, 'unreachable');
    assert.equal(count(m, m.press), 0);
    const restored = restoreStaffedWorkplace(m.save());
    try {
      assert.equal(worker(restored, a).status, 'unreachable');
      assert.equal(restored.staffing.snapshot().reservations.length, 0);
      restored.staffing.assign(a, press);
      run(restored, 16);
      assert.equal(count(restored, restored.press), 1);
    } finally {
      restored.dispose();
    }
  } finally {
    m.dispose();
  }
});
void test('relocated or removed slots cancel their owner and clear attendance without choosing another workplace', () => {
  const m = createStaffedWorkplace();
  try {
    m.staffing.assign(a, smelter);
    m.staffing.assign(b, press);
    run(m, 16);
    m.slots[0] = { ...m.slots[0]!, position: { x: 272, y: 48 } };
    m.staffing.reconcile();
    assert.equal(worker(m, a).target, null);
    assert.equal(count(m, m.smelter), 0);
    assert.equal(count(m, m.press), 1);
    m.slots.pop();
    m.staffing.reconcile();
    assert.equal(worker(m, b).target, null);
    assert.equal(m.staffing.snapshot().reservations.length, 0);
  } finally {
    m.dispose();
  }
});
void test('checkpoint restores two identities and reservations, rebuilds travel and waits for real attendance', () => {
  const m = createStaffedWorkplace();
  m.staffing.assign(a, smelter);
  m.staffing.assign(b, press);
  run(m, 3);
  const saved = m.save(),
    one = restoreStaffedWorkplace(saved),
    two = restoreStaffedWorkplace(saved);
  try {
    assert.equal(saved.workers[0]!.phase, 'arrived');
    assert.equal(saved.workers[1]!.phase, 'travelling');
    assert.deepEqual(one.staffing.save(), {
      workers: saved.workers,
      reservations: saved.reservations,
    });
    assert.equal(count(one, one.smelter), 0);
    assert.equal(count(one, one.press), 0);
    assert.equal(
      one.factory.read().summary.tick,
      m.factory.read().summary.tick,
    );
    run(one, 16);
    run(two, 16);
    assert.equal(count(one, one.smelter), 1);
    assert.equal(count(one, one.press), 1);
    assert.deepEqual(one.save(), two.save());
  } finally {
    m.dispose();
    one.dispose();
    two.dispose();
  }
});
void test('disposed workers stay absent after restore; an empty roster never respawns default workers', () => {
  const m = createStaffedWorkplace();
  try {
    m.staffing.assign(a, smelter);
    m.removeWorker(a);
    const one = restoreStaffedWorkplace(m.save());
    try {
      assert.equal(one.walkers.has(a), false);
      assert.equal(one.walkers.size, 1);
      assert.equal(one.staffing.snapshot().reservations.length, 0);
    } finally {
      one.dispose();
    }
    m.removeWorker(b);
    const zero = restoreStaffedWorkplace(m.save());
    try {
      assert.equal(zero.walkers.size, 0);
      assert.equal(zero.stream.stats.owners, 0);
    } finally {
      zero.dispose();
    }
  } finally {
    m.dispose();
  }
});
void test('malformed worker identities and reservation associations reject the whole checkpoint', () => {
  const m = createStaffedWorkplace();
  try {
    m.staffing.assign(a, smelter);
    m.staffing.assign(b, press);
    const save = m.save();
    for (const invalid of [
      { ...save, version: 0 },
      { ...save, workers: [save.workers[0], save.workers[0]] },
      { ...save, workers: [{ ...save.workers[0], id: 'stranger' }] },
      { ...save, reservations: [] },
      { ...save, reservations: [save.reservations[0], save.reservations[0]] },
      {
        ...save,
        reservations: [
          { slot: smelter, worker: b },
          { slot: press, worker: a },
        ],
      },
      { ...save, reservations: [{ slot: 'absent', worker: a }] },
      {
        ...save,
        workers: [
          { ...save.workers[0], destination: { x: 241, y: 48 } },
          save.workers[1],
        ],
      },
    ])
      assert.throws(() => restoreStaffedWorkplace(invalid));
    assert.deepEqual(m.save(), save);
  } finally {
    m.dispose();
  }
});
void test('atomic staffing save retains the old record and live reservations after a failed write', async () => {
  const storage = new FactoryStorage<StaffingCheckpoint>(
      new IDBFactory(),
      'staffing-test',
    ),
    m = createStaffedWorkplace();
  try {
    const first = m.save();
    await storage.write(first);
    m.staffing.assign(a, smelter);
    m.staffing.assign(b, press);
    const next = m.save();
    storage.failNextWrite();
    await assert.rejects(storage.write(next));
    assert.deepEqual(await storage.read(), first);
    assert.deepEqual(m.save(), next);
    await storage.write(next);
    const restored = restoreStaffedWorkplace(await storage.read());
    try {
      assert.deepEqual(
        restored.staffing.snapshot().reservations,
        next.reservations,
      );
    } finally {
      restored.dispose();
    }
  } finally {
    storage.dispose();
    m.dispose();
  }
});
