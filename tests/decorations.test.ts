import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Decorations,
  decorationAt,
  chooseSprite,
  clusterDensity,
} from '../examples/terrain/Decorations.js';
import {
  decorationRules,
  decorationSprites,
} from '../examples/terrain/DecorationCatalog.js';
const bounds = { minX: -16, minY: -16, maxX: 16, maxY: 16 };
void test('all palette variants are reachable; density, height bands and borders affect placement', () => {
  for (const rule of decorationRules)
    for (let step = 0; step < rule.bands.length; step++) {
      const band =
        rule.bands[rule.reverse ? rule.bands.length - 1 - step : step];
      assert.ok(band);
      for (let i = 0; i < band.sprites.length; i++)
        assert.equal(
          chooseSprite(
            rule,
            (step + 0.5) / rule.bands.length,
            1,
            0,
            (i + 0.5) / band.sprites.length,
          )?.id,
          band.sprites[i],
        );
      assert.equal(
        chooseSprite(rule, (step + 0.5) / rule.bands.length, 1, 1, 0),
        null,
      );
    }
  assert.equal(
    chooseSprite(
      {
        reverse: false,
        bands: [{ density: 0, sprites: ['terrain:deco-grass-5-0'] }],
      },
      0,
      1,
      0,
      0,
    ),
    null,
  );
  assert.equal(decorationAt(42, 0, 0, 3, 0.5, 1), null);
  assert.equal(decorationAt(42, 0, 0, 11, 0.99, 0), null);
  assert.equal(clusterDensity(42, -24, -24), clusterDensity(42, -24, -24));
  assert.ok(
    Math.abs(
      clusterDensity(42, -24 - 1e-5, 3) - clusterDensity(42, -24 + 1e-5, 3),
    ) < 1e-5,
  );
  for (const sprite of Object.values(decorationSprites))
    assert.ok(
      sprite.rect[0] >= 0 &&
        sprite.rect[1] >= 0 &&
        sprite.rect[0] + sprite.rect[2] <= 256 &&
        sprite.rect[1] + sprite.rect[3] <= 256,
    );
});
void test('standing still and visibility queries reuse records without sampling or placement; eviction regenerates identically', () => {
  let calls = 0;
  const source = () => {
    calls++;
    return { tier: 6, height: 0.41 };
  };
  const cache = new Decorations(source, 42, 4);
  cache.retain(bounds);
  const a = cache.region(-1, -1),
    snapshot = structuredClone(a),
    initial = calls,
    stats = cache.stats;
  assert.ok(stats.records > 0);
  for (let i = 0; i < 20; i++) {
    cache.retain(bounds);
    cache.visible({ minX: -100, minY: -100, maxX: 200, maxY: 200 });
  }
  assert.equal(calls, initial);
  assert.equal(cache.stats.cells, stats.cells);
  assert.equal(cache.region(-1, -1), a);
  cache.retain({ minX: 160, minY: 160, maxX: 192, maxY: 192 });
  assert.ok(cache.stats.retained <= 4);
  cache.retain(bounds);
  assert.deepEqual(cache.region(-1, -1), snapshot);
  assert.ok(cache.stats.evictions > 0);
  cache.invalidate();
  assert.equal(cache.stats.records, 0);
  cache.retain(bounds);
  assert.deepEqual(cache.region(-1, -1), snapshot);
  cache.dispose();
  assert.equal(cache.stats.retained, 0);
  assert.throws(() => cache.retain(bounds), /disposed/);
});
void test('region arrival order does not change signed placements; culling includes canopy from feet outside the viewport', () => {
  const sample = () => ({ tier: 6, height: 0.41 });
  const a = new Decorations(sample, 42, 4),
    b = new Decorations(sample, 42, 4);
  a.retain(bounds);
  b.retain({ minX: 0, minY: 0, maxX: 16, maxY: 16 });
  b.retain(bounds);
  assert.deepEqual(a.region(-1, -1), b.region(-1, -1));
  const tree = [...a.region(-1, -1), ...a.region(0, 0)].find(
    (r) => r.sprite.kind === 'tree',
  );
  assert.ok(tree);
  const view = {
    minX: tree.x - 5,
    maxX: tree.x + 5,
    minY: tree.feetY - 60,
    maxY: tree.feetY - 20,
  };
  assert.ok(a.visible(view).includes(tree));
  assert.ok(
    !a
      .visible({ minX: tree.x + 1000, maxX: tree.x + 1010, minY: 0, maxY: 1 })
      .includes(tree),
  );
  const before = a.stats;
  assert.throws(
    () => a.retain({ minX: 0, minY: 0, maxX: 1600, maxY: 1600 }),
    RangeError,
  );
  assert.deepEqual(a.stats, before);
});

void test('cached ground details fit their owner tile and the duplicate legacy plant entry uses grass artwork', () => {
  for (const sprite of Object.values(decorationSprites))
    if (sprite.layer === 'ground')
      assert.deepEqual(sprite.rect.slice(2), [16, 16]);
  assert.deepEqual(
    decorationSprites['decorations:water-plant-on-grass-2']?.rect,
    [96, 64, 32, 32],
  );
});
