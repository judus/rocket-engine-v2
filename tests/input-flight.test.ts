import test from 'node:test';
import assert from 'node:assert/strict';
import { Rocket, Scene2D, Input, flightInput } from '../src/index.js';
import { FlightDemo } from '../examples/input/FlightDemo.js';
import type { FlightIntent } from '../examples/input/FlightDemo.js';
import type { Vec3 } from '../src/3d/index.js';
import { Key, withHost } from './helpers/inputHost.js';
const idle: FlightIntent = {
  forward: 0,
  right: 0,
  up: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  lookX: 0,
  lookY: 0,
  boost: false,
};
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

void test('flight rotates about local axes, rolls the up direction, loops and preserves its frame', () => {
  const craft = new FlightDemo();
  craft.step(Math.PI / 2 / 1.2, { ...idle, roll: 1 });
  close(craft.up.x, 1);
  close(craft.right.y, -1);
  const start = craft.position;
  craft.step(0.5, { ...idle, up: 1 });
  assert.ok(craft.position.x > start.x, 'local up follows roll');
  close(craft.position.y, start.y);
  craft.step(Math.PI / 2 / 1.2, { ...idle, pitch: 1 });
  close(craft.forward.x, 1);
  close(craft.forward.y, 0);
  close(craft.forward.z, 0);
  craft.reset();
  craft.step(Math.PI / 2 / 1.2, { ...idle, yaw: 1 });
  close(craft.forward.x, 1);
  const z = craft.position.z;
  craft.step(0.5, { ...idle, forward: 1 });
  assert.ok(craft.position.x > 0);
  close(craft.position.z, z);
  craft.reset();
  craft.step((2 * Math.PI) / 1.2, { ...idle, pitch: 1 });
  close(craft.forward.z, 1);
  close(craft.up.y, 1);
  for (let i = 0; i < 5000; i++)
    craft.step(1 / 144, { ...idle, yaw: 0.7, pitch: 0.9, roll: -0.8 });
  for (const axis of [craft.right, craft.up, craft.forward])
    close(dot(axis, axis), 1);
  close(dot(craft.right, craft.up), 0);
  close(dot(craft.right, craft.forward), 0);
  close(dot(craft.up, craft.forward), 0);
  const before = { ...craft.forward };
  craft.step(0.1, idle);
  assert.deepEqual(craft.forward, before, 'no rotational momentum on release');
});

void test('flight acceleration, braking and diagonal speed agree across frame rates', () => {
  const run = (fps: number) => {
    const craft = new FlightDemo();
    for (let i = 0; i < fps; i++) craft.step(1 / fps, { ...idle, forward: 1 });
    return craft;
  };
  const slow = run(30),
    fast = run(144);
  close(slow.position.z, fast.position.z);
  close(slow.speed, fast.speed);
  assert.ok(slow.speed > 6 && slow.speed < 7);
  const diagonal = new FlightDemo();
  for (let i = 0; i < 144; i++)
    diagonal.step(1 / 144, { ...idle, forward: 1, right: 1, up: 1 });
  close(diagonal.speed, fast.speed);
  const boosted = new FlightDemo();
  for (let i = 0; i < 144; i++)
    boosted.step(1 / 144, { ...idle, forward: 1, boost: true });
  assert.ok(boosted.speed > 17 && boosted.speed < 18);
  const before = fast.position.z;
  for (let i = 0; i < 288; i++) fast.step(1 / 144, idle);
  assert.ok(
    fast.position.z > before,
    'gentle deceleration, not an instant stop',
  );
  assert.ok(fast.speed < 0.001);
  fast.reset();
  assert.equal(fast.speed, 0);
  assert.deepEqual(fast.position, { x: 0, y: 2, z: -12 });
});

void test('relative pointer rotation is frame delta, and world points use the same local frame', () => {
  const a = new FlightDemo(),
    b = new FlightDemo();
  a.step(1 / 30, { ...idle, lookX: 0.3, lookY: -0.2 });
  b.step(1 / 144, { ...idle, lookX: 0.3, lookY: -0.2 });
  assert.deepEqual(a.forward, b.forward);
  assert.ok(a.forward.x > 0 && a.forward.y > 0);
  const point = {
    x: a.position.x + a.forward.x * 10,
    y: a.position.y + a.forward.y * 10,
    z: a.position.z + a.forward.z * 10,
  };
  const projected = a.toCamera(point);
  close(projected.x, 0);
  close(projected.y, 0);
  close(projected.z, 10);
});

void test('flight preset drives keyboard-only movement and rotation, remaps boost and cancels on UI exit', () =>
  withHost(async (host) => {
    const craft = new FlightDemo();
    const app = new Rocket();
    const scene = app.scene(
      new Scene2D({
        update(dt) {
          craft.step(dt, {
            forward: controls.value('forward'),
            right: controls.value('right'),
            up: controls.value('up'),
            yaw: controls.value('yaw'),
            pitch: controls.value('pitch'),
            roll: controls.value('roll'),
            lookX: controls.value('lookX'),
            lookY: controls.value('lookY'),
            boost: controls.value('boost') !== 0,
          });
        },
      }),
    );
    const controls = app.use(Input).actions(scene).use(flightInput);
    controls.on('reset', () => {
      craft.reset();
    });
    const view = app.view({ target: host.target, scene });
    const binding = controls.bind(view);
    assert.equal(binding.capture, undefined, 'keyboard-only by default');
    view.canvas.focus();
    await app.start();
    host.frame(0);
    view.canvas.dispatchEvent(new Key('keydown', 'KeyW'));
    view.canvas.dispatchEvent(new Key('keydown', 'ArrowRight'));
    view.canvas.dispatchEvent(new Key('keydown', 'ArrowUp'));
    view.canvas.dispatchEvent(new Key('keydown', 'KeyE'));
    view.canvas.dispatchEvent(new Key('keydown', 'AltLeft'));
    host.frame(20);
    assert.ok(craft.forward.x > 0 && craft.forward.y > 0);
    assert.ok(craft.up.x > 0);
    assert.ok(craft.position.y > 2 && craft.position.z > -12);
    controls.map('boost', 'KeyG');
    assert.equal(controls.value('forward'), 0, 'remapping clears held keys');
    view.canvas.dispatchEvent(new Key('keydown', 'ShiftLeft'));
    host.frame(40);
    assert.equal(controls.value('boost'), 0);
    view.canvas.dispatchEvent(new Key('keydown', 'KeyG'));
    host.frame(60);
    assert.equal(controls.value('boost'), 1);
    controls.setEnabled(false);
    assert.equal(controls.value('boost'), 0);
    const forward = { ...craft.forward };
    view.canvas.dispatchEvent(new Key('keydown', 'ArrowRight'));
    host.frame(80);
    assert.deepEqual(craft.forward, forward);
    controls.setEnabled(true);
    controls.activate();
    view.canvas.dispatchEvent(new Key('keydown', 'KeyR', { ctrlKey: true }));
    host.frame(100);
    assert.equal(craft.speed, 0);
    assert.deepEqual(craft.position, { x: 0, y: 2, z: -12 });
    await app.dispose();
  }));

void test('flight mouse mode consumes captured deltas once and clears rotation when capture releases', () =>
  withHost(async (host) => {
    const app = new Rocket(),
      scene = app.scene(new Scene2D());
    const controls = app.use(Input).actions(scene).use(flightInput);
    const view = app.view({ target: host.target, scene });
    const doc = Object.assign(host.document, {
      pointerLockElement: null as HTMLCanvasElement | null,
      exitPointerLock() {
        this.pointerLockElement = null;
        host.document.dispatchEvent(new Event('pointerlockchange'));
      },
    });
    Object.assign(view.canvas, {
      requestPointerLock() {
        doc.pointerLockElement = view.canvas;
        doc.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      },
    });
    const binding = controls.bind(view, { capture: 'pointer-lock' });
    await app.start();
    view.canvas.dispatchEvent(new Event('click'));
    await Promise.resolve();
    assert.equal(binding.capture!.active, true);
    doc.dispatchEvent(
      Object.assign(new Event('mousemove'), { movementX: 20, movementY: -10 }),
    );
    doc.dispatchEvent(new Key('keydown', 'ArrowRight'));
    host.frame(0);
    assert.equal(controls.value('lookX'), 0.06);
    assert.equal(controls.value('lookY'), -0.03);
    assert.equal(
      controls.value('yaw'),
      1,
      'keyboard rotation stays available with mouse capture',
    );
    host.frame(16);
    assert.equal(controls.value('lookX'), 0);
    binding.capture!.release();
    host.frame(32);
    assert.equal(controls.value('yaw'), 0);
    doc.dispatchEvent(
      Object.assign(new Event('mousemove'), { movementX: 100, movementY: 100 }),
    );
    host.frame(48);
    assert.equal(controls.value('lookY'), 0);
    await app.dispose();
  }));
