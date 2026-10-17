import test from 'node:test';
import assert from 'node:assert/strict';
import { Component, World } from '../src/index.js';

void test('ECS queries join typed components, preserve identity and snapshot membership', () => {
  const world = new World();
  const position = new Component<{ x: number }>('position');
  const velocity = new Component<number>('velocity');
  const sameName = new Component<number>('velocity');
  const a = world.create(),
    b = world.create();
  world.set(a, position, { x: 3 });
  world.set(a, velocity, 2);
  world.set(b, position, { x: 5 });
  assert.deepEqual(world.query(position, velocity), [a]);
  assert.deepEqual(world.query(sameName), []);
  for (const entity of world.query(position, velocity)) {
    world.get(entity, position)!.x += world.get(entity, velocity)! * 0.5;
  }
  assert.equal(world.get(a, position)!.x, 4);
  assert.equal(world.get(b, position)!.x, 5);
  world.set(a, velocity, 0);
  assert.equal(world.get(a, velocity), 0);
  const snapshot = world.query(position);
  assert.equal(world.remove(a, position), true);
  assert.equal(world.remove(a, position), false);
  assert.deepEqual(snapshot, [a, b]);
  assert.deepEqual(world.query(position), [b]);
});

void test('ECS rejects foreign or destroyed identities and clears component ownership', () => {
  const world = new World(),
    other = new World();
  const flag = new Component<boolean>('flag');
  const a = world.create(),
    foreign = other.create();
  assert.equal(a.id, foreign.id);
  assert.throws(() => world.set(foreign, flag, true), /belong/);
  assert.equal(world.get(foreign, flag), undefined);
  assert.equal(world.remove(foreign, flag), false);
  world.set(a, flag, false);
  assert.equal(world.get(a, flag), false);
  assert.equal(world.destroy(a), true);
  assert.equal(world.destroy(a), false);
  assert.throws(() => world.set(a, flag, true), /belong/);
  const b = world.create();
  world.set(b, flag, true);
  world.clear();
  assert.deepEqual(world.query(), []);
  assert.equal(world.get(b, flag), undefined);
});
