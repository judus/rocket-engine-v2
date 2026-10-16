import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialIndex, pickTop } from '../src/SpatialIndex.js';
import { compareDepth } from '../examples/terrain/Autotile.js';
import { FacilityVisuals } from '../examples/workshop/FacilityVisuals.js';
import { pickFactory } from '../examples/workshop/FactoryPicking.js';
import type { Decoration } from '../examples/terrain/Decorations.js';

void test('signed uniform grid deduplicates broad queries and honors exclusive bounds', () => {
  const index = new SpatialIndex<string>(8);
  const mutable = { minX: -9, minY: -8, maxX: 8, maxY: 8 };
  index.insert('large', mutable, 'value');
  mutable.minX = 100; // Caller mutation cannot silently change membership.
  index.insert('neighbor', { minX: 8, minY: 0, maxX: 16, maxY: 8 }, 'other');
  assert.equal(
    index.query({ minX: -20, minY: -20, maxX: 20, maxY: 20 }).length,
    2,
  );
  assert.deepEqual(
    index.at({ x: -9, y: -8 }).map((e) => e.id),
    ['large'],
  );
  assert.deepEqual(
    index.at({ x: 8, y: 0 }).map((e) => e.id),
    ['neighbor'],
  );
  assert.equal(index.at({ x: 0, y: 8 }).length, 0);
  assert.deepEqual(index.query({ minX: 8, minY: -8, maxX: 9, maxY: 0 }), []);
  index.dispose();
  assert.equal(index.size, 0);
  assert.equal(index.buckets, 0);
  assert.throws(() => index.at({ x: 0, y: 0 }), /disposed/);
});
void test('moving and removing releases old buckets, and refused updates are atomic', () => {
  const index = new SpatialIndex<{ name: string }>(8, 4);
  const value = { name: 'actor' };
  index.insert('actor', { minX: -8, minY: -8, maxX: 0, maxY: 0 }, value);
  index.update('actor', { minX: 16, minY: 16, maxX: 24, maxY: 24 });
  assert.equal(index.buckets, 1);
  assert.equal(index.at({ x: -1, y: -1 }).length, 0);
  assert.equal(index.at({ x: 16, y: 16 })[0]!.value, value);
  assert.throws(
    () => index.update('actor', { minX: 0, minY: 0, maxX: 100, maxY: 100 }),
    /budget/,
  );
  assert.equal(index.at({ x: 16, y: 16 }).length, 1);
  assert.throws(
    () => index.insert('actor', { minX: 0, minY: 0, maxX: 1, maxY: 1 }, value),
    /duplicate/,
  );
  assert.throws(
    () => index.query({ minX: 0, minY: 0, maxX: Infinity, maxY: 1 }),
    /finite/,
  );
  assert.throws(() => index.at({ x: 1e30, y: 0 }), /safe integers/);
  assert.equal(index.remove('actor'), true);
  assert.equal(index.remove('actor'), false);
  assert.equal(index.buckets, 0);
  index.dispose();
  index.dispose();
});
void test('picking follows draw depth regardless of insertion order and supports narrow geometry', () => {
  const b = { minX: -10, minY: -10, maxX: 10, maxY: 10 };
  const point = { x: 0, y: 0 };
  for (const reverse of [false, true]) {
    const index = new SpatialIndex<{ id: string; x: number; feetY: number }>(8);
    const rows = [
      { id: 'back', x: 0, feetY: 1 },
      { id: 'front', x: 0, feetY: 2 },
    ];
    for (const row of reverse ? [...rows].reverse() : rows)
      index.insert(row.id, b, row);
    assert.equal(index.pick(point, compareDepth)?.id, 'front');
    assert.equal(
      index.pick(point, compareDepth, (v) => v.id !== 'front')?.id,
      'back',
    );
    assert.equal(pickTop(index.at(point), point, () => 0)?.id, 'front');
    assert.throws(() => index.pick(point, () => NaN), /finite/);
    index.dispose();
  }
});
void test('factory picking uses roof geometry, tree occlusion, deterministic depth and visual lifetime', () => {
  const visuals = new FacilityVisuals([
    { facilityId: 'facility', label: 'Press', cell: { x: 0, y: 4 } },
  ]);
  const trees = new SpatialIndex<Decoration>(128);
  const terrain = { candidates: (p: { x: number; y: number }) => trees.at(p) };
  try {
    assert.equal(pickFactory({ x: 8, y: 20 }, visuals, terrain), null); // No ready presentation.
    visuals.update(() => true);
    assert.equal(
      pickFactory({ x: 8, y: 20 }, visuals, terrain)?.id,
      'facility',
    ); // Roof tip.
    assert.equal(pickFactory({ x: 37, y: 19 }, visuals, terrain), null); // Roof's blank AABB corner.
    const tree: Decoration = {
      id: 'tree',
      x: 8,
      feetY: 90,
      sprite: {
        id: 'test',
        sheet: 'decorations',
        rect: [0, 0, 40, 100],
        kind: 'tree',
        layer: 'object',
      },
    };
    trees.insert(tree.id, { minX: -12, minY: -10, maxX: 28, maxY: 90 }, tree);
    assert.equal(
      pickFactory({ x: 8, y: 40 }, visuals, terrain)?.value.kind,
      'decoration',
    );
    trees.remove(tree.id);
    const behind = { ...tree, id: 'behind', feetY: 70 };
    trees.insert(
      behind.id,
      { minX: -12, minY: -30, maxX: 28, maxY: 70 },
      behind,
    );
    assert.equal(
      pickFactory({ x: 8, y: 40 }, visuals, terrain)?.id,
      'facility',
    );
    visuals.update(() => false);
    assert.equal(pickFactory({ x: 8, y: 40 }, visuals, terrain)?.id, 'behind');
    visuals.update(() => true);
    visuals.removePlacement('facility');
    assert.equal(pickFactory({ x: 8, y: 40 }, visuals, terrain)?.id, 'behind');
    assert.equal(visuals.candidates({ x: 8, y: 40 }).length, 0);
  } finally {
    visuals.dispose();
    trees.dispose();
  }
});
