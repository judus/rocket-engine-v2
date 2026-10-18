import test from 'node:test';
import assert from 'node:assert/strict';
import { Node2D } from '../src/index.js';
import { Stage2D } from '../src/experimental/index.js';
import { Inventory } from '../games/shared/Inventory.js';
import { TopDownWorld, TopDownBody } from '../games/top-down/TopDownPhysics.js';
import { TopDownMovement } from '../games/top-down/TopDownMovement.js';
import { Explorer, SupplyPatrol } from '../games/top-down/Explorer.js';
import { SupplyPickup } from '../games/top-down/Pickups.js';
import { PlatformerSolver } from '../games/platformer/PlatformerPhysics.js';
import { Runner } from '../games/platformer/Runner.js';
import { courtyard, scoutRoute } from '../games/top-down/level.js';

const frame = { dt: 1 / 60, time: 1 / 60, tick: 1 };
function setup(
  obstacles: { x: number; y: number; width: number; height: number }[] = [],
) {
  const stage = new Stage2D({ fixed: true });
  const world = new TopDownWorld({
    bounds: { x: 0, y: 0, width: 960, height: 540 },
    obstacles,
  });
  const pickups: SupplyPickup[] = [];
  const actor = (
    x = 100,
    y = 100,
    options: {
      width?: number;
      height?: number;
      capacity?: number;
      speed?: number;
    } = {},
  ) =>
    stage.entity(
      () =>
        new Explorer({
          x,
          y,
          color: 'white',
          world,
          pickups: () => pickups,
          ...options,
        }),
    );
  const pickup = (x: number, y: number, quantity = 1) => {
    const item = stage.entity(() => new SupplyPickup({ x, y, quantity }));
    pickups.push(item);
    return item;
  };
  const tick = (count = 1, dt = 1 / 60) => {
    for (let i = 0; i < count; i++) stage.fixedUpdate!(dt, { ...frame, dt });
  };
  return { stage, world, pickups, actor, pickup, tick };
}

void test('inventory validates units and changes whole stacks atomically with immutable observations', () => {
  for (const capacity of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => new Inventory({ capacity }), /capacity/);
  const node = new Node2D();
  const bag = node.attach(new Inventory({ capacity: 4 }));
  assert.equal(bag.add('cell', 2), true);
  const snapshot = bag.entries;
  assert.equal(bag.add('cell', 3), false);
  assert.equal(bag.used, 2);
  assert.equal(bag.count('cell'), 2);
  assert.equal(bag.add('key', 2), true);
  assert.equal(bag.used, 4);
  assert.equal(bag.remove('cell', 3), false);
  assert.equal(bag.used, 4);
  assert.equal(bag.remove('cell'), true);
  assert.equal(bag.count('cell'), 1);
  assert.equal(bag.remove('cell'), true);
  assert.equal(bag.count('cell'), 0);
  assert.deepEqual(snapshot, [{ item: 'cell', quantity: 2 }]);
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot[0]));
  for (const quantity of [
    0,
    -1,
    NaN,
    Infinity,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.throws(() => bag.add('cell', quantity), /quantity/);
    assert.throws(() => bag.remove('key', quantity), /quantity/);
  }
  assert.throws(() => bag.add(' '), /Item ID/);
  assert.throws(() => bag.count(''), /Item ID/);
  assert.throws(() => bag.assertOwner(new Node2D()), /owner mismatch/);
  node.remove(bag);
  assert.throws(() => bag.add('cell'), /retired/);
  assert.throws(() => bag.remove('key'), /retired/);
  assert.equal(bag.count('key'), 2, 'final inventory remains inspectable');
  node.dispose();
});

void test('the same inventory attaches to the platformer Runner without a movement dependency', () => {
  const stage = new Stage2D({ fixed: true });
  const solver = stage.layer('world').attach(
    new PlatformerSolver({
      platforms: [{ x: 0, y: 480, width: 960, height: 60 }],
      gravity: 1400,
      bounds: { left: 0, right: 960 },
    }),
  );
  const runner = stage.entity(
    () => new Runner({ x: 80, color: 'white', solver }),
  );
  const bag = runner.attach(new Inventory({ capacity: 2 }));
  assert.equal(bag.add('cell'), true);
  runner.movement.move(1);
  stage.fixedUpdate!(1 / 60, frame);
  assert.equal(runner.x, 83);
  assert.equal(bag.count('cell'), 1);
  runner.remove(bag);
  stage.fixedUpdate!(1 / 60, frame);
  assert.equal(runner.x, 86);
  stage.dispose();
});

void test('top-down movement preserves analog magnitude, caps diagonals and applies independent body settings', () => {
  const s = setup();
  const straight = s.actor(100, 100);
  const diagonal = s.actor(100, 100, { width: 34, height: 30 });
  const analog = s.actor(100, 100, { speed: 100 });
  straight.movement.move(1, 0);
  diagonal.movement.move(1, 1);
  analog.movement.move(0.5, 0);
  s.tick(60);
  assert.ok(Math.abs(straight.x - 280) < 1e-8);
  assert.ok(
    Math.abs(Math.hypot(diagonal.x - 100, diagonal.y - 100) - 180) < 1e-8,
  );
  assert.ok(Math.abs(analog.x - 150) < 1e-8);
  assert.equal(diagonal.body.width, 34);
  assert.equal(diagonal.body.height, 30);
  straight.movement.move(-1, 0, true);
  s.tick();
  assert.ok(Math.abs(straight.x - (280 - 280 / 60)) < 1e-8);
  assert.throws(() => straight.movement.move(2, 0), /axes/);
  assert.throws(() => straight.movement.move(0, NaN), /axes/);
  straight.remove(straight.movement);
  const stopped = straight.x;
  s.tick();
  assert.equal(straight.x, stopped);
  assert.equal(
    straight.inventory.add('cell'),
    true,
    'inventory is independent of locomotion',
  );
  s.stage.dispose();
});

void test('swept collisions block all four obstacle faces and respect configured body dimensions', () => {
  for (const [x, y, vx, vy, expectedX, expectedY] of [
    [100, 200, 1000, 0, 140, 200],
    [300, 200, -1000, 0, 260, 200],
    [200, 100, 0, 1000, 200, 140],
    [200, 300, 0, -1000, 200, 260],
  ]) {
    const s = setup([{ x: 150, y: 150, width: 100, height: 100 }]);
    const node = s.stage.add({ x: x!, y: y! });
    const body = node.attach(
      new TopDownBody({ width: 20, height: 20, world: s.world }),
    );
    body.setVelocity(vx!, vy!);
    s.tick(1, 1);
    assert.equal(node.x, expectedX);
    assert.equal(node.y, expectedY);
    s.stage.dispose();
  }
  const s = setup([{ x: 150, y: 150, width: 100, height: 100 }]);
  const large = s.actor(100, 200, { width: 40, height: 60 });
  large.movement.move(1, 0);
  s.tick(60);
  assert.equal(large.x, 130);
  large.movement.move(0, 1);
  s.tick(60);
  assert.ok(large.y > 250, 'slides along a wall');
  large.movement.move(-1, 1);
  s.tick(600);
  assert.equal(large.x, 20);
  assert.equal(large.y, 510);
  s.stage.dispose();
});

void test('world geometry is copied and obstacle order cannot change nearest contact', () => {
  for (const reversed of [false, true]) {
    const obstacles = [
      { x: 150, y: 150, width: 30, height: 100 },
      { x: 250, y: 150, width: 30, height: 100 },
    ];
    if (reversed) obstacles.reverse();
    const s = setup(obstacles);
    obstacles[0]!.x = 800;
    const node = s.stage.add({ x: 100, y: 200 });
    node
      .attach(new TopDownBody({ width: 20, height: 20, world: s.world }))
      .setVelocity(1000, 0);
    s.tick(1, 1);
    assert.equal(node.x, 140);
    assert.ok(Object.isFrozen(s.world.obstacles[0]));
    s.stage.dispose();
  }
});

void test('interaction collects nearest reachable supply only on request; full bags preserve pickups', () => {
  const s = setup();
  const hero = s.actor(100, 100, { capacity: 2 });
  const farther = s.pickup(150, 100),
    near = s.pickup(120, 100, 2);
  s.tick();
  assert.equal(hero.inventory.used, 0);
  assert.equal(near.disposed, false);
  hero.interaction.request();
  s.tick();
  assert.equal(hero.inventory.count('cell'), 2);
  assert.equal(near.disposed, true);
  assert.equal(farther.disposed, false);
  hero.interaction.request();
  s.tick();
  assert.equal(hero.interaction.result, 'full');
  assert.equal(farther.disposed, false);
  hero.inventory.remove('cell', 2);
  hero.interaction.request();
  s.tick();
  assert.equal(farther.disposed, true);
  assert.equal(hero.inventory.count('cell'), 1);
  hero.interaction.request();
  s.tick();
  assert.equal(hero.interaction.result, 'nothing');
  s.stage.dispose();
});

void test('interaction cannot reach through walls or collect detached items', () => {
  const s = setup([{ x: 125, y: 70, width: 10, height: 60 }]);
  const hero = s.actor(100, 100);
  const blocked = s.pickup(145, 100);
  const detached = s.pickup(90, 100);
  detached.detach();
  hero.interaction.request();
  s.tick();
  assert.equal(hero.interaction.result, 'nothing');
  assert.equal(blocked.disposed, false);
  assert.equal(hero.inventory.used, 0);
  const reachable = s.pickup(100, 150);
  hero.interaction.request();
  s.tick();
  assert.equal(reachable.disposed, true);
  detached.dispose();
  s.stage.dispose();
});

void test('two characters cannot collect the same supply; retired capabilities receive no further updates', () => {
  const s = setup();
  const a = s.actor(),
    b = s.actor();
  const pickup = s.pickup(120, 100);
  a.interaction.request();
  b.interaction.request();
  s.tick();
  assert.equal(pickup.disposed, true);
  assert.equal(a.inventory.used + b.inventory.used, 1);
  const body = a.body,
    bag = a.inventory,
    movement = a.movement,
    interaction = a.interaction;
  const steps = body.steps;
  a.dispose();
  s.tick(10);
  assert.equal(body.steps, steps);
  assert.throws(() => bag.add('cell'), /retired/);
  assert.throws(() => movement.move(1, 0), /retired/);
  assert.throws(() => interaction.request(), /retired/);
  assert.throws(() => body.setVelocity(1, 0), /retired/);
  const fresh = s.actor();
  assert.equal(fresh.inventory.used, 0);
  s.stage.dispose();
});

void test('AI uses the same movement and interaction; removing it stops both', () => {
  const s = setup();
  const scout = s.actor(100, 100, { speed: 110, capacity: 1 });
  scout.attach(
    new SupplyPatrol(scout.movement, scout.interaction, [
      { x: 100, y: 100 },
      { x: 250, y: 100 },
    ]),
  );
  const first = s.pickup(145, 100),
    extra = s.pickup(200, 100);
  s.tick(180);
  assert.equal(first.disposed, true);
  assert.equal(extra.disposed, false);
  assert.equal(scout.inventory.used, 1);
  assert.ok(scout.x >= 100 && scout.x <= 250);
  const retired = scout.body;
  scout.dispose();
  const count = retired.steps;
  s.tick(30);
  assert.equal(retired.steps, count);
  s.stage.dispose();
});

void test('bad configuration and foreign component dependencies fail before gameplay', () => {
  assert.throws(
    () =>
      new TopDownWorld({
        bounds: { x: 0, y: 0, width: 0, height: 100 },
        obstacles: [],
      }),
    /Rectangle/,
  );
  const s = setup([{ x: 150, y: 150, width: 100, height: 100 }]);
  assert.throws(() => s.actor(200, 200), /overlaps/);
  assert.throws(() => s.actor(0, 100), /bounds/);
  assert.throws(() => s.actor(100, 100, { width: -1 }), /dimensions/);
  assert.throws(() => s.actor(100, 100, { speed: 0 }), /speeds/);
  const a = s.actor(),
    b = s.stage.add();
  assert.throws(
    () => b.attach(new TopDownMovement({ body: a.body })),
    /Required/,
  );
  assert.throws(() => a.body.setVelocity(NaN, 0), /finite/);
  assert.throws(
    () => new SupplyPickup({ x: 0, y: 0, quantity: 0 }),
    /quantity/,
  );
  assert.throws(
    () => new SupplyPatrol(a.movement, a.interaction, []),
    /waypoints/,
  );
  assert.throws(() => a.remove(a.inventory), /dependents/);
  a.detach();
  const steps = a.body.steps;
  s.tick();
  assert.equal(a.body.steps, steps);
  a.dispose();
  s.stage.dispose();
});

void test('actual courtyard scout completes repeated laps without stalling, including with a full bag', () => {
  const stage = new Stage2D({ fixed: true });
  const world = new TopDownWorld(courtyard);
  const supply = stage.entity(
    () => new SupplyPickup({ x: 200, y: 130, quantity: 3 }),
  );
  const scout = stage.entity(
    () =>
      new Explorer({
        x: 200,
        y: 130,
        color: 'gold',
        world,
        pickups: () => [supply],
        width: 34,
        height: 30,
        speed: 110,
        capacity: 3,
      }),
  );
  scout.attach(new SupplyPatrol(scout.movement, scout.interaction, scoutRoute));
  const visits = scoutRoute.map(() => 0);
  let distanceWithFullBag = 0;
  for (let i = 0; i < 3600; i++) {
    const { x, y } = scout;
    stage.fixedUpdate!(1 / 60, frame);
    const travelled = Math.hypot(scout.x - x, scout.y - y);
    assert.ok(
      travelled > 0.1,
      `scout stalled at (${scout.x}, ${scout.y}) on tick ${i}`,
    );
    if (scout.inventory.used === scout.inventory.capacity)
      distanceWithFullBag += travelled;
    scoutRoute.forEach((point, index) => {
      if (Math.hypot(scout.x - point.x, scout.y - point.y) < 7)
        visits[index]!++;
    });
  }
  assert.equal(scout.inventory.used, 3);
  assert.ok(
    visits.every((count) => count >= 2),
    'every route corner is reached on multiple laps',
  );
  assert.ok(
    distanceWithFullBag > 6000,
    'full inventory never stops the patrol',
  );
  stage.dispose();
});
