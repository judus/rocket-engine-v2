import test from 'node:test';
import assert from 'node:assert/strict';
import { CockpitMotion } from '../games/farwake/visuals/CockpitMotion.js';
import { CockpitFlight } from '../examples/webgl/CockpitFlight.js';

void test('cockpit movement leans slightly and settles exactly back to rest', () => {
  const motion = new CockpitMotion();
  for (let i = 0; i < 60; i++) motion.update(1 / 60, 1, 0, 1);
  assert.ok(motion.x < -0.149 && motion.x >= -0.15);
  assert.equal(motion.y, 0);
  assert.ok(motion.z > 0.149 && motion.z <= 0.15);
  for (let i = 0; i < 180; i++) motion.update(1 / 60, 0, 0, 0);
  assert.ok(
    Math.abs(motion.x) < 1e-10 &&
      Math.abs(motion.y) < 1e-10 &&
      Math.abs(motion.z) < 1e-10,
  );
});

void test('small impact and repeated large impulses stay bounded and reset cleanly', () => {
  const motion = new CockpitMotion();
  motion.kick(5, -6);
  motion.update(0.05, 0, 0, 0);
  assert.ok(motion.x > 0 && motion.y < 0);
  for (let i = 0; i < 500; i++) {
    motion.kick(1e6, -1e6);
    motion.update(1 / 60, 1, -1, 1);
    assert.ok(
      Math.abs(motion.x) <= 0.15 &&
        Math.abs(motion.y) <= 0.15 &&
        Math.abs(motion.z) <= 0.15,
    );
  }
  motion.reset();
  motion.update(1, 0, 0, 0);
  assert.equal(motion.x, 0);
  assert.equal(motion.y, 0);
  assert.equal(motion.z, 0);
});

void test('spring response agrees across update partitions for a constant input', () => {
  const one = new CockpitMotion(),
    many = new CockpitMotion();
  one.kick(1, -1.5);
  many.kick(1, -1.5);
  one.update(0.5, 0.5, 0.2, 1);
  for (let i = 0; i < 50; i++) many.update(0.01, 0.5, 0.2, 1);
  assert.ok(Math.abs(one.x - many.x) < 1e-12);
  assert.ok(Math.abs(one.y - many.y) < 1e-12);
  assert.ok(Math.abs(one.z - many.z) < 1e-12);
});

void test('flight accelerates progressively, coasts on release, and resets', () => {
  const flight = new CockpitFlight();
  const first = flight.update(0.1, 0, 0, 8);
  assert.ok(flight.speed > 0 && flight.speed < 8);
  assert.ok(first.z > 0 && first.z < 0.8);
  const before = flight.speed;
  const coast = flight.update(0.1, 0, 0, 0);
  assert.ok(flight.speed < before && flight.speed > 0);
  assert.ok(coast.z > 0 && coast.az < 0);
  for (let i = 0; i < 150; i++) flight.update(0.1, 0, 0, 0);
  assert.ok(flight.speed < 1e-12);
  flight.reset();
  assert.equal(flight.speed, 0);
});
void test('flight distance and velocity agree across update partitions', () => {
  const one = new CockpitFlight(),
    many = new CockpitFlight();
  const full = one.update(1, 3, -2, 8);
  let distance = 0;
  for (let i = 0; i < 100; i++) distance += many.update(0.01, 3, -2, 8).z;
  assert.ok(Math.abs(full.z - distance) < 1e-12);
  assert.ok(Math.abs(one.speed - many.speed) < 1e-12);
});

void test('forward acceleration and braking use depth without vertical displacement', () => {
  const motion = new CockpitMotion();
  for (let i = 0; i < 60; i++) motion.update(1 / 60, 0, 0, 1);
  assert.ok(motion.z > 0.149);
  assert.equal(motion.y, 0);
  for (let i = 0; i < 60; i++) motion.update(1 / 60, 0, 0, -1);
  assert.ok(motion.z < -0.149);
  assert.equal(motion.y, 0);
  assert.equal(motion.x, 0);
});
