import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship } from '../games/ship/Ship.js';
import { starterSetup } from './helpers/shipSetup.js';
import type { ShipProfile } from '../games/ship/ShipProfiles.js';
import { Stage2D } from '../src/experimental/index.js';

const close = (a: number, b: number, tolerance = 1e-8) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function step(ship: Ship, dt = 1 / 60): void {
  ship.fixedUpdate(dt, {
    dt,
    tick: ship.telemetry.tick + 1,
    time: ship.telemetry.timeSeconds + dt,
  });
}
const initial = {
  engineTemperatureK: 293.15,
  energyJ: 100,
  velocityMps: { x: 0, y: 0, z: 0 },
};
const small: ShipProfile = {
  id: 'test-ship',
  cooling: { ...starterSetup.profile.cooling, restartEnergyJ: 50 },
  dampers: { ...starterSetup.profile.dampers, restartEnergyJ: 50 },
  body: { id: 'test-hull', massKg: 2, yawInertiaKgM2: 2 },
  power: { id: 'test-reactor', capacityJ: 100, reactorOutputW: 0 },
  engine: {
    id: 'test-engine',
    thermal: starterSetup.profile.engine.thermal,
    maxThrustN: 20,
    maxYawTorqueNm: 4,
    baselineW: 10,
    fullThrustW: 100,
    fullYawW: 20,
    restartEnergyJ: 50,
  },
};
void test('Assembled ship advances from commands through power/engine to one Newtonian motion update', () => {
  const ship = new Ship(starterSetup.profile, starterSetup.initialState);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  for (let i = 0; i < 60; i++) step(ship);
  const s = ship.telemetry;
  close(s.body.velocityMps.z, 10);
  close(s.body.positionM.z, 5);
  close(s.worldForceN.z, 1e6);
  close(s.power.energyJ, 100e9 + 5e9 - 20.01e9, 0.001);
  close(s.engine.suppliedW, 20.01e9);
  close(s.engine.activityFraction, 1);
  assert.equal(s.tick, 60);
  ship.dispose();
});
void test('Final partial supply delivers only funded activity; zero supply coasts without stale force', () => {
  const ship = new Ship(small, initial);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  step(ship, 1);
  close(ship.telemetry.power.energyJ, 0);
  close(ship.telemetry.engine.suppliedW, 100);
  close(ship.telemetry.engine.activityFraction, 0.9);
  close(ship.telemetry.worldForceN.z, 18);
  close(ship.telemetry.body.velocityMps.z, 9);
  assert.equal(ship.telemetry.engine.state, 'limited');
  step(ship, 1);
  close(ship.telemetry.engine.suppliedW, 0);
  close(ship.telemetry.worldForceN.z, 0);
  close(ship.telemetry.body.velocityMps.z, 9);
  close(ship.telemetry.body.positionM.z, 13.5);
  assert.equal(ship.telemetry.engine.state, 'waiting-for-charge');
  ship.dispose();
});
void test('Baseline shortage produces no thrust; automatic charge recovery retains requested state', () => {
  const ship = new Ship(
    {
      ...small,
      power: { ...small.power, reactorOutputW: 30 },
    },
    { ...initial, energyJ: 5 },
  );
  ship.power.requestEnabled(false);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  step(ship, 1);
  close(ship.telemetry.engine.suppliedW, 5);
  close(ship.telemetry.worldForceN.z, 0);
  ship.power.requestEnabled(true);
  step(ship, 1);
  assert.equal(ship.telemetry.engine.state, 'waiting-for-charge');
  close(ship.telemetry.power.energyJ, 30);
  step(ship, 1);
  assert.equal(ship.telemetry.engine.requested, true);
  assert.equal(ship.telemetry.engine.state, 'limited');
  close(ship.telemetry.engine.suppliedW, 60);
  close(ship.telemetry.worldForceN.z, 10);
  ship.dispose();
});
void test('Neutral preserves linear/angular momentum and manual engine off removes baseline demand', () => {
  const ship = new Ship(
    {
      ...small,
      power: { ...small.power, reactorOutputW: 1000 },
    },
    initial,
  );
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  ship.control.turn(1);
  step(ship, 0.1);
  const prior = ship.telemetry;
  ship.control.clear();
  ship.engine.requestEnabled(false);
  step(ship, 0.1);
  assert.equal(ship.telemetry.engine.state, 'off');
  close(ship.telemetry.power.consumptionW, 0);
  close(ship.telemetry.body.velocityMps.z, prior.body.velocityMps.z);
  close(ship.telemetry.body.yawRateRadps, prior.body.yawRateRadps);
  assert.ok(ship.telemetry.body.yawRadians > prior.body.yawRadians);
  ship.dispose();
});
void test('Body heading redirects new ship-local thrust without rotating existing world momentum', () => {
  const ship = new Ship(
    {
      ...small,
      power: { ...small.power, reactorOutputW: 1000 },
    },
    initial,
  );
  ship.control.turn(1);
  step(ship, 1); // yaw = 1 rad, yaw rate = 2 rad/s
  close(ship.telemetry.body.yawRadians, 1);
  ship.control.turn(0);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  step(ship, 0.1);
  close(ship.telemetry.worldForceN.x, 20 * Math.sin(1));
  close(ship.telemetry.worldForceN.z, 20 * Math.cos(1));
  const velocity = ship.telemetry.body.velocityMps;
  ship.control.clear();
  step(ship, 0.1);
  assert.deepEqual(ship.telemetry.body.velocityMps, velocity);
  ship.dispose();
});
void test('Diagonal translation is normalized and shares one engine activity allocation with yaw', () => {
  const ship = new Ship(small, initial);
  ship.control.thrust({ x: 1, y: 1, z: 1 });
  ship.control.turn(1);
  step(ship, 1);
  close(ship.telemetry.engine.demandW, 130);
  close(ship.telemetry.engine.activityFraction, 0.75);
  close(Math.hypot(...Object.values(ship.telemetry.worldForceN)), 15);
  close(ship.telemetry.engine.yawTorqueNm, 3);
  ship.dispose();
});
void test('Scene facade owns independent ship lifetimes; telemetry is a coherent immutable committed tick', () => {
  const stage = new Stage2D({ fixed: true });
  const first = stage.entity(
    () => new Ship(starterSetup.profile, starterSetup.initialState),
    { id: 'first' },
  );
  const second = stage.entity(
    () => new Ship(starterSetup.profile, starterSetup.initialState),
    { id: 'second' },
  );
  first.control.thrust({ x: 0, y: 0, z: 1 });
  const previous = first.telemetry;
  stage.fixedUpdate!(0.1, { dt: 0.1, tick: 1, time: 0.1 });
  assert.equal(previous.tick, 0);
  close(previous.body.velocityMps.z, 0);
  assert.ok(Object.isFrozen(first.telemetry));
  assert.ok(Object.isFrozen(first.telemetry.body.velocityMps));
  assert.ok(Object.isFrozen(first.telemetry.engine.thrustN));
  close(first.telemetry.body.velocityMps.z, 1);
  close(second.telemetry.body.velocityMps.z, 0);
  const last = first.telemetry;
  first.dispose();
  stage.fixedUpdate!(0.1, { dt: 0.1, tick: 2, time: 0.2 });
  assert.equal(first.telemetry, last);
  assert.equal(second.telemetry.tick, 2);
  stage.dispose();
});
void test('Invalid commands/profiles fail before simulation side effects', () => {
  assert.throws(
    () =>
      new Ship(
        {
          ...starterSetup.profile,
          body: { ...starterSetup.profile.body, massKg: 0 },
        },
        starterSetup.initialState,
      ),
  );
  assert.throws(
    () =>
      new Ship(
        { ...small, engine: { ...small.engine, fullThrustW: NaN } },
        initial,
      ),
  );
  assert.throws(
    () =>
      new Ship(
        { ...small, engine: { ...small.engine, restartEnergyJ: 101 } },
        initial,
      ),
  );
  const ship = new Ship(small, initial);
  assert.throws(() => ship.control.thrust({ x: NaN, y: 0, z: 0 }));
  assert.throws(() => ship.control.turn(2));
  const before = ship.telemetry;
  assert.throws(() => step(ship, 2));
  assert.equal(ship.telemetry, before);
  close(ship.power.telemetry.energyJ, 100);
  ship.dispose();
});
