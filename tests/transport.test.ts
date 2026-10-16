import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { FactoryDemo } from '../examples/workshop/FactoryDemo.js';
import {
  captureFactory,
  restoreFactory,
} from '../examples/workshop/FactoryCheckpoint.js';
import { FactoryStorage } from '../examples/workshop/FactoryStorage.js';
import { Construction } from '../examples/workshop/Construction.js';
import { FacilityVisuals } from '../examples/workshop/FacilityVisuals.js';
import { TerrainGenerator } from '../examples/terrain/TerrainGenerator.js';
import { cargoObjects } from '../examples/workshop/CargoVisuals.js';
const placements = (f: FactoryDemo) =>
  f.ids.map((facilityId, i) => ({
    facilityId,
    label: ['Mine', 'Smelter', 'Press'][i] ?? 'Press',
    cell: { x: 4 + i * 8, y: 4 },
  }));

void test('transport holds goods in Workshop cargo until their deadline; factories use separate buffers', () => {
  const f = new FactoryDemo(1, true);
  try {
    assert.equal(f.read().summary.inventoryCount, 7);
    assert.equal(f.read().buffers.length, 3);
    f.advance(1.1);
    const state = f.read(),
      route = state.transports[0]!;
    assert.equal(route.cargo?.state, 'in-transit');
    assert.equal(route.cargo.quantities.ore, 2);
    assert.equal(state.buffers[0]!.output.quantities.ore ?? 0, 0);
    assert.equal(state.buffers[1]!.input.quantities.ore ?? 0, 0);
    const remaining =
      (route.arrivalTick! - state.summary.tick) * 0.05 -
      state.summary.pendingSeconds;
    f.advance(remaining - 0.001);
    assert.equal(f.read().transports[0]!.completed, 0);
    f.advance(0.001);
    assert.equal(f.read().transports[0]!.completed, 1);
    assert.notEqual(f.read().transports[0]!.cargo?.id, route.cargo.id);
    f.advance(10);
    assert.ok(f.read().completed > 0);
    assert.ok(f.read().summary.deliveryCount <= 2);
    assert.equal(f.collect(), f.read().collected);
    assert.throws(() => f.connect(f.ids[0]!, f.ids[2]!), /Connect/);
    assert.throws(() => f.connect(f.ids[0]!, f.ids[1]!), /already/);
  } finally {
    f.dispose();
  }
});
void test('transport scheduling agrees across frame partitions; draw-only cargo and view eviction do not advance it', () => {
  const a = new FactoryDemo(1, true),
    b = new FactoryDemo(1, true);
  const visuals = new FacilityVisuals(placements(a));
  try {
    a.advance(12.017);
    for (let i = 0; i < 240; i++) b.advance(0.05);
    b.advance(0.017);
    assert.deepEqual(
      { ...a.read().summary, pendingSeconds: 0 },
      { ...b.read().summary, pendingSeconds: 0 },
    );
    assert.ok(
      Math.abs(
        a.read().summary.pendingSeconds - b.read().summary.pendingSeconds,
      ) < 1e-9,
    );
    assert.deepEqual(a.read().transports, b.read().transports);
    assert.deepEqual(a.read().facilities, b.read().facilities);
    visuals.update(() => false);
    const state = a.read();
    for (let i = 0; i < 10; i++) cargoObjects(state, placements(a));
    assert.deepEqual(a.read(), state);
    a.advance(8);
    assert.ok(a.read().completed > state.completed);
    visuals.update(() => true);
    assert.equal(visuals.stats.retained, 3);
    const construction = new Construction(placements(a));
    const press = construction.place(
      'press',
      { x: -8, y: -8 },
      () => 'land',
      (kind) => a.addFacility(kind),
    );
    assert.ok(press);
    a.connect(a.ids[1]!, press.facilityId, 1);
    a.advance(10);
    assert.ok(
      a.read().facilities.find((f) => f.id === press.facilityId)!.jobs[0]!
        .batchesCompleted > 0,
    );
    assert.ok(a.read().summary.deliveryCount <= 3);
  } finally {
    visuals.dispose();
    a.dispose();
    b.dispose();
  }
});
void test('in-transit checkpoints restore cargo identities and deadlines with deterministic continuation in an isolated slot', async () => {
  const f = new FactoryDemo(1, true),
    idb = new IDBFactory();
  const storage = new FactoryStorage(idb, 'transport-w2-v4'),
    normal = new FactoryStorage(idb);
  let restored: ReturnType<typeof restoreFactory> | undefined;
  try {
    f.advance(1.417);
    const record = captureFactory(
      f,
      placements(f),
      new TerrainGenerator({ seed: 42, scale: 48 }),
    );
    assert.equal(record.version, 4);
    await storage.write(record);
    assert.equal(await normal.read(), undefined);
    restored = restoreFactory(await storage.read());
    assert.deepEqual(restored.factory.read().transports, f.read().transports);
    assert.deepEqual(restored.factory.read().summary, f.read().summary);
    assert.equal(
      cargoObjects(restored.factory.read(), restored.construction.placements)
        .length,
      1,
    );
    f.advance(12);
    restored.factory.advance(12);
    assert.deepEqual(restored.factory.read().transports, f.read().transports);
    assert.deepEqual(restored.factory.read().stock, f.read().stock);
    assert.equal(restored.factory.read().completed, f.read().completed);
    const routes = record.factory.routes!;
    assert.throws(
      () =>
        restoreFactory({
          ...record,
          factory: { ...record.factory, routes: [] },
        }),
      /Orphaned/,
    );
    assert.throws(
      () =>
        restoreFactory({
          ...record,
          factory: {
            ...record.factory,
            routes: routes.map((r, i) =>
              i ? r : { ...r, arrivalTick: r.arrivalTick! + 1 },
            ),
          },
        }),
      /deadline/,
    );
    assert.throws(
      () => restoreFactory({ ...record, version: 1 }),
      /checkpoint/,
    );
  } finally {
    f.dispose();
    restored?.factory.dispose();
    storage.dispose();
    normal.dispose();
  }
});
void test('blocked arrival retains cargo, restores it and retries unloading after the destination can consume', () => {
  const f = new FactoryDemo(1, true);
  let restored: FactoryDemo | undefined;
  try {
    f.advance(1.1);
    f.enabled(1, false);
    const saved = f.save();
    const input = saved.simulation.inventories.find((i) => i.id === 'input-1')!;
    input.quantities.ore = 20; // A valid prefilled destination fixture.
    restored = FactoryDemo.restore(saved);
    restored.advance(3);
    const held = restored.read().transports[0]!;
    assert.equal(held.cargo?.state, 'arrival-blocked');
    assert.equal(held.cargo.quantities.ore, 2);
    const again = FactoryDemo.restore(restored.save());
    try {
      assert.equal(again.read().transports[0]!.cargo?.id, held.cargo.id);
      again.enabled(1, true);
      again.advance(0.05);
      assert.equal(again.read().transports[0]!.completed, 1);
    } finally {
      again.dispose();
    }
  } finally {
    f.dispose();
    restored?.dispose();
  }
});
