import test from 'node:test';
import assert from 'node:assert/strict';
import { FactoryDemo } from '../examples/workshop/FactoryDemo.js';
import { Construction } from '../examples/workshop/Construction.js';
import { FacilityVisuals } from '../examples/workshop/FacilityVisuals.js';
import {
  captureFactory,
  restoreFactory,
} from '../examples/workshop/FactoryCheckpoint.js';
import { TerrainGenerator } from '../examples/terrain/TerrainGenerator.js';

void test('disconnect drains cargo across reload without new dispatch or lost ownership', () => {
  const f = new FactoryDemo(1, true);
  f.advance(1.1);
  const destination = f.ids[1]!;
  const cargo = f.read().transports[0]!.cargo!;
  f.disconnect(destination);
  assert.equal(f.read().transports[0]!.cargo!.id, cargo.id);
  assert.equal(f.read().transports[0]!.draining, true);
  assert.match(f.removalReason(destination)!, /Cargo/);
  assert.throws(() => f.removeFacility(destination), /Cargo/);
  const restored = FactoryDemo.restore(f.save());
  try {
    restored.advance(2);
    assert.equal(
      restored.read().transports.some((r) => r.destination === destination),
      false,
    );
    assert.equal(restored.read().summary.deliveryCount, 0);
    restored.advance(10);
    assert.equal(
      restored.read().transports.some((r) => r.destination === destination),
      false,
    );
    assert.throws(() => restored.disconnect(destination), /No supply/);
  } finally {
    restored.dispose();
    f.dispose();
  }
});

void test('active batches block removal; drain finishes work and salvage keeps production counters', () => {
  const f = new FactoryDemo(1, true);
  try {
    f.advance(0.1);
    const mine = f.ids[0]!;
    const before = f.save();
    assert.throws(() => f.removeFacility(mine), /batch/);
    assert.deepEqual(f.save(), before);
    f.disconnect(f.ids[1]!);
    f.draining(mine, true);
    f.advance(1.1);
    assert.equal(f.removalReason(mine), null);
    f.removeFacility(mine);
    assert.equal(f.ids.includes(mine), false);
    assert.equal(f.read().stock.quantities.ore, 2);
    assert.equal(f.read().summary.inventoryCount, 5); // Empty private buffers are retired.
    const replacement = f.addFacility('mine');
    assert.notEqual(replacement, mine);
    assert.equal(
      f.read().buffers.find((b) => b.facilityId === replacement)!.input.id,
      'input-3',
    );
    const restored = FactoryDemo.restore(f.save());
    try {
      assert.deepEqual(restored.read().stock, f.read().stock);
    } finally {
      restored.dispose();
    }
  } finally {
    f.dispose();
  }
});

void test('removing a productive press preserves retired history, salvaged parts and checkpoint placements', () => {
  const f = new FactoryDemo(1, true);
  const construction = new Construction(
    f.ids.map((facilityId, i) => ({
      facilityId,
      label: 'Building',
      cell: { x: i * 8, y: 0 },
    })),
  );
  const visuals = new FacilityVisuals(construction.placements);
  let restored: ReturnType<typeof restoreFactory> | undefined;
  try {
    f.advance(12);
    const press = f.ids[2]!;
    f.disconnect(press);
    f.draining(press, true);
    f.advance(5);
    assert.equal(f.removalReason(press), null);
    const before = f.read();
    assert.ok(before.completed > 0);
    visuals.update(() => true);
    const cell = construction.placements.find(
      (p) => p.facilityId === press,
    )!.cell;
    f.removeFacility(press);
    construction.remove(press);
    visuals.removePlacement(press);
    assert.equal(construction.at(cell), undefined);
    assert.equal(construction.preview(cell, () => 'land').valid, true);
    assert.equal(visuals.stats.retained, 2);
    visuals.update(() => true);
    assert.equal(visuals.stats.retained, 2);
    assert.equal(f.read().completed, before.completed);
    assert.equal(
      f.read().stock.quantities.parts,
      before.stock.quantities.parts,
    );
    restored = restoreFactory(
      captureFactory(
        f,
        construction.placements,
        new TerrainGenerator({ seed: 42, scale: 48 }),
      ),
    );
    assert.equal(restored.factory.read().completed, before.completed);
    assert.equal(restored.construction.at(cell), undefined);
    assert.equal(restored.factory.collect(), before.completed);
    const again = FactoryDemo.restore(restored.factory.save());
    try {
      assert.equal(again.read().collected, before.completed);
    } finally {
      again.dispose();
    }
  } finally {
    restored?.factory.dispose();
    visuals.dispose();
    f.dispose();
  }
});

void test('salvage capacity refusal is atomic and shared-mode removal retains live reservations', () => {
  const f = new FactoryDemo(1, true);
  f.disconnect(f.ids[1]!);
  f.draining(f.ids[0]!, true);
  const save = f.save();
  save.simulation.inventories.find((i) => i.id === 'stock')!.quantities.ore =
    20;
  save.simulation.inventories.find((i) => i.id === 'output-0')!.quantities.ore =
    2;
  const full = FactoryDemo.restore(save);
  const shared = new FactoryDemo();
  try {
    const before = full.save();
    assert.throws(() => full.removeFacility(full.ids[0]!), /room/);
    assert.deepEqual(full.save(), before);
    shared.advance(0.1);
    const idle = shared.ids[2]!;
    shared.removeFacility(idle);
    assert.equal(shared.ids.length, 2);
    const restored = FactoryDemo.restore(shared.save());
    try {
      restored.advance(5);
      assert.equal(restored.ids.length, 2);
    } finally {
      restored.dispose();
    }
    full.dispose();
    assert.throws(() => full.disconnect('missing'), /disposed/);
  } finally {
    f.dispose();
    full.dispose();
    shared.dispose();
  }
});

void test('Workshop 2 retirement keeps only live private buffers and restores monotonic IDs after churn', () => {
  let f = new FactoryDemo(1, true);
  try {
    for (const id of [...f.ids]) f.removeFacility(id);
    assert.equal(f.read().summary.inventoryCount, 1);
    for (let i = 0; i < 20; i++) {
      const id = f.addFacility('press');
      assert.equal(f.read().summary.inventoryCount, 3);
      f.removeFacility(id);
      assert.equal(f.read().summary.inventoryCount, 1);
    }
    const saved = f.save();
    assert.equal(saved.simulation.version, 4);
    const restored = FactoryDemo.restore(saved);
    f.dispose();
    f = restored;
    const id = f.addFacility('mine');
    assert.equal(f.read().buffers[0]!.input.id, `input-${saved.nextBuffer}`);
    assert.ok(f.ids.includes(id));
    const legacy = { ...f.save() };
    Reflect.deleteProperty(legacy, 'mode');
    assert.throws(() => FactoryDemo.restore(legacy), /state/);
    assert.throws(
      () => FactoryDemo.restore({ ...f.save(), nextBuffer: 0 }),
      /buffer/,
    );
    assert.throws(() =>
      FactoryDemo.restore({
        ...f.save(),
        simulation: { ...f.save().simulation, version: 2 },
      }),
    );
  } finally {
    f.dispose();
  }
});
