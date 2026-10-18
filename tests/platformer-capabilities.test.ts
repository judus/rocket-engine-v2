import test from 'node:test';
import assert from 'node:assert/strict';
import { Node2D } from '../src/index.js';
import { Stage2D } from '../src/experimental/index.js';
import {
  PlatformerBody,
  PlatformerSolver,
} from '../games/platformer/PlatformerPhysics.js';
import { PlatformerMovement } from '../games/platformer/PlatformerMovement.js';
import { Runner, Patrol } from '../games/platformer/Runner.js';
import type { PlatformerWorldOptions } from '../games/platformer/solvePlatformer.js';

const dt = 1 / 60;
const frame = { dt, time: dt, tick: 1 };
function setup(
  options: PlatformerWorldOptions = {
    platforms: [{ x: 0, y: 480, width: 960, height: 60 }],
    gravity: 1400,
    bounds: { left: 0, right: 960 },
  },
) {
  const stage = new Stage2D({ fixed: true });
  const solver = stage.layer('world').attach(new PlatformerSolver(options));
  const tick = (count = 1) => {
    for (let i = 0; i < count; i++) stage.fixedUpdate!(dt, frame);
  };
  return { stage, solver, tick };
}

void test('different body sizes share one solver; movement config changes speed and jump independently', () => {
  const { stage, solver, tick } = setup();
  const small = stage.entity(
    () => new Runner({ x: 80, color: 'white', solver }),
  );
  const large = stage.entity(
    () =>
      new Runner({
        x: 180,
        color: 'gold',
        solver,
        width: 40,
        height: 48,
        movement: { speed: 90, runSpeed: 240, jumpSpeed: 400 },
      }),
  );
  small.movement.move(1);
  large.movement.move(1);
  tick();
  assert.equal(small.x, 83);
  assert.equal(large.x, 181.5);
  assert.equal(small.body.width, 24);
  assert.equal(large.body.height, 48);
  assert.equal(solver.bodyCount, 2);
  assert.equal(large.body.steps, 1);
  small.movement.jump();
  large.movement.jump();
  tick();
  assert.ok(small.body.velocityY < large.body.velocityY);
  small.movement.move(-1, true);
  large.movement.move(1, true);
  tick();
  assert.equal(small.body.velocityX, -300);
  assert.equal(large.body.velocityX, 240);
  assert.equal(small.movement.facing, -1);
  const jumpVelocity = small.body.velocityY;
  small.movement.jump();
  tick();
  assert.ok(
    small.body.velocityY > jumpVelocity,
    'air jump never resets velocity',
  );
  tick(240);
  assert.equal(small.body.grounded, true);
  assert.equal(large.body.grounded, true);
  assert.equal(small.x, 12);
  assert.equal(large.x, 940);
  stage.dispose();
  assert.equal(solver.bodyCount, 0);
});

void test('body dimensions determine wall, ceiling and landing contacts, not movement', () => {
  const options = {
    platforms: [
      { x: 0, y: 480, width: 960, height: 60 },
      { x: 270, y: 400, width: 150, height: 20 },
    ],
    gravity: 1400,
    bounds: { left: 0, right: 960 },
  };
  const { stage, solver, tick } = setup(options);
  const small = stage.entity(
    () => new Runner({ x: 240, y: 415, color: 'white', solver }),
  );
  const large = stage.entity(
    () =>
      new Runner({
        x: 240,
        y: 415,
        color: 'gold',
        solver,
        width: 40,
        height: 48,
      }),
  );
  small.movement.move(1);
  large.movement.move(1);
  tick(8);
  assert.equal(small.x, 258);
  assert.equal(large.x, 250);
  small.dispose();
  large.dispose();
  const under = stage.entity(
    () => new Runner({ x: 330, color: 'white', solver, height: 48 }),
  );
  under.movement.jump();
  tick(2);
  assert.equal(
    under.y,
    468,
    'head stops at ceiling underside plus body height',
  );
  assert.equal(under.body.velocityY, 0);
  under.dispose();
  const falling = stage.entity(
    () => new Runner({ x: 330, y: 300, color: 'white', solver }),
  );
  tick(60);
  assert.equal(falling.y, 400);
  assert.equal(falling.body.grounded, true);
  falling.movement.move(1);
  tick(50);
  assert.ok(falling.y > 400);
  tick(60);
  assert.equal(falling.y, 480);
  stage.dispose();
});

void test('supplied gravity and platform order determine one coherent nearest contact', () => {
  for (const reverse of [false, true]) {
    const platforms = [
      { x: 0, y: 300, width: 960, height: 20 },
      { x: 0, y: 480, width: 960, height: 60 },
    ];
    if (reverse) platforms.reverse();
    const { stage, solver, tick } = setup({
      platforms,
      gravity: 600,
      bounds: { left: 0, right: 960 },
    });
    const actor = stage.entity(
      () => new Runner({ x: 80, y: 100, color: 'white', solver }),
    );
    tick();
    assert.equal(actor.body.velocityY, 10);
    tick(100);
    assert.equal(actor.y, 300);
    stage.dispose();
  }
  const { stage, solver, tick } = setup({
    platforms: [],
    gravity: 0,
    bounds: { left: -100, right: 100 },
  });
  const actor = stage.entity(
    () => new Runner({ x: 0, y: 20, solver, color: 'white' }),
  );
  tick(10);
  assert.equal(actor.y, 20);
  assert.equal(actor.body.grounded, false);
  stage.dispose();
});

void test('body without movement still falls; removing intent stops drive but retains physics', () => {
  const { stage, solver, tick } = setup();
  const node = stage.add({ x: 80, y: 300 });
  const body = node.attach(
    new PlatformerBody({ width: 24, height: 32, solver }),
  );
  tick(60);
  assert.equal(node.y, 480);
  const movement = node.attach(new PlatformerMovement({ body }));
  movement.move(1);
  tick();
  assert.equal(node.x, 83);
  node.remove(movement);
  tick();
  assert.equal(node.x, 83);
  assert.equal(body.steps, 62);
  assert.throws(() => movement.move(1), /retired/);
  node.remove(body);
  assert.equal(solver.bodyCount, 0);
  stage.dispose();
});

void test('detached and reparented bodies are not advanced by the old world; removal unregisters them', () => {
  const a = setup();
  const b = setup();
  const actor = a.stage.entity(
    () => new Runner({ x: 80, solver: a.solver, color: 'white' }),
  );
  actor.movement.move(1);
  a.tick();
  actor.detach();
  a.tick();
  assert.equal(actor.body.steps, 1);
  b.stage.layer('world').add(actor);
  a.tick();
  b.tick();
  assert.equal(actor.body.steps, 1);
  actor.detach();
  a.stage.layer('world').add(actor);
  a.tick();
  assert.equal(actor.body.steps, 2);
  assert.throws(() => actor.remove(actor.body), /dependents/);
  const body = actor.body;
  actor.dispose();
  assert.equal(a.solver.bodyCount, 0);
  assert.throws(() => body.setHorizontalVelocity(1), /retired/);
  assert.throws(() => body.jump(600), /retired/);
  a.stage.dispose();
  b.stage.dispose();
});

void test('configuration and attachment errors fail before registering a body', () => {
  const { stage, solver } = setup();
  for (const size of [0, -1, NaN, Infinity]) {
    assert.throws(
      () => new PlatformerBody({ width: size, height: 32, solver }),
      /width/,
    );
    assert.throws(
      () => new PlatformerBody({ width: 24, height: size, solver }),
      /height/,
    );
  }
  for (const gravity of [-1, NaN, Infinity])
    assert.throws(
      () =>
        new PlatformerSolver({
          platforms: [],
          gravity,
          bounds: { left: 0, right: 1 },
        }),
      /Gravity/,
    );
  assert.throws(
    () =>
      new PlatformerSolver({
        platforms: [],
        gravity: 0,
        bounds: { left: 2, right: 1 },
      }),
    /bounds/,
  );
  assert.throws(
    () =>
      new PlatformerSolver({
        platforms: [{ x: NaN, y: 0, width: 1, height: 1 }],
        gravity: 0,
        bounds: { left: 0, right: 100 },
      }),
    /coordinates/,
  );
  assert.throws(
    () =>
      new PlatformerSolver({
        platforms: [{ x: 0, y: 0, width: -1, height: 1 }],
        gravity: 0,
        bounds: { left: 0, right: 100 },
      }),
    /width/,
  );
  for (const [x, y] of [
    [NaN, 100],
    [0, 480],
    [80, 490],
  ]) {
    const node = new Node2D({ x: x!, y: y! });
    assert.throws(
      () => node.attach(new PlatformerBody({ width: 24, height: 32, solver })),
      /Spawn|spawn/,
    );
    node.dispose();
  }
  assert.equal(solver.bodyCount, 0);
  assert.throws(
    () =>
      new Runner({ x: 80, color: 'white', solver, movement: { speed: -1 } }),
    /positive/,
  );
  assert.equal(
    solver.bodyCount,
    0,
    'failed entity construction unregisters its body',
  );
  const actor = stage.entity(
    () => new Runner({ x: 80, solver, color: 'white' }),
  );
  for (const option of ['speed', 'runSpeed', 'jumpSpeed'])
    assert.throws(
      () => new PlatformerMovement({ body: actor.body, [option]: -1 }),
      /positive/,
    );
  assert.throws(() => actor.movement.onAttach(actor), /already attached/);
  assert.throws(() => actor.body.assertOwner(new Node2D()), /owner mismatch/);
  assert.throws(() => actor.body.setHorizontalVelocity(NaN), /finite/);
  assert.throws(() => actor.body.jump(0), /positive/);
  assert.throws(() => solver.fixedUpdate(0), /Fixed dt/);
  const other = stage.add();
  assert.throws(
    () => other.attach(new PlatformerMovement({ body: actor.body })),
    /Required/,
  );
  assert.equal(solver.bodyCount, 1);
  stage.dispose();
  assert.throws(() => solver.fixedUpdate(dt), /disposed/);
});

void test('patrol config uses the same body-driven movement and world disposal invalidates commands', () => {
  const { stage, solver, tick } = setup();
  const actor = stage.entity(
    () => new Runner({ x: 780, solver, color: 'gold' }),
  );
  actor.attach(new Patrol(actor.movement));
  tick();
  assert.ok(actor.x < 780);
  tick(300);
  assert.equal(actor.body.steps, 301);
  solver.dispose();
  assert.throws(() => actor.movement.move(1), /disposed/);
  stage.dispose();
});
