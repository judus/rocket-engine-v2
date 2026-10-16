import type { Behavior } from '../src/index.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Node2D, Scene2D } from '../src/index.js';
import { createArm } from '../examples/createArm.js';

const frame = Object.freeze({ dt: 1, time: 1 });

void test('nested translated, rotated and nonuniformly scaled transforms round-trip', () => {
  const parent = new Node2D({
    x: -20,
    y: 40,
    rotation: Math.PI / 2,
    scaleX: 2,
    scaleY: 3,
  });
  const child = parent.add(
    new Node2D({ x: 10, y: 5, rotation: -0.4, scaleX: -2, scaleY: 0.5 }),
  );
  const origin = child.localToWorld({ x: 0, y: 0 });
  assert.ok(Math.abs(origin.x + 35) < 1e-9);
  assert.ok(Math.abs(origin.y - 60) < 1e-9);
  const point = { x: 3.2, y: -7.8 },
    local = child.worldToLocal(child.localToWorld(point));
  assert.ok(
    Math.abs(local.x - point.x) < 1e-9 && Math.abs(local.y - point.y) < 1e-9,
  );
  child.scaleX = 0;
  assert.throws(() => child.worldToLocal(point), /invertible/);
  parent.dispose();
});

void test('stable preorder and attachment order; additions wait until next tree update', () => {
  const scene = new Scene2D();
  const calls: string[] = [];
  const parent = scene.root.add(new Node2D());
  const child = parent.add(new Node2D());
  let added = false;
  parent.attach({
    update() {
      calls.push('parent-first');
      if (!added) {
        added = true;
        child.attach({
          update() {
            calls.push('new-behavior');
          },
        });
        parent.add(new Node2D()).attach({
          update() {
            calls.push('new-child');
          },
        });
      }
    },
  });
  parent.attach({
    update() {
      calls.push('parent-second');
    },
  });
  child.attach({
    update() {
      calls.push('child');
    },
  });
  scene.update(1, frame);
  assert.deepEqual(calls, ['parent-first', 'parent-second', 'child']);
  calls.length = 0;
  scene.update(1, frame);
  assert.deepEqual(calls, [
    'parent-first',
    'parent-second',
    'child',
    'new-behavior',
    'new-child',
  ]);
  scene.dispose();
});

void test('detach retains lifetime; reattachment preserves local pose and skips stale traversal', () => {
  const root = new Node2D();
  const first = root.add(new Node2D({ x: 10 }));
  const second = root.add(new Node2D({ x: 100 }));
  const child = first.add(new Node2D({ x: 2 }));
  let updates = 0,
    cleaned = 0,
    moved = false;
  child.attach({
    update() {
      updates++;
    },
    dispose() {
      cleaned++;
    },
  });
  first.attach({
    update() {
      if (!moved) {
        moved = true;
        second.add(child.detach());
      }
    },
  });
  root.update(1, frame);
  assert.equal(updates, 0);
  assert.equal(cleaned, 0);
  assert.equal(child.x, 2);
  assert.equal(child.localToWorld({ x: 0, y: 0 }).x, 102);
  root.update(1, frame);
  assert.equal(updates, 1);
  child.detach();
  root.dispose();
  assert.equal(child.disposed, false);
  assert.equal(cleaned, 0);
  child.dispose();
  assert.equal(cleaned, 1);
});

void test('destroy and behavior removal skip later hooks immediately; cleanup is once', () => {
  const root = new Node2D();
  const child = root.add(new Node2D());
  let later = 0,
    cleaned = 0;
  const laterBehavior = root.attach({
    update() {
      later++;
    },
    dispose() {
      cleaned++;
    },
  });
  child.attach({
    update() {
      later++;
    },
    dispose() {
      cleaned++;
    },
  });
  // A separate earlier child destroys a later subtree before its turn.
  const other = new Node2D();
  const victim = other.add(new Node2D());
  other.attach({
    update() {
      victim.dispose();
    },
  });
  victim.attach({
    update() {
      later++;
    },
    dispose() {
      cleaned++;
    },
  });
  other.update(1, frame);
  assert.equal(later, 0);
  root.remove(laterBehavior);
  root.remove(laterBehavior);
  root.dispose();
  root.dispose();
  other.dispose();
  assert.equal(cleaned, 3);
});

void test('cleanup runs children and behaviors in reverse order and continues after failures', () => {
  const calls: string[] = [];
  const scene = new Scene2D({
    dispose() {
      calls.push('scene');
    },
  });
  const node = scene.root.add(new Node2D());
  node.attach({
    dispose() {
      calls.push('first');
    },
  });
  node.attach({
    dispose() {
      calls.push('second');
      throw new Error('cleanup failed');
    },
  });
  node.add(new Node2D()).attach({
    dispose() {
      calls.push('child');
    },
  });
  assert.throws(() => scene.dispose(), AggregateError);
  assert.deepEqual(calls, ['child', 'second', 'first', 'scene']);
  scene.dispose();
  assert.throws(() => node.attach({}), /disposed/);
});

void test('exclusive ownership, cycle rejection and synchronous behavior contract', () => {
  const scene = new Scene2D();
  const a = scene.root.add(new Node2D());
  const b = a.add(new Node2D());
  assert.throws(() => b.add(scene.root), /owned/);
  assert.throws(() => a.add(a), /owned/);
  const detached = new Node2D();
  const descendant = detached.add(new Node2D());
  assert.throws(() => descendant.add(detached), /cycle/);
  assert.throws(() => scene.root.add(b), /owned/);
  const behavior = a.attach({});
  assert.throws(() => b.attach(behavior), /owned/);
  // @ts-expect-error Async behavior hooks also fail for untyped callers at runtime.
  assert.throws(() => a.attach({ async update() {} }), /synchronous/);
  // @ts-expect-error Async cleanup is unsupported for nodes.
  assert.throws(() => a.attach({ async dispose() {} }), /synchronous/);
  a.attach({
    // @ts-expect-error Ordinary Promise-returning hooks violate the same contract.
    update() {
      return Promise.resolve();
    },
  });
  assert.throws(() => scene.update(1, frame), /Promise/);
  scene.dispose();
  detached.dispose();
});

void test('reusable arm instances have independent state and clean up through their owner', () => {
  const scene = new Scene2D();
  let cleaned = 0;
  const first = createArm({
    x: 0,
    y: 0,
    onCleanup() {
      cleaned++;
    },
  });
  const second = createArm({
    x: 100,
    y: 0,
    onCleanup() {
      cleaned++;
    },
  });
  scene.root.add(first.node);
  scene.root.add(second.node);
  first.pause();
  scene.update(1, frame);
  assert.equal(first.node.x, 0);
  assert.notEqual(second.node.x, 100);
  assert.equal(first.updates, 1);
  assert.equal(second.updates, 1);
  first.node.dispose();
  scene.update(1, frame);
  assert.equal(first.updates, 1);
  assert.equal(second.updates, 2);
  assert.equal(cleaned, 1);
  scene.dispose();
  assert.equal(cleaned, 2);
});

void test('removing later behavior or destroying host suppresses remaining hooks immediately', () => {
  const node = new Node2D();
  const calls: string[] = [];
  let later: Behavior;
  node.attach({
    update() {
      node.remove(later);
    },
    dispose() {
      calls.push('first-cleanup');
    },
  });
  later = node.attach({
    update() {
      calls.push('late-update');
    },
    dispose() {
      calls.push('late-cleanup');
    },
  });
  node.attach({
    update() {
      node.dispose();
    },
  });
  node.attach({
    update() {
      calls.push('after-destroy');
    },
  });
  node.update(1, frame);
  node.update(1, frame);
  node.dispose();
  assert.deepEqual(calls, ['late-cleanup', 'first-cleanup']);
});

void test('arm commands apply before transforms, including an exact drag position during motion', () => {
  const arm = createArm({ x: 100, y: 200 });
  arm.moveTo({ x: 250, y: 150 });
  arm.node.update(0.1, frame);
  assert.ok(Math.abs(arm.node.x - 250) < 1e-9);
  assert.equal(arm.node.y, 150);
  arm.pause();
  arm.moveBy(10, -20);
  arm.node.update(0.1, frame);
  assert.ok(Math.abs(arm.node.x - 260) < 1e-9);
  assert.equal(arm.node.y, 130);
  arm.node.dispose();
});
