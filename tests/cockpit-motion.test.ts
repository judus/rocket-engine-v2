import test from 'node:test';
import assert from 'node:assert/strict';
import { CockpitMotion } from '../examples/webgl/CockpitMotion.js';

void test('cockpit movement leans slightly and settles exactly back to rest', () => {
  const motion = new CockpitMotion();
  for (let i = 0; i < 60; i++) motion.update(1 / 60, 1, 0, 1);
  assert.ok(motion.x < -1.7 && motion.x >= -2);
  assert.ok(motion.y < -0.5 && motion.y >= -1);
  for (let i = 0; i < 180; i++) motion.update(1 / 60, 0, 0, 0);
  assert.ok(Math.abs(motion.x) < 1e-10 && Math.abs(motion.y) < 1e-10);
});

void test('small impact and repeated large impulses stay bounded and reset cleanly', () => {
  const motion = new CockpitMotion();
  motion.kick(20, -25);
  motion.update(0.05, 0, 0, 0);
  assert.ok(motion.x > 0 && motion.y < 0);
  for (let i = 0; i < 500; i++) {
    motion.kick(1e6, -1e6);
    motion.update(1 / 60, 1, -1, 1);
    assert.ok(Math.abs(motion.x) <= 3 && Math.abs(motion.y) <= 3);
  }
  motion.reset();
  motion.update(1, 0, 0, 0);
  assert.equal(motion.x, 0);
  assert.equal(motion.y, 0);
});

void test('spring response agrees across update partitions for a constant input', () => {
  const one = new CockpitMotion(),
    many = new CockpitMotion();
  one.kick(10, -15);
  many.kick(10, -15);
  one.update(0.5, 0.5, 0.2, 1);
  for (let i = 0; i < 50; i++) many.update(0.01, 0.5, 0.2, 1);
  assert.ok(Math.abs(one.x - many.x) < 1e-12);
  assert.ok(Math.abs(one.y - many.y) < 1e-12);
});
