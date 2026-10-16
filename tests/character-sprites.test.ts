import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene2D } from '../src/Scene2D.js';
import {
  characterAtlas,
  prepareCharacters,
  setCharacterClip,
} from '../examples/character-sprites/characters.js';

void test('archived characters share leases but own playback, directional bounds and cleanup', async () => {
  const scene = new Scene2D();
  let acquired = 0,
    released = 0;
  const characters = await prepareCharacters(
    scene,
    {
      acquireImage: async () => {
        acquired++;
        return {
          image: { width: 256, height: 576 } as ImageBitmap,
          dispose() {
            released++;
            return;
          },
        };
      },
    },
    new AbortController().signal,
    () => {},
  );
  assert.equal(acquired, 6);
  assert.equal(characters.length, 12);
  const a = characters[0]!.sprite,
    b = characters[1]!.sprite;
  a.player.pause();
  scene.update(0.2, { dt: 0.2, time: 0.2 });
  assert.equal(a.player.snapshot?.phase, 0);
  assert.equal(b.player.snapshot?.phase, 0.2);
  setCharacterClip(a, 'walk', 'left');
  assert.equal(a.flips.flipX, false);
  assert.equal(a.player.snapshot?.source.y, 0);
  assert.equal(a.player.snapshot?.source.x, 128);
  assert.equal(a.player.snapshot?.pivot.y, 41);
  assert.equal(a.contains(a.node.localToWorld({ x: 0, y: -20 })), true);
  setCharacterClip(a, 'walk', 'right');
  assert.equal(a.flips.flipX, true);
  setCharacterClip(a, 'idle', 'back');
  assert.equal(a.flips.flipX, false);
  assert.equal(a.player.snapshot?.source.y, 96);
  scene.dispose();
  scene.dispose();
  assert.equal(released, 6);
  assert.ok(characters.every((c) => c.sprite.player.status === 'disposed'));
  assert.equal(a.contains({ x: 0, y: 0 }), false);
  assert.ok(characterAtlas);
});
void test('partial character preparation retires players before releasing acquired images', async () => {
  const scene = new Scene2D();
  let acquired = 0,
    released = 0;
  await assert.rejects(
    prepareCharacters(
      scene,
      {
        acquireImage: async () => {
          if (++acquired === 6) throw new Error('load failure');
          return {
            image: { width: 256, height: 576 } as ImageBitmap,
            dispose() {
              assert.equal(scene.root.children.length, 0);
              released++;
              return;
            },
          };
        },
      },
      new AbortController().signal,
      () => {},
    ),
    /load failure/,
  );
  scene.dispose();
  assert.equal(released, 5);
});
