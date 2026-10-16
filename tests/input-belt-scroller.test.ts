import test from 'node:test';
import assert from 'node:assert/strict';
import { Rocket, Scene2D, Input, beltScrollerInput } from '../src/index.js';
import { BeltScrollerDemo } from '../examples/input/BeltScrollerDemo.js';
import { Key, withHost } from './helpers/inputHost.js';

void test('belt-scroller normalizes diagonals, clamps the ground plane, runs and resets', () => {
  const model = new BeltScrollerDemo();
  model.step(0.1, 1, 1, false);
  assert.ok(
    Math.abs(Math.hypot(model.x - 80, model.depth - 390) - 18) < 0.0001,
  );
  assert.equal(model.height, 0, 'walking north is not jumping');
  model.reset();
  model.step(0.1, 1, 0, true);
  assert.equal(model.x, 110);
  assert.equal(model.depth, 390);
  for (let i = 0; i < 1600; i++) model.step(1 / 120, 1, 1, true);
  assert.equal(model.x, 2388);
  assert.equal(model.depth, 300);
  for (let i = 0; i < 1800; i++) model.step(1 / 120, -1, -1, true);
  assert.equal(model.x, 12);
  assert.equal(model.depth, 480);
  assert.equal(model.facing, -1);
  model.requestJump();
  model.reset();
  model.step(1 / 120, 0, 0, false);
  assert.equal(model.height, 0, 'reset clears pending jumps');
  assert.equal(model.x, 80);
  assert.equal(model.depth, 390);
  assert.equal(model.facing, 1);
});

void test('jump height is independent of depth, midair presses do not buffer another jump', () => {
  const model = new BeltScrollerDemo();
  model.requestJump();
  for (let i = 0; i < 20; i++) model.step(1 / 120, 0, 0, false);
  assert.ok(model.height > 50);
  assert.equal(model.depth, 390);
  assert.equal(model.grounded, false);
  model.requestJump();
  const height = model.height;
  model.step(1 / 120, 0, 1, false);
  assert.equal(model.depth, 388.5);
  assert.ok(
    model.height > height,
    'ground movement preserves the jump trajectory',
  );
  for (let i = 0; i < 160; i++) model.step(1 / 120, 0, 0, false);
  assert.equal(model.height, 0);
  assert.equal(model.velocityHeight, 0);
  assert.equal(
    model.depth,
    388.5,
    'landing does not teleport to another ground lane',
  );
  model.requestJump();
  model.step(1 / 120, 0, 0, false);
  assert.ok(model.height > 0, 'a fresh press after landing jumps again');
});

void test('belt-scroller actions drive Rocket fixed updates, isolate UI, remap and clear held state', () =>
  withHost(async (host) => {
    const model = new BeltScrollerDemo();
    const app = new Rocket({ fixed: {} });
    const scene = app.scene(
      new Scene2D({
        fixedUpdate(dt) {
          model.step(
            dt,
            controls.value('horizontal'),
            controls.value('depth'),
            controls.value('sprint') !== 0,
          );
        },
      }),
    );
    const controls = app.use(Input).actions(scene).use(beltScrollerInput);
    let jumps = 0,
      attacks = 0;
    controls.on('jump', () => {
      jumps++;
      model.requestJump();
    });
    controls.on('attack', () => {
      attacks++;
    });
    controls.on('reset', () => {
      model.reset();
    });
    const view = app.view({ target: host.target, scene });
    controls.bind(view);
    view.canvas.focus();
    await app.start();
    host.frame(0);
    view.canvas.dispatchEvent(new Key('keydown', 'ArrowUp'));
    view.canvas.dispatchEvent(new Key('keydown', 'ArrowRight'));
    host.frame(20);
    assert.equal(jumps, 0, 'Up changes depth, unlike the side-view platformer');
    assert.ok(model.depth < 390);
    assert.ok(model.x > 80);
    assert.equal(model.height, 0);
    view.canvas.dispatchEvent(new Key('keydown', 'Space'));
    view.canvas.dispatchEvent(new Key('keydown', 'KeyJ'));
    view.canvas.dispatchEvent(new Key('keyup', 'KeyJ'));
    host.frame(40);
    assert.equal(attacks, 1, 'short press is retained between frames');
    assert.ok(model.height > 0);
    view.canvas.dispatchEvent(new Key('keydown', 'Space', { repeat: true }));
    host.frame(60);
    assert.equal(jumps, 1);
    controls.setEnabled(false);
    const x = model.x,
      depth = model.depth;
    view.canvas.dispatchEvent(new Key('keydown', 'KeyJ'));
    host.frame(80);
    assert.equal(model.x, x);
    assert.equal(model.depth, depth);
    assert.equal(attacks, 1);
    assert.equal(controls.value('horizontal'), 0);
    controls.setEnabled(true);
    controls.activate();
    controls.map('jump', 'KeyF');
    view.canvas.dispatchEvent(new Key('keydown', 'Space'));
    host.frame(100);
    assert.equal(jumps, 1);
    view.canvas.dispatchEvent(new Key('keydown', 'KeyF'));
    host.frame(120);
    assert.equal(jumps, 2);
    view.canvas.dispatchEvent(new Key('keydown', 'KeyR', { ctrlKey: true }));
    host.frame(140);
    assert.equal(model.x, 80);
    assert.equal(model.depth, 390);
    assert.equal(model.height, 0);
    await app.dispose();
  }));
