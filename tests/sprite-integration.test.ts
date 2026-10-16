import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene2D, Node2D } from '../src/index.js';
import { atlas } from '../examples/sprites/atlas.js';
import { createSprite } from '../examples/sprites/createSprite.js';
class Bitmap {
  width = 96;
  height = 32;
}
const image = new Bitmap() as ImageBitmap;
const frame = { dt: 0.2, time: 0.2 };
void test('shared atlas produces independent scene-owned players and flipped nested picking', (t) => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'ImageBitmap');
  Object.defineProperty(globalThis, 'ImageBitmap', {
    configurable: true,
    value: Bitmap,
  });
  t.after(() => {
    if (old) Object.defineProperty(globalThis, 'ImageBitmap', old);
    else Reflect.deleteProperty(globalThis, 'ImageBitmap');
  });
  const scene = new Scene2D();
  const parent = scene.root.add(
    new Node2D({ x: 100, y: -30, rotation: 0.7, scaleX: 3, scaleY: 2 }),
  );
  const a = createSprite(atlas, image, 'walk'),
    b = createSprite(atlas, image, 'blink');
  parent.add(a.node);
  scene.root.add(b.node);
  b.player.pause();
  scene.update(0.2, frame);
  assert.equal(a.updates, 1);
  assert.equal(b.updates, 1);
  assert.equal(a.player.snapshot?.phase, 0.2);
  assert.equal(b.player.snapshot?.phase, 0);
  // Off-center pivot: unflipped bounds -10..22, flipped -22..10.
  const right = a.node.localToWorld({ x: 18, y: -10 }),
    left = a.node.localToWorld({ x: -18, y: -10 });
  assert.equal(a.contains(right), true);
  assert.equal(a.contains(left), false);
  a.flips.flipX = true;
  assert.equal(a.contains(right), false);
  assert.equal(a.contains(left), true);
  parent.scaleX = 0;
  assert.equal(a.contains(left), false);
  parent.scaleX = 3;
  a.node.dispose();
  scene.update(0.2, frame);
  assert.equal(a.updates, 1);
  assert.equal(a.player.status, 'disposed');
  assert.equal(b.updates, 2);
  assert.equal(a.contains(left), false);
  assert.equal(image.width, 96);
  scene.dispose();
  assert.equal(b.player.status, 'disposed');
});
void test('two tree renders do not advance playback; tree cleanup precedes image lease', () => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'ImageBitmap');
  class Bitmap {
    width = 96;
    height = 32;
  }
  Object.defineProperty(globalThis, 'ImageBitmap', {
    configurable: true,
    value: Bitmap,
  });
  try {
    const scene = new Scene2D(),
      a = createSprite(atlas, new Bitmap() as ImageBitmap, 'walk');
    scene.root.add(a.node);
    let released = 0;
    scene.own(() => {
      assert.equal(a.player.status, 'disposed');
      released++;
      return;
    });
    const ctx = {
      save() {},
      restore() {},
      beginPath() {},
      transform() {},
      scale() {},
      drawImage() {},
      strokeRect() {},
      fillRect() {},
    } as unknown as CanvasRenderingContext2D;
    scene.update(0.2, frame);
    const phase = a.player.snapshot?.phase;
    scene.draw(ctx, frame);
    scene.draw(ctx, frame);
    assert.equal(a.draws, 2);
    assert.equal(a.updates, 1);
    assert.equal(a.player.snapshot?.phase, phase);
    scene.dispose();
    scene.dispose();
    assert.equal(released, 1);
  } finally {
    if (old) Object.defineProperty(globalThis, 'ImageBitmap', old);
    else Reflect.deleteProperty(globalThis, 'ImageBitmap');
  }
});
