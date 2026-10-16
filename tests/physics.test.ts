import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene2D } from '../src/index.js';
import { PhysicsWorld } from '../src/physics/matter.js';
import Matter from 'matter-js';
import type { Pair } from 'matter-js';
import { removeNativeBody } from '../src/physics/removeNativeBody.js';
import { createBodyNode } from '../examples/physics/createBodyNode.js';

void test('solver owns poses; contact listeners see resolved positions before presentation synchronization', () => {
  const world = new PhysicsWorld();
  const platform = world.rectangle(0, 100, 200, 20, 'static');
  const box = world.rectangle(0, 85, 20, 20);
  const node = createBodyNode(box);
  const phases: string[] = [];
  const subscription = world.onContact(box, (event) => {
    if (event.phase !== 'begin') return;
    phases.push(world.stats.phase);
    assert.ok(box.pose.y < 83); // initial overlap resolved, not raw collisionStart pose
    assert.equal(node.y, 85);
    assert.throws(() => world.step(1 / 60), /reentrant/);
  });
  try {
    node.y = -999;
    assert.equal(box.pose.y, 85);
    node.y = 85;
    world.step(1 / 60);
    assert.deepEqual(phases, ['contacts']);
    node.update(0, { dt: 0, time: 0 });
    assert.equal(node.y, box.pose.y);
    assert.equal(platform.pose.y, 100);
    subscription.dispose();
    node.dispose();
  } finally {
    world.dispose();
  }
});

void test('falling body crosses nonblocking sensor and rests on static ground without rendering', () => {
  const world = new PhysicsWorld();
  world.rectangle(0, 200, 400, 20, 'static');
  const sensor = world.rectangle(0, 100, 100, 40, 'sensor');
  const box = world.rectangle(0, 0, 20, 20);
  const events: string[] = [];
  const subscription = world.onContact(sensor, (event) => {
    const other = event.a === sensor ? event.b : event.a;
    if (other === box) events.push(event.phase);
  });
  try {
    for (let tick = 0; tick < 180; tick++) world.step(1 / 60);
    assert.deepEqual(events, ['begin', 'end']);
    assert.ok(Math.abs(box.pose.y - 180) < 1);
    assert.equal(sensor.pose.y, 100);
    subscription.dispose();
    subscription.dispose();
    assert.equal(world.stats.listeners, 0);
  } finally {
    world.dispose();
  }
});

void test('contact callback removal is post-solver; remaining body receives one removal end and no stale begin', () => {
  const world = new PhysicsWorld();
  const sensor = world.rectangle(0, 0, 100, 100, 'sensor');
  const box = world.rectangle(0, 0, 20, 20);
  const events: string[] = [];
  world.onContact(sensor, (event) => {
    events.push(`${event.phase}:${event.reason}`);
    if (event.phase === 'begin') box.dispose();
  });
  let stale = 0;
  world.onContact(box, () => {
    stale++;
  });
  try {
    world.step(1 / 60);
    world.step(1 / 60);
    assert.deepEqual(events, ['begin:solver', 'end:removed']);
    assert.equal(stale, 0);
    assert.equal(world.stats.bodies, 1);
    assert.equal(world.stats.contacts, 0);
    assert.equal(world.stats.listeners, 1);
    assert.throws(() => box.pose, /disposed/);
  } finally {
    world.dispose();
  }
});

void test('node and scene ownership release bodies/listeners once, including failing callbacks and final world disposal', () => {
  const world = new PhysicsWorld();
  const scene = new Scene2D();
  scene.own(world);
  const sensor = world.rectangle(0, 0, 100, 100, 'sensor');
  const box = world.rectangle(0, 0, 20, 20);
  let cleaned = 0;
  const node = scene.root.add(
    createBodyNode(box, () => {
      cleaned++;
    }),
  );
  const sensorNode = scene.root.add(createBodyNode(sensor));
  world.onContact(sensor, (event) => {
    if (event.phase === 'end') throw new Error('Contact cleanup failed');
  });
  world.step(1 / 60);
  assert.throws(() => node.dispose(), AggregateError);
  node.dispose();
  assert.equal(cleaned, 1);
  assert.equal(world.stats.bodies, 1);
  assert.equal(world.stats.contacts, 0);
  sensorNode.dispose();
  assert.equal(world.stats.listeners, 0);
  scene.dispose();
  scene.dispose();
  assert.equal(world.stats.disposed, true);
  assert.equal(world.stats.bodies, 0);
  assert.equal(world.stats.contacts, 0);
  assert.throws(() => world.step(1 / 60), /disposed/);
  assert.throws(() => world.rectangle(0, 0, 20, 20), /disposed/);
});

void test('removal prunes native caches without repeating surviving contacts; ownership and step bounds are guarded', () => {
  const world = new PhysicsWorld(),
    foreign = new PhysicsWorld();
  const sensor = world.rectangle(0, 0, 100, 100, 'sensor');
  world.rectangle(0, 0, 20, 20);
  const extra = world.rectangle(1000, 0, 20, 20);
  let begins = 0;
  world.onContact(sensor, (event) => {
    if (event.phase === 'begin') begins++;
  });
  try {
    assert.throws(() => foreign.onContact(sensor, () => {}), /this world/);
    assert.throws(() => world.step(1), RangeError);
    assert.throws(() => world.rectangle(0, 0, -20, 20), RangeError);
    world.step(1 / 60);
    extra.dispose();
    world.step(1 / 60);
    assert.equal(begins, 1);
    assert.equal(world.stats.contacts, 1);
  } finally {
    world.dispose();
    foreign.dispose();
  }
});

void test('velocity commands use seconds at different fixed steps, guard static/dead bodies and release snapshots', () => {
  for (const dt of [1 / 60, 1 / 120]) {
    const world = new PhysicsWorld();
    const body = world.rectangle(0, 0, 20, 20);
    const platform = world.rectangle(1000, 0, 20, 20, 'static');
    try {
      body.setVelocity({ x: 120, y: 0 });
      const snapshot = body.velocity;
      assert.ok(Object.isFrozen(snapshot));
      for (let tick = 0; tick < Math.round(1 / dt); tick++) {
        body.setVelocity({ x: 120, y: body.velocity.y });
        world.step(dt);
      }
      // Default air friction damps each tick; conversion remains seconds-based.
      assert.ok(Math.abs(body.pose.x - 120) < 1.3);
      assert.equal(snapshot.x, 120);
      assert.throws(() => platform.setVelocity({ x: 1, y: 0 }), /dynamic/);
      assert.throws(() => body.setVelocity({ x: NaN, y: 0 }), RangeError);
      body.dispose();
      assert.throws(() => body.velocity, /disposed/);
      assert.throws(() => body.setVelocity({ x: 0, y: 0 }), /disposed/);
    } finally {
      world.dispose();
    }
  }
});

void test('repeated unrelated removals preserve a settled stack and its contact transitions', () => {
  const changed = new PhysicsWorld(),
    baseline = new PhysicsWorld();
  function stack(world: PhysicsWorld) {
    world.rectangle(0, 200, 300, 20, 'static');
    return [150, 125, 100].map((y) => world.rectangle(0, y, 24, 24));
  }
  const boxes = stack(changed),
    reference = stack(baseline);
  let transitions = 0;
  for (const box of boxes)
    changed.onContact(box, () => {
      transitions++;
    });
  try {
    for (let i = 0; i < 360; i++) {
      changed.step(1 / 60);
      baseline.step(1 / 60);
    }
    const settled = transitions;
    for (let i = 0; i < 240; i++) {
      const extra = changed.rectangle(1000, -100, 20, 20);
      extra.dispose();
      changed.step(1 / 60);
      baseline.step(1 / 60);
      assert.equal(changed.stats.cachedBodies, 4);
      assert.equal(changed.stats.cachedPairs, 3);
      for (const [index, box] of boxes.entries()) {
        const other = reference[index];
        assert.ok(other);
        assert.ok(Math.abs(box.pose.y - other.pose.y) < 1e-9);
        assert.ok(Math.abs(box.pose.x - other.pose.x) < 1e-9);
        assert.ok(Math.abs(box.pose.angle - other.pose.angle) < 1e-9);
      }
    }
    assert.equal(transitions, settled);
    boxes[1]?.dispose();
    assert.equal(changed.stats.cachedPairs, 1);
    assert.equal(changed.stats.cachedBodies, 3);
    changed.dispose();
    assert.equal(changed.stats.cachedPairs, 0);
    assert.equal(changed.stats.cachedBodies, 0);
  } finally {
    changed.dispose();
    baseline.dispose();
  }
});

void test('targeted native removal preserves surviving pair identity and warm-start impulses', () => {
  const engine = Matter.Engine.create();
  const floor = Matter.Bodies.rectangle(0, 100, 200, 20, { isStatic: true });
  const box = Matter.Bodies.rectangle(0, 80, 20, 20);
  const sensor = Matter.Bodies.rectangle(0, 80, 50, 40, {
    isStatic: true,
    isSensor: true,
  });
  Matter.Composite.add(engine.world, [floor, box, sensor]);
  for (let i = 0; i < 60; i++) Matter.Engine.update(engine, 1000 / 60);
  const cache = engine.pairs as { list: Pair[]; table: Record<string, Pair> };
  const pair = cache.list.find(
    (pair) => pair.bodyA === floor && pair.bodyB === box,
  );
  assert.ok(pair);
  // Assert exact cache identity: even numerically stable stacks must retain warm starts.
  const contacts = (pair as Pair & { contacts: Matter.Contact[] }).contacts;
  const impulses = contacts.map((contact) => [
    contact.normalImpulse,
    contact.tangentImpulse,
  ]);
  Matter.Composite.remove(engine.world, sensor);
  removeNativeBody(engine, sensor, [floor, box]);
  assert.deepEqual(cache.list, [pair]);
  assert.equal(cache.table[pair.id], pair);
  assert.equal(
    (pair as Pair & { contacts: Matter.Contact[] }).contacts,
    contacts,
  );
  assert.deepEqual(
    contacts.map((contact) => [contact.normalImpulse, contact.tangentImpulse]),
    impulses,
  );
  assert.equal(engine.detector.bodies.includes(sensor), false);
  Matter.Engine.update(engine, 1000 / 60);
  assert.equal(cache.list[0], pair);
  Matter.Composite.clear(engine.world, false, true);
  Matter.Engine.clear(engine);
});
