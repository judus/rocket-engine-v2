import test from 'node:test';
import assert from 'node:assert/strict';
import { DirectMovement, GridTraversal } from '../src/navigation/index.js';
import { ControlledCharacter } from '../examples/character-control/ControlledCharacter.js';
const actor = { radius: 8, clearance: 1, capabilities: ['walk'] };
const domain = { minX: 0, minY: 0, columns: 30, rows: 30, tileSize: 32 };
const open = new GridTraversal(
  domain,
  () => ({ status: 'passable', cost: 1 }),
  () => 0,
);
void test('direct walk/run displacement is frame-partition independent and diagonals do not gain speed', () => {
  const one = new DirectMovement(open, { x: 128, y: 176 }, actor),
    split = new DirectMovement(open, one.position, actor),
    diagonal = new DirectMovement(open, one.position, actor),
    running = new DirectMovement(open, one.position, actor);
  one.update(1, { x: 1, y: 0 }, 80);
  for (let i = 0; i < 60; i++) split.update(1 / 60, { x: 1, y: 0 }, 80);
  diagonal.update(1, { x: 1, y: 1 }, 80);
  running.update(1, { x: 1, y: 0 }, 136);
  assert.ok(Math.abs(one.position.x - split.position.x) < 1e-9);
  assert.ok(
    Math.abs(
      Math.hypot(diagonal.position.x - 128, diagonal.position.y - 176) - 80,
    ) < 1e-9,
  );
  assert.equal(running.position.x - 128, 136);
  const pose = one.position;
  assert.equal(one.update(1, { x: 0, y: 0 }, 80), 'idle');
  assert.equal(one.position, pose);
  assert.throws(() => one.update(-1, { x: 0, y: 0 }, 80));
  assert.throws(() => one.update(1, { x: NaN, y: 0 }, 80));
  assert.throws(() => one.update(1, { x: 1, y: 0 }, Infinity));
  one.dispose();
  assert.throws(() => one.update(1, { x: 1, y: 0 }, 80));
});
void test('direct swept steps cannot tunnel through walls or unknown terrain, including long frames', () => {
  const wall = new GridTraversal(
    domain,
    () => ({ status: 'passable', cost: 1 }),
    () => 0,
    () => [
      { id: 'wall', bounds: { minX: 288, minY: 64, maxX: 320, maxY: 256 } },
    ],
  );
  const mover = new DirectMovement(wall, { x: 128, y: 176 }, actor);
  assert.equal(mover.update(4, { x: 1, y: 0 }, 136), 'blocked');
  assert.equal(mover.position.x, 128);
  const unknown = new GridTraversal(
    domain,
    (x) => (x === 8 ? { status: 'unknown' } : { status: 'passable', cost: 1 }),
    () => 0,
  );
  const other = new DirectMovement(unknown, { x: 128, y: 176 }, actor);
  assert.equal(other.update(3, { x: 1, y: 0 }, 136), 'unknown');
  assert.equal(other.position.x, 128);
  assert.equal(mover.update(0.1, { x: 0, y: -1 }, 80), 'moved');
});
void test('controlled sprite animates actual displacement, runs faster, idles when blocked and retires its only pose owner', () => {
  const character = new ControlledCharacter(open, { x: 128, y: 176 }, {
    width: 256,
    height: 576,
  } as ImageBitmap);
  character.update(0.1, { x: -1, y: 0 }, true);
  assert.equal(character.state, 'running');
  assert.equal(character.facing, 'left');
  assert.equal(character.player.snapshot?.clip, 'walk-side');
  assert.ok(Math.abs(character.player.snapshot!.phase - 0.15) < 1e-9);
  assert.ok(Math.abs(character.node.x - 114.4) < 1e-9);
  character.update(0.1, { x: 0, y: 0 }, true);
  assert.equal(character.state, 'idle');
  assert.equal(character.player.snapshot?.clip, 'idle-side');
  const blocked = new GridTraversal(
    domain,
    () => ({ status: 'unknown' }),
    () => 0,
  );
  const waiting = new ControlledCharacter(blocked, { x: 128, y: 176 }, {
    width: 256,
    height: 576,
  } as ImageBitmap);
  waiting.update(0.1, { x: 1, y: 0 }, true);
  assert.equal(waiting.state, 'unknown');
  assert.equal(waiting.player.snapshot?.clip, 'idle-front');
  assert.equal(waiting.node.x, 128);
  character.dispose();
  character.dispose();
  assert.equal(character.player.status, 'disposed');
  assert.throws(() => character.movement.update(1, { x: 1, y: 0 }, 80));
  waiting.dispose();
});
