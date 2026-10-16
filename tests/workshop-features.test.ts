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
function world() {
  const factory = new FactoryDemo(1, true, true);
  const construction = new Construction(
    factory.ids.map((facilityId, i) => ({
      facilityId,
      label: ['Mine', 'Smelter', 'Press'][i]!,
      cell: { x: i * 8, y: 0 },
    })),
  );
  return { factory, construction };
}
function publish(f: FactoryDemo, c: Construction) {
  for (const done of f.takeCompletedSites())
    c.completeSite(done.orderId, done.facilityId, done.kind);
}

void test('timed construction reserves shared materials, never produces before completion and cancellation releases ownership', () => {
  const { factory: f, construction: c } = world();
  try {
    const initial = f.read();
    assert.equal(initial.depot.quantities.ore, 12);
    const a = c.place(
      'press',
      { x: -8, y: -8 },
      () => 'land',
      (kind) => f.orderFacility(kind),
    )!;
    const b = c.place(
      'press',
      { x: -16, y: -8 },
      () => 'land',
      (kind) => f.orderFacility(kind),
    )!;
    const d = c.place(
      'press',
      { x: -24, y: -8 },
      () => 'land',
      (kind) => f.orderFacility(kind),
    )!;
    f.advance(1);
    assert.equal(f.ids.length, 3);
    assert.equal(f.read().summary.inventoryCount, 13);
    assert.equal(f.read().depot.quantities.ore, 12); // Reserved, not charged early.
    assert.equal(f.read().depot.reserved.ore, 12);
    assert.equal(
      f.read().orders.find((o) => o.id === d.facilityId)!.state,
      'waiting-materials',
    );
    f.cancelSite(a.facilityId);
    c.remove(a.facilityId);
    assert.equal(f.read().depot.reserved.ore, 6);
    assert.equal(f.read().summary.inventoryCount, 11);
    assert.equal(c.preview(a.cell, () => 'land').valid, true);
    f.advance(0.05);
    assert.equal(
      f.read().orders.find((o) => o.id === d.facilityId)!.state,
      'building',
    );
    assert.ok(f.read().orders.find((o) => o.id === b.facilityId)!.progress > 0);
    f.advance(13);
    assert.throws(() => f.save(), /Publish/);
    publish(f, c);
    assert.equal(f.ids.length, 5);
    assert.equal(f.read().orders.length, 0);
    assert.equal(f.read().depot.quantities.ore, 0);
    assert.equal(f.read().summary.inventoryCount, 11);
    const placements = c.placements.map((p) => p.facilityId);
    assert.equal(placements.includes(b.facilityId), false);
    assert.equal(placements.includes(d.facilityId), false);
    assert.deepEqual(new Set(placements), new Set(f.ids));
    assert.equal(f.read().completed, 0); // No absent operators can produce.
  } finally {
    f.dispose();
  }
});

void test('operator absence and per-building pause freeze progress while autonomous mine and transport continue', () => {
  const f = new FactoryDemo(1, true, true);
  try {
    const mine = f.ids[0]!,
      smelter = f.ids[1]!,
      press = f.ids[2]!;
    f.advance(8);
    assert.equal(f.read().completed, 0);
    assert.ok(
      f.read().facilities.find((row) => row.id === mine)!.jobs[0]!
        .batchesCompleted > 0,
    );
    f.operatorOnSite(smelter, true);
    f.operatorOnSite(press, true);
    f.advance(3.5);
    const before = f.read().facilities.find((row) => row.id === smelter)!
      .jobs[0]!.progress;
    assert.ok(before > 0);
    f.operatorOnSite(smelter, false);
    f.advance(1);
    assert.equal(
      f.read().facilities.find((row) => row.id === smelter)!.jobs[0]!.progress,
      before,
    );
    f.operatorOnSite(smelter, true);
    f.pauseFacility(smelter, true);
    const saved = FactoryDemo.restore(f.save());
    try {
      const tick = saved.read().summary.tick;
      saved.advance(3);
      assert.equal(
        saved.read().facilities.find((row) => row.id === smelter)!.jobs[0]!
          .progress,
        before,
      );
      assert.ok(saved.read().summary.tick > tick);
      assert.equal(
        saved.read().facilities.find((row) => row.id === smelter)!.attendance
          .operator,
        1,
      );
      saved.pauseFacility(smelter, false);
      saved.advance(8);
      assert.ok(saved.read().completed > 0);
      saved.operatorOnSite(press, false);
      const count = saved.read().completed;
      saved.advance(8);
      assert.equal(saved.read().completed, count);
    } finally {
      saved.dispose();
    }
  } finally {
    f.dispose();
  }
});

void test('pending sites, reservation/progress and occupancy resume identically after a full checkpoint', () => {
  const { factory: f, construction: c } = world();
  let restored: ReturnType<typeof restoreFactory> | undefined;
  try {
    c.place(
      'smelter',
      { x: -8, y: -8 },
      () => 'land',
      (kind) => f.orderFacility(kind),
    );
    f.advance(1.417);
    restored = restoreFactory(
      captureFactory(
        f,
        c.placements,
        new TerrainGenerator({ seed: 42, scale: 48 }),
      ),
    );
    assert.equal(restored.factory.workshop, true);
    assert.deepEqual(restored.factory.read().orders, f.read().orders);
    assert.equal(
      restored.construction.preview({ x: -8, y: -8 }, () => 'land').valid,
      false,
    );
    f.advance(10);
    restored.factory.advance(10);
    publish(f, c);
    publish(restored.factory, restored.construction);
    assert.deepEqual(restored.factory.read().facilities, f.read().facilities);
    assert.deepEqual(restored.factory.read().depot, f.read().depot);
    assert.deepEqual(
      restored.construction.placements.map((p) => p.facilityId),
      c.placements.map((p) => p.facilityId),
    );
    const again = restoreFactory(
      captureFactory(
        restored.factory,
        restored.construction.placements,
        restored.generator,
      ),
    );
    try {
      assert.deepEqual(again.factory.read().facilities, f.read().facilities);
    } finally {
      again.factory.dispose();
    }
  } finally {
    f.dispose();
    restored?.factory.dispose();
  }
});

void test('depot supply transfers actual goods; site/view lifetime is separate from domain construction', () => {
  const { factory: f, construction: c } = world();
  const visuals = new FacilityVisuals(c.placements);
  try {
    const site = c.place(
      'mine',
      { x: -8, y: -8 },
      () => 'land',
      (kind) => f.orderFacility(kind),
    )!;
    visuals.addPlacement(site);
    visuals.update(() => true);
    const stock = f.read().depot.quantities.ore!;
    f.advance(1.1);
    const supply = f.supplyDepot();
    assert.equal(supply, 2);
    assert.equal(f.read().depot.quantities.ore, stock + supply);
    assert.equal(f.read().buffers[0]!.output.quantities.ore ?? 0, 0);
    visuals.dispose();
    f.advance(6);
    publish(f, c);
    assert.equal(f.ids.length, 4);
    const next = new FacilityVisuals(c.placements);
    try {
      next.update(() => true);
      assert.equal(next.ids().length, 4);
    } finally {
      next.dispose();
    }
    f.dispose();
    assert.throws(() => f.orderFacility('mine'), /disposed/);
  } finally {
    visuals.dispose();
    f.dispose();
  }
});
