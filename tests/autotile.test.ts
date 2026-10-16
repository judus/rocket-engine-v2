import { paintLegacyTile } from '../examples/terrain/LegacyTilePainter.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveFrames,
  higherMask,
  compareDepth,
  neighborOffsets,
  cellRandom,
} from '../examples/terrain/Autotile.js';
import { legacyStyles } from '../examples/terrain/LegacyAtlas.js';
void test('full-frame atlas patterns preserve edges, paired corners and simultaneous disconnected boundaries', () => {
  assert.deepEqual(resolveFrames(0), []);
  assert.deepEqual(resolveFrames(1), ['Top']);
  assert.deepEqual(resolveFrames(65), ['TopLeft']);
  assert.deepEqual(resolveFrames(17), ['Top', 'Bottom']);
  assert.deepEqual(resolveFrames(170), [
    'TopLeftInner',
    'TopRightInner',
    'BottomLeftInner',
    'BottomRightInner',
  ]);
  assert.deepEqual(resolveFrames(255), [
    'TopLeft',
    'TopRight',
    'BottomLeft',
    'BottomRight',
  ]);
  assert.deepEqual(resolveFrames(5), resolveFrames(7)); // An enclosed diagonal cannot add a second corner.
  for (let mask = 0; mask < 256; mask++) {
    const frames = resolveFrames(mask);
    assert.equal(new Set(frames).size, frames.length);
    for (const style of legacyStyles.slice(2, 11))
      for (const frame of frames) {
        const rect = style.edges[frame];
        assert.ok(rect, `${style.name}: ${frame}`);
        assert.equal(rect[2], 16);
        assert.equal(rect[3], 16);
      }
  }
  for (const invalid of [-1, 256, 0.5, NaN])
    assert.throws(() => resolveFrames(invalid), RangeError);
});
void test('signed boundary masks read their halo from world coordinates and never use cache arrival order', () => {
  const x = -16,
    y = -1;
  for (let bit = 0; bit < 8; bit++) {
    const offset = neighborOffsets[bit];
    assert.ok(offset);
    const read = (px: number, py: number) =>
      px === x + offset[0] && py === y + offset[1] ? 2 : 1;
    assert.equal(higherMask(x, y, read), 1 << bit);
    assert.equal(
      higherMask(x, y, () => 1),
      0,
    );
  }
  assert.equal(
    higherMask(x, y, (px, py) => (px === x && py === y ? 2 : 1)),
    0,
  );
});
void test('feet ordering interleaves walker and trees with deterministic ties and is independent of sprite height', () => {
  const tree = { id: 'tree', x: 16, feetY: 32, height: 112 },
    behind = { id: 'walker', x: 16, feetY: 31, height: 24 };
  assert.deepEqual([tree, behind].sort(compareDepth), [behind, tree]);
  const front = { ...behind, feetY: 33 };
  assert.deepEqual([front, tree].sort(compareDepth), [tree, front]);
  const same = { ...tree, id: 'tree:b' };
  assert.deepEqual([same, tree].sort(compareDepth), [tree, same]);
  assert.equal(cellRandom(42, -1, -16), cellRandom(42, -1, -16));
  assert.notEqual(cellRandom(42, -1, -16), cellRandom(42, -16, -1));
});

void test('legacy painter draws full authored edge extent over flat base without quarter cuts or interior sprites', () => {
  const calls: unknown[][] = [];
  const ctx = {
    fillStyle: '',
    fillRect(...args: unknown[]) {
      calls.push(['fill', ...args]);
    },
    drawImage(...args: unknown[]) {
      calls.push(['image', ...args]);
    },
  } as unknown as CanvasRenderingContext2D;
  const image = {} as ImageBitmap;
  paintLegacyTile(ctx, image, 3, 1, 20, 30);
  assert.deepEqual(calls, [
    ['fill', 20, 30, 16, 16],
    ['image', image, 64, 128, 16, 16, 20, 30, 16, 16],
  ]);
  calls.length = 0;
  paintLegacyTile(ctx, image, 3, 0, 20, 30);
  assert.deepEqual(calls, [['fill', 20, 30, 16, 16]]);
  calls.length = 0;
  paintLegacyTile(ctx, image, 3, 17, 20, 30);
  assert.equal(calls.length, 3); // Both opposite edges survive compositing.
});
