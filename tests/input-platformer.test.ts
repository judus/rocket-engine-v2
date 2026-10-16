import test from 'node:test';
import assert from 'node:assert/strict';
import { Rocket, Scene2D, Input, platformerInput } from '../src/index.js';
import { PlatformerDemo } from '../examples/input/PlatformerDemo.js';
import { Key, withHost } from './helpers/inputHost.js';

void test('platformer preset has horizontal movement only, one jump per press, cancellation and remapping', () =>
  withHost(async (host) => {
    const app = new Rocket();
    const scene = app.scene(new Scene2D());
    const controls = app.use(Input).actions(scene).use(platformerInput);
    let jumps = 0;
    controls.on('jump', () => {
      jumps++;
    });
    const view = app.view({ target: host.target, scene });
    controls.bind(view);
    view.canvas.focus();
    await app.start();
    assert.equal(controls.names.includes('north'), false);
    view.canvas.dispatchEvent(new Key('keydown', 'KeyD'));
    view.canvas.dispatchEvent(new Key('keydown', 'KeyW'));
    host.frame(0);
    assert.equal(controls.value('horizontal'), 1);
    view.canvas.dispatchEvent(new Key('keydown', 'ArrowLeft'));
    host.frame(16);
    assert.equal(controls.value('horizontal'), 0);
    view.canvas.dispatchEvent(new Key('keydown', 'Space'));
    host.frame(32);
    view.canvas.dispatchEvent(new Key('keydown', 'Space', { repeat: true }));
    host.frame(48);
    assert.equal(jumps, 1);
    view.canvas.dispatchEvent(new Key('keyup', 'Space'));
    view.canvas.dispatchEvent(new Key('keydown', 'ArrowUp'));
    view.canvas.dispatchEvent(new Key('keyup', 'ArrowUp'));
    host.frame(64);
    assert.equal(jumps, 2);
    controls.setEnabled(false);
    assert.equal(controls.value('horizontal'), 0);
    view.canvas.dispatchEvent(new Key('keydown', 'Space'));
    host.frame(80);
    assert.equal(jumps, 2);
    controls.setEnabled(true);
    controls.activate();
    controls.map('jump', 'KeyF');
    view.canvas.dispatchEvent(new Key('keydown', 'Space'));
    host.frame(96);
    assert.equal(jumps, 2);
    view.canvas.dispatchEvent(new Key('keydown', 'KeyF'));
    host.frame(112);
    assert.equal(jumps, 3);
    await app.dispose();
  }));

void test('side-view demo jumps, lands on ledges, blocks their underside and sides, and walks off', () => {
  const model = new PlatformerDemo();
  const tick = (horizontal = 0, sprint = false) =>
    model.step(1 / 120, horizontal, sprint);
  tick(1);
  assert.equal(model.x, 81.5);
  tick(1, true);
  assert.equal(model.x, 84);
  assert.equal(model.y, 480, 'walking does not change depth or height');
  model.x = 235;
  model.requestJump();
  let highest = 480;
  for (let i = 0; i < 24; i++) {
    tick(1);
    highest = Math.min(highest, model.y);
  }
  assert.ok(highest < 400);
  assert.equal(model.grounded, false);
  model.requestJump(); // rejected in midair, never saved for landing
  for (let i = 0; i < 100; i++) tick();
  assert.equal(model.y, 400);
  assert.equal(model.grounded, true);
  for (let i = 0; i < 120; i++) tick(1);
  assert.ok(model.y > 400, 'walking past a ledge falls');
  for (let i = 0; i < 100; i++) tick();
  assert.equal(model.y, 480);
  model.x = 330;
  model.requestJump();
  for (let i = 0; i < 15; i++) tick();
  assert.ok(model.y >= 452, 'cannot jump through solid ledge underside');
  model.x = 250;
  model.y = 415;
  model.velocityY = 0;
  tick(1, true);
  tick(1, true);
  tick(1, true);
  tick(1, true);
  assert.equal(model.x, 258, 'solid ledge side blocks player');
  model.reset();
  assert.equal(model.x, 80);
  assert.equal(model.y, 480);
  for (let i = 0; i < 200; i++) tick(-1, true);
  assert.equal(model.x, 12);
  assert.equal(model.facing, -1);
});
