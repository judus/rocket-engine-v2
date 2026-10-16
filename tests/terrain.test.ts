import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainGenerator } from '../examples/terrain/TerrainGenerator.js';

void test('seeded terrain repeats across instances, query order and unrelated generators', () => {
  const a = new TerrainGenerator({ seed: 42 }),
    b = new TerrainGenerator({ seed: 42 });
  const before = a.chunk(-2, 1);
  new TerrainGenerator({ seed: 9, scale: 24 }).chunk(5, -5);
  a.sample(-500, 800);
  b.chunk(0, 0);
  assert.deepEqual(a.chunk(-2, 1), before);
  assert.deepEqual(b.chunk(-2, 1), before);
  assert.notDeepEqual(
    new TerrainGenerator({ seed: 43 }).chunk(-2, 1).heights,
    before.heights,
  );
  assert.notEqual(
    new TerrainGenerator({ seed: 42, scale: 48 }).identity,
    a.identity,
  );
  assert.ok(Object.isFrozen(a.config));
  assert.equal(Reflect.set(a, 'config', { seed: 1, scale: 1 }), false);
});
void test('chunk borders, negative origins and differently sized partitions agree with world samples', () => {
  const generator = new TerrainGenerator({ seed: 777 });
  for (const [x, y] of [
    [-1, -1],
    [0, -1],
    [-1, 0],
    [0, 0],
    [31, -24],
  ] as const) {
    const chunk = generator.chunk(x, y, 16);
    for (let cy = 0; cy < 16; cy++)
      for (let cx = 0; cx < 16; cx++) {
        const sample = generator.sample(x * 16 + cx, y * 16 + cy),
          index = cy * 16 + cx;
        assert.equal(chunk.heights[index], Math.fround(sample.height));
        assert.equal(chunk.moisture[index], Math.fround(sample.moisture));
        assert.equal(chunk.biomes[index], sample.biome);
      }
  }
  const large = generator.chunk(-1, -1, 32),
    small = generator.chunk(-1, -1, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      assert.equal(
        large.heights[(y + 16) * 32 + x + 16],
        small.heights[y * 16 + x],
      );
  // Adjacent border cells need not be equal; continuity must hold at the same position.
  for (const boundary of [-96, -32, 0, 32, 96])
    assert.ok(
      Math.abs(
        generator.sample(boundary - 1e-6, 3.2).height -
          generator.sample(boundary + 1e-6, 3.2).height,
      ) < 1e-6,
    );
  assert.notDeepEqual(generator.sample(-53, 17), generator.sample(53, 17));
});
void test('terrain fields remain finite and classified across signed and distant coordinates; output buffers are owned', () => {
  const generator = new TerrainGenerator({ seed: 0xffffffff });
  const biomes = new Set<number>();
  for (let y = -256; y < 256; y += 7)
    for (let x = -256; x < 256; x += 7) {
      const sample = generator.sample(x, y);
      assert.ok(sample.height >= 0 && sample.height <= 1);
      assert.ok(sample.moisture >= 0 && sample.moisture <= 1);
      biomes.add(sample.biome);
    }
  assert.ok(
    biomes.has(0) &&
      biomes.has(1) &&
      biomes.has(2) &&
      biomes.has(3) &&
      biomes.has(4),
  );
  for (const x of [-1000000, 1000000])
    assert.ok(Number.isFinite(generator.sample(x, -x).height));
  const first = generator.chunk(0, 0),
    expected = generator.chunk(0, 0);
  first.heights.fill(0);
  first.biomes.fill(5);
  assert.deepEqual(generator.chunk(0, 0), expected);
});
void test('terrain configuration and address domain reject invalid or oversized requests', () => {
  for (const seed of [-1, 0.5, NaN, 0x100000000])
    assert.throws(() => new TerrainGenerator({ seed }), RangeError);
  for (const scale of [0, Infinity, 8193])
    assert.throws(() => new TerrainGenerator({ seed: 1, scale }), RangeError);
  const generator = new TerrainGenerator({ seed: 1 });
  assert.throws(() => generator.sample(Infinity, 0), RangeError);
  assert.throws(() => generator.sample(1000001, 0), RangeError);
  assert.throws(() => generator.chunk(0.5, 0), RangeError);
  assert.throws(() => generator.chunk(0, 0, 65), RangeError);
  assert.throws(() => generator.chunk(40000, 0), RangeError);
});
