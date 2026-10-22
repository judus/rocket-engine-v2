import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MouseSteering,
  mouseSteeringResponse,
} from '../games/farwake/MouseSteering.js';
import { ShipControl } from '../games/farwake/ShipControl.js';
import { mouseSteeringCue } from '../games/farwake/visuals/MouseSteeringCue.js';
import {
  controlPreset,
  defaultControls,
} from '../games/farwake/ControlSettings.js';

void test('mouse displacement holds steering until returned to centre or explicitly reset', () => {
  const mouse = new MouseSteering(),
    control = new ShipControl();
  mouse.move(50, -25, 200, 1, false);
  assert.deepEqual(mouse.deflection, { yaw: 0.25, pitch: 0.125 });
  const held = mouse.intent;
  assert.ok(held.yaw > 0 && held.yaw < 0.25);
  for (let i = 0; i < 600; i++) {
    mouse.move(0, 0, 200, 1, false);
    control.turn(mouse.intent.yaw);
    control.pitch(mouse.intent.pitch);
  }
  assert.equal(control.intent.yaw, held.yaw);
  assert.equal(control.intent.pitch, held.pitch);
  mouse.move(-50, 25, 200, 1, false);
  assert.deepEqual(mouse.intent, { yaw: 0, pitch: 0 });
  mouse.move(20, 20, 200, 1, false);
  mouse.reset();
  assert.deepEqual(mouse.intent, { yaw: 0, pitch: 0 });
});
void test('small mouse movements move the cue inside the deadzone; event grouping does not change intent', () => {
  const a = new MouseSteering(),
    b = new MouseSteering();
  a.move(1, -1, 200, 1, false);
  assert.equal(a.deflection.yaw, 0.005);
  assert.deepEqual(a.intent, { yaw: 0, pitch: 0 });
  for (let i = 0; i < 99; i++) a.move(1, -1, 200, 1, false);
  b.move(100, -100, 200, 1, false);
  assert.ok(Math.abs(a.intent.yaw - b.intent.yaw) < 1e-12);
  assert.ok(Math.abs(a.intent.pitch - b.intent.pitch) < 1e-12);
});
void test('circular steering limit has no hidden accumulated overrun and settings affect travel, not physics', () => {
  const mouse = new MouseSteering();
  mouse.move(10000, 0, 200, 1, false);
  assert.equal(mouse.intent.yaw, 1);
  mouse.move(-1, 0, 200, 1, false);
  assert.equal(mouse.deflection.yaw, 0.995);
  assert.ok(mouse.intent.yaw < 1 && mouse.intent.yaw > 0.99);
  mouse.reset();
  mouse.move(200, -200, 200, 1, false);
  assert.ok(
    Math.abs(Math.hypot(mouse.intent.yaw, mouse.intent.pitch) - 1) < 1e-12,
  );
  mouse.reset();
  mouse.move(25, -25, 200, 2, true);
  assert.deepEqual(mouse.deflection, { yaw: 0.25, pitch: -0.25 });
  assert.ok(mouse.intent.yaw > 0 && mouse.intent.pitch < 0);
  assert.deepEqual(controlPreset(defaultControls()).actions.lookX!.mapping, {
    pointer: 'x',
    scale: 1,
  });
});
void test('invalid mouse calibration fails before altering steering', () => {
  const mouse = new MouseSteering();
  mouse.move(40, 0, 200, 1, false);
  const before = mouse.intent;
  for (const args of [
    [NaN, 0, 200, 1],
    [0, Infinity, 200, 1],
    [0, 0, 0, 1],
    [0, 0, 200, -1],
  ])
    assert.throws(
      () => mouse.move(args[0]!, args[1]!, args[2]!, args[3]!, false),
      /calibration/,
    );
  assert.deepEqual(mouse.intent, before);
});
void test('3D steering cue reuses geometry, shows command direction and disappears when released or centered', () => {
  const cue = mouseSteeringCue();
  const meshes = cue.root.children.map((node) => node.mesh);
  cue.update(0.5, 0.25, true);
  assert.equal(cue.root.visible, true);
  assert.equal(cue.root.children[1]!.transform.position.x, 0.15);
  assert.equal(cue.root.children[1]!.transform.position.y, 0.075);
  cue.update(-1, 0, true);
  assert.deepEqual(
    cue.root.children.map((node) => node.mesh),
    meshes,
  );
  cue.root.traverse((node) => {
    assert.equal(node.castsShadow, false);
    assert.equal(node.receivesShadow, false);
  });
  cue.update(-1, 0, false);
  assert.equal(cue.root.visible, false);
  cue.update(0, 0, true);
  assert.equal(cue.root.visible, false);
});

void test('radial deadzone is neutral diagonally and activation is continuous and monotonic', () => {
  const { deadzone, activation } = mouseSteeringResponse;
  const inside = new MouseSteering();
  inside.move(
    (deadzone / Math.sqrt(2)) * 0.999,
    (-deadzone / Math.sqrt(2)) * 0.999,
    1,
    1,
    false,
  );
  assert.deepEqual(inside.intent, { yaw: 0, pitch: 0 });
  let previous = 0;
  for (let i = 0; i <= 1000; i++) {
    const mouse = new MouseSteering();
    mouse.move(i / 1000, 0, 1, 1, false);
    assert.ok(mouse.intent.yaw >= previous && mouse.intent.yaw <= 1);
    previous = mouse.intent.yaw;
  }
  assert.equal(previous, 1);
  const justOutside = new MouseSteering();
  justOutside.move(deadzone + 0.0001, 0, 1, 1, false);
  assert.ok(justOutside.intent.yaw > 0 && justOutside.intent.yaw < 0.000001);
  const afterRamp = new MouseSteering();
  afterRamp.move(deadzone + (1 - deadzone) * activation, 0, 1, 1, false);
  assert.ok(Math.abs(afterRamp.intent.yaw - activation) < 1e-12);
});
