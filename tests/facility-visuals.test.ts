import test from 'node:test';
import assert from 'node:assert/strict';
import { FactoryDemo } from '../examples/workshop/FactoryDemo.js';
import {
  FacilityVisuals,
  type Placement,
} from '../examples/workshop/FacilityVisuals.js';
import { ChunkStream, MemoryEdits } from '../examples/streaming/ChunkStream.js';
const home = { minX: 0, minY: 0, maxX: 24, maxY: 8 },
  far = { minX: 1000, minY: -1000, maxX: 1024, maxY: -992 };
void test('factory chunk eviction destroys visuals only; production and stable placement IDs survive return and view recreation', () => {
  const factory = new FactoryDemo(),
    stream = new ChunkStream(new MemoryEdits(), 32, 1);
  const placements: readonly Placement[] = factory.ids.map(
    (facilityId, index) => ({
      facilityId,
      label: String(index),
      cell: { x: 4 + index * 8, y: 4 },
    }),
  );
  let visuals = new FacilityVisuals(placements);
  const ready = (cell: { x: number; y: number }) =>
    stream.read(cell).state === 'ready';
  try {
    stream.demand(home);
    for (let i = 0; i < 12; i++) stream.advance(2);
    visuals.update(ready);
    assert.equal(visuals.stats.retained, 3);
    const originals = visuals.stats.identities,
      ids = [...factory.ids];
    factory.advance(5);
    const before = factory.read();
    stream.demand(far);
    visuals.update(ready);
    assert.equal(visuals.stats.retained, 0);
    assert.equal(visuals.stats.released, 3);
    factory.advance(6);
    const away = factory.read();
    assert.deepEqual(
      away.facilities.map((f) => f.id),
      ids,
    );
    assert.ok(away.summary.tick > before.summary.tick);
    assert.ok(away.completed > before.completed);
    stream.demand(home);
    for (let i = 0; i < 12; i++) stream.advance(2);
    visuals.update(ready);
    assert.equal(visuals.stats.retained, 3);
    assert.notDeepEqual(visuals.stats.identities, originals);
    assert.deepEqual(
      visuals.objects(away).map((o) => o.id),
      ids,
    );
    visuals.dispose();
    const unchanged = factory.read();
    visuals = new FacilityVisuals(placements);
    visuals.update(ready);
    assert.deepEqual(factory.read(), unchanged);
    assert.equal(factory.read().summary.inventoryCount, 1);
    assert.equal(factory.read().summary.facilityCount, 3);
  } finally {
    visuals.dispose();
    stream.dispose();
    factory.dispose();
  }
});
void test('pending terrain and a closed visual owner have no production authority; visibility reads are inert', () => {
  const factory = new FactoryDemo();
  const id = factory.ids[0];
  assert.ok(id);
  const visuals = new FacilityVisuals([
    { facilityId: id, label: 'Mine', cell: { x: -4, y: -4 } },
  ]);
  try {
    visuals.update(() => false);
    assert.equal(visuals.stats.retained, 0);
    factory.advance(3);
    const state = factory.read();
    visuals.update(() => true);
    for (let i = 0; i < 10; i++) visuals.objects(state);
    assert.deepEqual(factory.read(), state);
    assert.equal(visuals.stats.builds, 1);
    visuals.dispose();
    assert.equal(visuals.stats.retained, 0);
    factory.advance(1);
    assert.ok(factory.read().summary.tick > state.summary.tick);
    assert.throws(() => visuals.update(() => true), /disposed/);
  } finally {
    visuals.dispose();
    factory.dispose();
  }
});
