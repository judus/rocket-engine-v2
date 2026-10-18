import test from 'node:test';
import assert from 'node:assert/strict';
import { Node2D, Scene2D, position2DWriter } from '../src/index.js';
import type { Behavior } from '../src/index.js';
import { Stage2D } from '../src/experimental/index.js';
import { Runner, Patrol } from '../games/platformer/Runner.js';
import { PlatformerSolver } from '../games/platformer/PlatformerPhysics.js';
import { platformerWorld } from '../examples/input/PlatformerDemo.js';

const dt = 1 / 60;
const frame = { dt, time: dt, tick: 1 };

void test('fixed capabilities run in subtree-wide order after scene input, with stable ties', () => {
  const calls: string[] = [];
  const stage = new Stage2D({
    fixed: true,
    fixedUpdate() {
      calls.push('input');
    },
  });
  for (const name of ['a', 'b']) {
    const actor = stage.add();
    actor.attach({
      fixedOrder: 10,
      fixedUpdate() {
        calls.push(`${name}:observe`);
      },
    });
    actor.attach({
      fixedUpdate() {
        calls.push(`${name}:move`);
      },
    });
    actor.attach({
      fixedOrder: -10,
      fixedUpdate() {
        calls.push(`${name}:intent`);
      },
    });
  }
  stage.fixedUpdate!(dt, frame);
  assert.deepEqual(calls, [
    'input',
    'a:intent',
    'b:intent',
    'a:move',
    'b:move',
    'a:observe',
    'b:observe',
  ]);
  stage.dispose();
  stage.fixedUpdate!(dt, frame);
  assert.equal(calls.length, 7);
  const hooked = new Stage2D({ fixedUpdate() {} });
  hooked.fixedUpdate!(dt, frame);
  hooked.dispose();
});

void test('typed facade entities use shared movement, independent intent and automatic retirement', () => {
  const stage = new Stage2D({ fixed: true });
  const solver = stage
    .layer('world')
    .attach(new PlatformerSolver(platformerWorld));
  const hero = stage.entity(
    () => new Runner({ x: 80, color: 'white', solver }),
    { id: 'hero' },
  );
  const ai = stage.entity(() => new Runner({ x: 180, color: 'gold', solver }));
  ai.attach(new Patrol(ai.movement));
  hero.movement.move(1);
  stage.fixedUpdate!(dt, frame);
  assert.equal(hero.x, 83);
  assert.equal(ai.x, 183);
  assert.equal(hero.travel.distance, 3);
  assert.equal(hero.body.steps, 1);
  hero.movement.jump();
  stage.fixedUpdate!(dt, frame);
  assert.ok(hero.y < 480);
  const vertical = hero.y;
  hero.movement.jump(); // air presses do not add a second jump
  stage.fixedUpdate!(dt, frame);
  assert.ok(vertical - hero.y < 10);
  assert.throws(() => hero.movement.move(NaN), /axis/);
  assert.throws(() => hero.movement.move(2), /axis/);
  const retired = hero.movement;
  const retiredBody = hero.body;
  hero.dispose();
  stage.fixedUpdate!(dt, frame);
  assert.equal(retiredBody.steps, 3);
  assert.throws(() => retired.move(1), /retired/);
  assert.throws(() => retired.jump(), /retired/);
  assert.equal(stage.find('hero'), undefined);
  assert.equal(ai.body.steps, 4);
  stage.dispose();
  assert.throws(() => ai.movement.move(1), /retired/);
});

void test('fixed traversal skips removed, disposed and detached work and defers additions', () => {
  const scene = new Scene2D({ fixedBehaviors: true });
  const events: string[] = [];
  const a = scene.root.add(new Node2D());
  const b = scene.root.add(new Node2D());
  const removed = b.attach({
    fixedUpdate() {
      events.push('removed');
    },
  });
  const detached = scene.root.add(new Node2D());
  detached.attach({
    fixedUpdate() {
      events.push('detached');
    },
  });
  const disposed = scene.root.add(new Node2D());
  disposed.attach({
    fixedUpdate() {
      events.push('disposed');
    },
  });
  let first = true;
  a.attach({
    fixedOrder: -1,
    fixedUpdate() {
      if (!first) return;
      first = false;
      b.remove(removed);
      detached.detach();
      disposed.dispose();
      b.attach({
        fixedUpdate() {
          events.push('new');
        },
      });
    },
  });
  scene.fixedUpdate!(dt, frame);
  assert.deepEqual(events, []);
  scene.fixedUpdate!(dt, frame);
  assert.deepEqual(events, ['new']);
  detached.dispose();
  scene.dispose();
  scene.fixedUpdate!(dt, frame);
  scene.root.fixedUpdate(dt, frame);
});

void test('fixed pass stops on disposal, rejects invalid dt and reports failing owner', () => {
  const root = new Node2D();
  assert.throws(() => root.fixedUpdate(0, frame), /dt/);
  assert.throws(() => root.fixedUpdate(NaN, frame), /dt/);
  root.attach({
    fixedUpdate() {
      root.dispose();
    },
  });
  root.attach({
    fixedUpdate() {
      assert.fail('disposed tree continued');
    },
  });
  root.fixedUpdate(dt, frame);
  const other = new Node2D({ x: 42 });
  const failure = new Error('broken solver');
  other.attach({
    fixedUpdate() {
      throw failure;
    },
  });
  assert.throws(
    () => other.fixedUpdate(dt, frame),
    (error: unknown) =>
      error instanceof Error &&
      error.cause === failure &&
      error.message.includes('(42, 0)'),
  );
  other.dispose();
});

void test('attachment validates dependencies, writer claims and order before side effects', () => {
  const a = new Node2D();
  const b = new Node2D();
  let attached = false;
  const movement = a.attach({
    writes: [position2DWriter],
    onAttach() {
      attached = true;
    },
  });
  assert.equal(attached, true);
  assert.throws(() => b.attach({ requires: [movement] }), /Required/);
  assert.throws(
    () =>
      a.attach({
        writes: [position2DWriter],
        onAttach() {
          assert.fail('conflicting attachment ran');
        },
      }),
    /Conflicting/,
  );
  assert.throws(
    () => a.attach({ writes: ['bad'] } as unknown as Behavior),
    /symbols/,
  );
  assert.throws(() => a.attach({ fixedOrder: Infinity }), /fixedOrder/);
  const observer = a.attach({ requires: [movement] });
  assert.throws(() => a.remove(movement), /dependents/);
  a.remove(observer);
  a.remove(movement);
  assert.throws(() => b.attach(movement), /already owned/);
  a.attach({ writes: [position2DWriter] }); // removed writer released its claim
  a.dispose();
  b.dispose();
});

void test('attachment failure retires the handle, cleans up, blocks reentrant tree mutation', () => {
  const node = new Node2D();
  let cleaned = 0;
  const failed: Behavior = {
    onAttach() {
      throw new Error('setup failed');
    },
    dispose() {
      cleaned++;
    },
  };
  assert.throws(() => node.attach(failed), /setup failed/);
  assert.equal(cleaned, 1);
  assert.throws(() => node.attach(failed), /already owned/);
  assert.throws(
    () =>
      node.attach({
        onAttach() {
          node.attach({});
        },
      }),
    /capability attachment/,
  );
  assert.throws(
    () =>
      node.attach({
        onAttach() {
          node.dispose();
        },
      }),
    /capability attachment/,
  );
  assert.throws(
    () =>
      node.attach({
        onAttach() {
          throw new Error('setup');
        },
        dispose() {
          throw new Error('cleanup');
        },
      }),
    AggregateError,
  );
  assert.throws(
    () =>
      node.attach({ onAttach: async () => undefined } as unknown as Behavior),
    /synchronous/,
  );
  assert.throws(
    () =>
      node.attach({
        fixedUpdate: async () => undefined,
      } as unknown as Behavior),
    /synchronous/,
  );
  node.attach({}); // failed transactions leave the node usable
  node.dispose();
});

void test('typed entity factories validate identity and ownership before adoption', () => {
  const stage = new Stage2D();
  const solver = stage
    .layer('world')
    .attach(new PlatformerSolver(platformerWorld));
  stage.entity(() => new Runner({ x: 50, color: 'white', solver }), {
    id: 'a',
  });
  assert.throws(
    () =>
      stage.entity(() => new Runner({ x: 50, color: 'white', solver }), {
        id: 'a',
      }),
    /Duplicate/,
  );
  assert.throws(
    () =>
      stage.entity(() => new Runner({ x: 50, color: 'white', solver }), {
        layer: 'missing',
      }),
    /Unknown layer/,
  );
  const dead = new Node2D();
  dead.dispose();
  assert.throws(() => stage.entity(() => dead), /live, unparented/);
  const parent = new Node2D();
  const child = parent.add(new Node2D());
  assert.throws(() => stage.entity(() => child), /live, unparented/);
  assert.throws(
    () => stage.entity(() => null as unknown as Node2D),
    /live, unparented/,
  );
  assert.throws(
    () => stage.entity((async () => new Node2D()) as unknown as () => Node2D),
    /synchronous/,
  );
  parent.dispose();
  stage.dispose();
});
