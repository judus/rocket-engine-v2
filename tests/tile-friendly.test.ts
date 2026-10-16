import test from 'node:test';
import assert from 'node:assert/strict';
import { TileFriendlyTerrain } from '../examples/terrain/TileFriendlyTerrain.js';
import { TerrainGenerator } from '../examples/terrain/TerrainGenerator.js';
void test('tile-friendly opening removes thin peaks; closing fills thin pits without changing broad plateaus', () => {
  const peak = new TileFriendlyTerrain((x) => (x === 0 ? 5 : 0));
  const pit = new TileFriendlyTerrain((x) => (x === 0 ? 0 : 5));
  const broad = new TileFriendlyTerrain((x) => (Math.abs(x) <= 6 ? 5 : 0));
  assert.equal(peak.read(0, 0), 0);
  assert.equal(pit.read(0, 0), 5);
  assert.equal(broad.read(0, 0), 5);
  assert.equal(broad.read(20, 0), 0);
  const constant = new TileFriendlyTerrain(() => 7);
  assert.equal(constant.read(-16, -1), 7);
  assert.equal(constant.stats.changedCells, 0);
});
void test('an abrupt eleven-tier cliff becomes a bounded slope across cardinal and diagonal neighbors', () => {
  const terrain = new TileFriendlyTerrain((x, y) => (x < 0 && y < 0 ? 11 : 0));
  for (let y = -16; y <= 2; y++)
    for (let x = -16; x <= 2; x++)
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [-1, 1],
      ]) {
        assert.ok(dx !== undefined && dy !== undefined);
        assert.ok(
          Math.abs(terrain.read(x, y) - terrain.read(x + dx, y + dy)) <= 1,
          `${x},${y}`,
        );
      }
  assert.equal(terrain.read(-16, -16), 11);
  assert.equal(terrain.read(0, 0), 0);
});
void test('region partitions, signed seams, order and eviction agree; shaping leaves raw fields untouched', () => {
  const generator = new TerrainGenerator({ seed: 42, scale: 48 });
  const sample = generator.sample(-16, -1);
  const source = (x: number, y: number) =>
    Math.max(
      0,
      Math.min(11, Math.floor(generator.sample(x, y).height * 16) - 3),
    );
  const a = new TileFriendlyTerrain(source, 16, 2),
    b = new TileFriendlyTerrain(source, 8, 2);
  const cells = [
    [-17, -1],
    [-16, -1],
    [-1, -16],
    [0, -16],
    [15, 15],
    [16, 16],
    [-300, 800],
  ] as const;
  const expected = cells.map(([x, y]) => a.read(x, y));
  for (let i = cells.length - 1; i >= 0; i--) {
    const cell = cells[i];
    assert.ok(cell);
    assert.equal(b.read(cell[0], cell[1]), expected[i]);
  }
  assert.deepEqual(
    cells.map(([x, y]) => a.read(x, y)),
    expected,
  );
  assert.deepEqual(generator.sample(-16, -1), sample);
  assert.ok(a.stats.retained <= 2);
  assert.equal(a.stats.tileBytes, a.stats.retained * 256);
  a.dispose();
  assert.equal(a.stats.retained, 0);
  assert.throws(() => a.read(0, 0), /disposed/);
});
void test('invalid source output and addresses fail without publishing a partial region', () => {
  const terrain = new TileFriendlyTerrain((x, y) =>
    x === 0 && y === 0 ? 12 : 0,
  );
  assert.throws(() => terrain.read(0, 0), RangeError);
  assert.equal(terrain.stats.retained, 0);
  assert.equal(terrain.stats.builds, 0);
  for (const [x, y] of [
    [NaN, 0],
    [0.5, 0],
    [1000000, 0],
  ])
    assert.throws(() => terrain.read(x!, y!), RangeError);
  assert.throws(() => new TileFriendlyTerrain(() => 0, 0), RangeError);
});
