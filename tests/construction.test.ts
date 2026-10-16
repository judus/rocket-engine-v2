import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Construction,
  type Ground,
} from '../examples/workshop/Construction.js';
import { FactoryDemo } from '../examples/workshop/FactoryDemo.js';
import { FacilityVisuals } from '../examples/workshop/FacilityVisuals.js';
const land: Ground = () => 'land';

void test('placement checks every footprint cell for loaded land and persistent occupancy', () => {
  const construction = new Construction([]);
  const cell = { x: -8, y: -8 };
  const preview = construction.preview(cell, land);
  assert.deepEqual(preview.footprint, {
    minX: -9,
    maxX: -6,
    minY: -9,
    maxY: -7,
  });
  assert.equal(preview.valid, true);
  for (const failure of ['unloaded', 'water'] as const) {
    const ground: Ground = (p) => (p.x === -7 && p.y === -9 ? failure : 'land');
    assert.equal(construction.preview(cell, ground).valid, false);
    assert.equal(
      construction.place('mine', cell, ground, () => {
        throw new Error('must not create');
      }),
      null,
    );
    assert.equal(construction.placements.length, 0);
  }
  assert.throws(
    () =>
      construction.place('mine', cell, land, () => {
        throw new Error('creation failed');
      }),
    /creation failed/,
  );
  assert.equal(construction.preview(cell, land).valid, true);
  construction.place('mine', cell, land, () => 'facility-1');
  assert.equal(
    construction.preview(cell, land).reason,
    'Footprint is occupied',
  );
  assert.equal(construction.preview({ x: -6, y: -8 }, land).valid, false);
  assert.equal(construction.preview({ x: -5, y: -8 }, land).valid, true);
  assert.equal(
    construction.place('mine', cell, land, () => {
      throw new Error('duplicate click');
    }),
    null,
  );
  assert.ok(Object.isFrozen(construction.placements[0]!.cell));
});
void test('new facilities and occupancy survive presentation eviction and recreation with one Workshop stockpile', () => {
  const factory = new FactoryDemo();
  const initial = factory.ids.map((facilityId, index) => ({
    facilityId,
    label: 'Initial',
    cell: { x: index * 8, y: 0 },
  }));
  const construction = new Construction(initial);
  let visuals = new FacilityVisuals(construction.placements);
  try {
    const placed = construction.place('press', { x: -8, y: -8 }, land, (kind) =>
      factory.addFacility(kind),
    );
    assert.ok(placed);
    assert.equal(factory.ids.length, 4);
    assert.equal(factory.read().summary.inventoryCount, 1);
    visuals.addPlacement(placed);
    visuals.update(() => true);
    assert.ok(visuals.ids().includes(placed.facilityId));
    visuals.update(() => false);
    assert.equal(visuals.stats.retained, 0);
    factory.advance(12);
    const state = factory.read();
    const presses = state.facilities.filter((f) => f.definitionId === 'press');
    assert.equal(presses.length, 2);
    assert.ok(presses.every((f) => f.jobs[0]!.batchesCompleted > 0));
    assert.equal(
      state.completed,
      presses.reduce((sum, f) => sum + f.jobs[0]!.batchesCompleted, 0),
    );
    visuals.dispose();
    visuals = new FacilityVisuals(construction.placements);
    visuals.update(() => true);
    assert.ok(visuals.ids().includes(placed.facilityId));
    assert.equal(construction.preview(placed.cell, land).valid, false);
    assert.deepEqual(factory.read(), state);
  } finally {
    visuals.dispose();
    factory.dispose();
  }
  assert.throws(() => factory.addFacility('mine'), /disposed/);
});
void test('stress populations reject interactive construction', () => {
  const factory = new FactoryDemo(2);
  try {
    assert.throws(() => factory.addFacility('mine'), /disabled/);
    assert.equal(factory.ids.length, 6);
  } finally {
    factory.dispose();
  }
});
