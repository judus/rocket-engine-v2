import test from 'node:test';
import assert from 'node:assert/strict';
import { ModuleHealth } from '../games/ship/ModuleHealth.js';
import { Ship } from '../games/ship/Ship.js';
import type { ShipProfile } from '../games/ship/ShipProfiles.js';
import { starterSetup } from './helpers/shipSetup.js';

const profile: ShipProfile = {
  ...starterSetup.profile,
  body: { ...starterSetup.profile.body, massKg: 10, yawInertiaKgM2: 10 },
  power: {
    ...starterSetup.profile.power,
    capacityJ: 1e6,
    reactorOutputW: 1000,
    thermal: {
      ...starterSetup.profile.power.thermal,
      wasteHeatFraction: 0,
      manualStartSeconds: 0,
    },
  },
  engine: {
    ...starterSetup.profile.engine,
    maxThrustN: 100,
    maxYawTorqueNm: 20,
    baselineW: 2,
    fullThrustW: 20,
    fullYawW: 10,
    restartEnergyJ: 0,
    thermal: {
      heatCapacityJPerK: 1000,
      wasteHeatFraction: 0.1,
      tripTemperatureK: 350,
      restartTemperatureK: 330,
      manualStartSeconds: 0,
      rebootSeconds: 3,
    },
  },
  dampers: {
    ...starterSetup.profile.dampers,
    baselineW: 1,
    wattsPerNewton: 0.1,
    wattsPerNewtonMeter: 0.1,
    restartEnergyJ: 0,
    thermal: { ...starterSetup.profile.dampers.thermal, manualStartSeconds: 0 },
  },
  cooling: { ...starterSetup.profile.cooling, restartEnergyJ: 0 },
  shields: { ...starterSetup.profile.shields, restartEnergyJ: 0 },
};
function make(
  equipment = profile,
  initialHealth = 100,
  temperatureK = 293.15,
  energyJ = 10000,
) {
  return new Ship(equipment, {
    ...starterSetup.initialState,
    energyJ,
    engineHealthPoints: initialHealth,
    engineTemperatureK: temperatureK,
  });
}
function step(ship: Ship, count = 1, dt = 1) {
  for (let i = 0; i < count; i++)
    ship.fixedUpdate(dt, {
      dt,
      tick: ship.telemetry.tick + 1,
      time: ship.telemetry.timeSeconds + dt,
    });
}
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

void test('Module health commits ordered commands, clamps damage/repair, exposes immutable snapshots and configured output curve', () => {
  const health = new ModuleHealth({ maxPoints: 100, outputExponent: 2 }, 100);
  const before = health.telemetry;
  health.damage(200);
  health.repair(25);
  close(health.telemetry.points, 100);
  health.commit();
  close(health.telemetry.points, 25);
  close(health.telemetry.outputFraction, 0.0625);
  close(before.points, 100);
  assert.ok(Object.isFrozen(health.telemetry));
  health.repair(200);
  health.damage(50);
  health.commit();
  close(health.telemetry.points, 50);
  for (const value of [-1, NaN, Infinity]) {
    assert.throws(() => health.damage(value));
    assert.throws(() => health.repair(value));
  }
  health.commit();
  close(health.telemetry.points, 50);
  assert.throws(() => new ModuleHealth({ maxPoints: 0, outputExponent: 1 }, 0));
  assert.throws(
    () => new ModuleHealth({ maxPoints: 100, outputExponent: 0 }, 100),
  );
  assert.throws(
    () => new ModuleHealth({ maxPoints: 100, outputExponent: 1 }, 101),
  );
});
void test('Damaged engine scales thrust and torque once while keeping its nominal electrical demand and accounting', () => {
  const ship = make();
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  ship.control.turn(1);
  const before = ship.telemetry;
  ship.engine.damage(50);
  assert.equal(ship.telemetry, before);
  step(ship);
  const t = ship.telemetry;
  close(t.engine.health.points, 50);
  close(t.engine.activityFraction, 0.5);
  close(t.engine.powerFraction, 1);
  close(t.worldForceN.z, 50);
  close(t.engine.yawTorqueNm, 10);
  close(t.body.velocityMps.z, 5);
  close(t.body.yawRateRadps, 1);
  close(t.engine.demandW, 32);
  close(t.engine.suppliedW, 32);
  close(t.engine.thermal.generatedHeatW, 3.2);
  close(t.power.energyJ, 10000 + 1000 - 32);
  assert.equal(t.engine.state, 'damaged');
  ship.dispose();
});
void test('Power and condition limits multiply independently, including nonlinear condition profiles', () => {
  const ship = make(
    {
      ...profile,
      power: { ...profile.power, reactorOutputW: 0 },
      engine: {
        ...profile.engine,
        health: { maxPoints: 100, outputExponent: 2 },
      },
    },
    50,
    293.15,
    12,
  );
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  step(ship);
  close(ship.telemetry.engine.powerFraction, 0.5);
  close(ship.telemetry.engine.health.outputFraction, 0.25);
  close(ship.telemetry.worldForceN.z, 12.5);
  close(ship.telemetry.engine.activityFraction, 0.125);
  close(ship.telemetry.power.energyJ, 0);
  ship.dispose();
});
void test('Failure removes power demand and force without erasing momentum; toggles cannot repair a failed engine', () => {
  const ship = make();
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  step(ship);
  const velocity = ship.telemetry.body.velocityMps;
  ship.engine.damage(100);
  step(ship);
  assert.equal(ship.telemetry.engine.state, 'failed');
  assert.equal(ship.telemetry.engine.requested, true);
  close(ship.telemetry.engine.demandW, 0);
  close(ship.telemetry.engine.suppliedW, 0);
  close(ship.telemetry.engine.thermal.generatedHeatW, 0);
  close(ship.telemetry.worldForceN.z, 0);
  assert.deepEqual(ship.telemetry.body.velocityMps, velocity);
  ship.engine.requestEnabled(false);
  ship.engine.requestEnabled(true);
  step(ship);
  assert.equal(ship.telemetry.engine.state, 'failed');
  ship.dispose();
});
void test('Repairing failure preserves requested switch and goes through powered manual start; it does not clear a thermal trip', () => {
  const ship = make(
    {
      ...profile,
      engine: {
        ...profile.engine,
        thermal: { ...profile.engine.thermal, manualStartSeconds: 1 },
      },
    },
    0,
  );
  ship.engine.repair(25);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  step(ship, 1, 0.5);
  assert.equal(ship.telemetry.engine.state, 'restarting');
  close(ship.telemetry.worldForceN.z, 0);
  close(ship.telemetry.engine.health.points, 25);
  step(ship, 1, 0.5);
  step(ship, 1, 0.5);
  close(ship.telemetry.engine.activityFraction, 0.25);
  assert.equal(ship.telemetry.engine.requested, true);
  ship.dispose();
  const hot = make(profile, 0, 351);
  hot.engine.repair(100);
  step(hot);
  assert.equal(hot.telemetry.engine.state, 'overheated');
  assert.equal(hot.telemetry.engine.thermal.tripped, true);
  close(hot.telemetry.engine.thermal.restartRemainingSeconds, 3);
  close(hot.telemetry.worldForceN.z, 0);
  hot.dispose();
});
void test('Assisted flight respects damaged engine authority without double scaling; failed engines cannot receive damper propulsion', () => {
  const ship = make(profile, 50);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  ship.dampers.requestEnabled(true);
  step(ship);
  close(ship.telemetry.body.velocityMps.z, 300 * (1 - Math.exp(-1)) * 0.5);
  ship.engine.damage(100);
  step(ship);
  assert.equal(ship.telemetry.engine.state, 'failed');
  assert.ok(ship.telemetry.worldForceN.z < 0); // powered dampers can brake existing drift
  const stopped = make(profile, 0);
  stopped.control.thrust({ x: 0, y: 0, z: 1 });
  stopped.dampers.requestEnabled(true);
  step(stopped);
  close(stopped.telemetry.worldForceN.z, 0);
  close(stopped.telemetry.body.velocityMps.z, 0);
  stopped.dispose();
  ship.dispose();
});
void test('Health is independent between ships and disposed engines reject new damage/repair commands', () => {
  const first = make(),
    second = make();
  first.engine.damage(75);
  step(first);
  step(second);
  close(first.telemetry.engine.health.points, 25);
  close(second.telemetry.engine.health.points, 100);
  first.engine.repair(100);
  first.dispose();
  step(first);
  close(first.telemetry.engine.health.points, 25);
  assert.throws(() => first.engine.damage(1), /attached/);
  assert.throws(() => first.engine.repair(1), /attached/);
  second.dispose();
  assert.throws(() => make(profile, 101), /engineHealthPoints/);
});
