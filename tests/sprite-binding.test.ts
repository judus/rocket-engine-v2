import test from 'node:test';
import assert from 'node:assert/strict';
import { Sprite2D, loadSprite, bindSpriteIndex } from '../src/sprites/index.js';
import { Scene2D, Node2D, SpatialIndex } from '../src/index.js';
import { atlas } from '../examples/sprites/atlas.js';
import type { ImageLease } from '../src/Assets.js';
class Bitmap {
  width = 96;
  height = 32;
}
function realm(t: { after: (cleanup: () => void) => void }) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'ImageBitmap');
  Object.defineProperty(globalThis, 'ImageBitmap', {
    configurable: true,
    value: Bitmap,
  });
  t.after(() => {
    if (old) Object.defineProperty(globalThis, 'ImageBitmap', old);
    else Reflect.deleteProperty(globalThis, 'ImageBitmap');
  });
}
void test('preparation rejects wrong dimensions/clip and releases acquired lease exactly once', async (t) => {
  realm(t);
  let released = 0;
  const bitmap = new Bitmap();
  const assets = {
    acquireImage: () =>
      Promise.resolve({
        image: bitmap as ImageBitmap,
        dispose: (): undefined => {
          released++;
          return;
        },
      }),
  };
  bitmap.width = 1;
  await assert.rejects(loadSprite(assets, 'x', atlas, 'walk'), /dimensions/);
  assert.equal(released, 1);
  bitmap.width = 96;
  await assert.rejects(loadSprite(assets, 'x', atlas, 'missing'));
  assert.equal(released, 2);
  let sprite: Sprite2D | undefined;
  const owned = {
    acquireImage: () =>
      Promise.resolve({
        image: bitmap as ImageBitmap,
        dispose: (): undefined => {
          assert.equal(sprite!.player.status, 'disposed');
          released++;
          return;
        },
      }),
  };
  sprite = await loadSprite(owned, 'x', atlas, 'walk');
  sprite.dispose();
  sprite.dispose();
  assert.equal(released, 3);
});
void test('late image acquisition after cancellation rolls back without attaching a player', async (t) => {
  realm(t);
  const abort = new AbortController();
  let release = 0,
    resolve!: (lease: ImageLease) => void;
  const promise = loadSprite(
    {
      acquireImage: () =>
        new Promise<ImageLease>((yes) => {
          resolve = yes;
        }),
    },
    'x',
    atlas,
    'walk',
    { signal: abort.signal },
  );
  abort.abort();
  resolve({
    image: new Bitmap() as ImageBitmap,
    dispose: (): undefined => {
      release++;
      return;
    },
  });
  await assert.rejects(promise, { name: 'AbortError' });
  assert.equal(release, 1);
});
void test('one-shot completion is update-only; manual clock rejects scene advancement ownership', (t) => {
  realm(t);
  let complete = 0;
  const scene = new Scene2D();
  const sprite = new Sprite2D(atlas, new Bitmap() as ImageBitmap, 'walk', {
    onComplete: () => {
      complete++;
    },
  });
  scene.root.add(sprite.node);
  sprite.player.play('walk', { mode: 'once' });
  scene.update(2, { dt: 2, time: 2 });
  scene.update(2, { dt: 2, time: 4 });
  assert.equal(complete, 1);
  assert.throws(() => sprite.advance(1), /Scene owns/);
  const manual = new Sprite2D(atlas, new Bitmap() as ImageBitmap, 'walk', {
    clock: 'manual',
  });
  scene.root.add(manual.node);
  scene.update(0.1, { dt: 0.1, time: 4.1 });
  assert.equal(manual.updates, 0);
  manual.advance(0.2);
  assert.equal(manual.updates, 1);
  scene.dispose();
});
void test('index refresh follows nested movement, flips and singular recovery; removal releases membership', (t) => {
  realm(t);
  const scene = new Scene2D(),
    index = new SpatialIndex<Sprite2D>();
  scene.own(index);
  const parent = scene.root.add(
    new Node2D({ x: 100, y: 100, rotation: 0.7, scaleX: 2, scaleY: 3 }),
  );
  const sprite = new Sprite2D(atlas, new Bitmap() as ImageBitmap, 'walk');
  parent.add(sprite.node);
  const membership = bindSpriteIndex(sprite, index, 'actor');
  assert.equal(index.size, 1);
  const before = sprite.node.localToWorld({ x: 18, y: -10 });
  assert.equal(
    index.pick(
      before,
      () => 0,
      (s, p) => s.contains(p),
    )?.value,
    sprite,
  );
  parent.x += 400;
  sprite.flips.flipX = true;
  membership.refresh();
  assert.equal(index.at(before).length, 0);
  const after = sprite.node.localToWorld({ x: -18, y: -10 });
  assert.equal(
    index.pick(
      after,
      () => 0,
      (s, p) => s.contains(p),
    )?.value,
    sprite,
  );
  parent.scaleX = 0;
  membership.refresh();
  assert.equal(index.size, 0);
  assert.equal(sprite.worldBounds, null);
  parent.scaleX = 2;
  membership.refresh();
  assert.equal(index.size, 1);
  sprite.dispose();
  assert.equal(index.size, 0);
  scene.dispose();
});
