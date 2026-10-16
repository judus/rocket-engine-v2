import test from 'node:test';
import assert from 'node:assert/strict';
import { FactoryDemo } from '../examples/workshop/FactoryDemo.js';
import { scatterFacilities } from '../examples/workshop/StressPlacements.js';
import { FacilityVisuals } from '../examples/workshop/FacilityVisuals.js';

void test('6000 independent facilities produce while spatial presentation leaves and returns', () => {
  const factory = new FactoryDemo(2000);
  const placements = scatterFacilities(factory.ids);
  const visuals = new FacilityVisuals(placements);
  try {
    assert.equal(factory.read([]).summary.facilityCount, 6000);
    assert.equal(factory.read([]).summary.inventoryCount, 6000);
    assert.equal(
      new Set(placements.map((p) => `${p.cell.x},${p.cell.y}`)).size,
      6000,
    );
    assert.deepEqual(scatterFacilities(factory.ids), placements);
    assert.ok(
      placements.every(
        (p) => Math.abs(p.cell.x) <= 128 && Math.abs(p.cell.y) <= 128,
      ),
    );
    const home = { minX: -8, minY: -8, maxX: 72, maxY: 37 };
    let queries = 0;
    visuals.update(() => {
      queries++;
      return true;
    }, home);
    const ids = visuals.ids();
    assert.ok(ids.length > 0 && ids.length < 6000);
    assert.ok(queries < 6000);
    factory.advance(0.05);
    assert.equal(
      factory.read().facilities.filter((f) => f.jobs[0]?.state === 'producing')
        .length,
      6000,
    );
    const homeState = factory.read(ids);
    assert.equal(homeState.facilities.length, ids.length);
    visuals.update(() => true, {
      minX: 1000,
      minY: 1000,
      maxX: 1080,
      maxY: 1045,
    });
    assert.equal(visuals.stats.retained, 0);
    factory.advance(4);
    const away = factory.read([]);
    assert.ok(away.completed >= 4000);
    assert.equal(away.summary.facilityCount, 6000);
    visuals.update(() => true, home);
    assert.deepEqual(visuals.ids(), ids);
    assert.ok(
      factory
        .read(ids)
        .facilities.every((f) => f.jobs[0]!.batchesCompleted > 0),
    );
    assert.ok(away.events.length <= 8);
    visuals.dispose();
    factory.advance(0.05);
    assert.equal(factory.read([]).summary.facilityCount, 6000);
    assert.throws(() => scatterFacilities(factory.ids, 10), RangeError);
  } finally {
    visuals.dispose();
    factory.dispose();
  }
});
