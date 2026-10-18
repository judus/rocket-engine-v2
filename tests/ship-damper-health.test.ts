import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship } from '../games/ship/Ship.js';
import { CapturePlan } from '../games/ship/CaptureResponse.js';
import { validateDamperProfile } from '../games/ship/ShipProfiles.js';
import type { ShipProfile } from '../games/ship/ShipProfiles.js';
import { starterSetup } from './helpers/shipSetup.js';

const profile: ShipProfile = {
  ...starterSetup.profile,
  body: { ...starterSetup.profile.body, massKg: 2, yawInertiaKgM2: 2 },
  power: {
    ...starterSetup.profile.power,
    reactorOutputW: 1e9,
    thermal: {
      ...starterSetup.profile.power.thermal,
      manualStartSeconds: 0,
      wasteHeatFraction: 0,
    },
  },
  engine: {
    ...starterSetup.profile.engine,
    maxThrustN: 20,
    maxYawTorqueNm: 4,
    baselineW: 1,
    fullThrustW: 100,
    fullYawW: 20,
    thermal: {
      ...starterSetup.profile.engine.thermal,
      manualStartSeconds: 0,
      wasteHeatFraction: 0,
    },
  },
  dampers: {
    ...starterSetup.profile.dampers,
    baselineW: 1,
    wattsPerNewton: 0.1,
    wattsPerNewtonMeter: 0.1,
    thermal: {
      ...starterSetup.profile.dampers.thermal,
      manualStartSeconds: 0,
      wasteHeatFraction: 0,
    },
  },
};
function make(
  health = 100,
  speed = 100,
  equipment = profile,
  energyJ = 1e6,
  temperatureK = 290,
) {
  const ship = new Ship(equipment, {
    ...starterSetup.initialState,
    damperHealthPoints: health,
    damperTemperatureK: temperatureK,
    energyJ,
    velocityMps: { x: 0, y: 0, z: speed },
  });
  ship.engine.requestEnabled(false);
  ship.dampers.requestEnabled(true);
  return ship;
}
function step(ship: Ship, dt = 1) {
  ship.fixedUpdate(dt, {
    dt,
    tick: ship.telemetry.tick + 1,
    time: ship.telemetry.timeSeconds + dt,
  });
}
const close = (a: number, b: number, tolerance = 1e-7) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

void test('Damper condition scales braking and crew protection independently of electrical supply', () => {
  const full = make(),
    damaged = make(50);
  for (const ship of [full, damaged]) step(ship);
  const a = full.telemetry,
    b = damaged.telemetry;
  close(b.dampers.powerFraction, 1);
  close(b.dampers.activityFraction, 0.5);
  close(b.dampers.worldForceN.z, a.dampers.worldForceN.z * 0.5);
  close(b.dampers.demandW, a.dampers.demandW);
  close(b.dampers.transmittedFraction, 0.505);
  close(b.crewG, b.shipG * 0.505);
  assert.equal(b.dampers.state, 'damaged');
  assert.ok(Object.isFrozen(b.dampers.health));
  full.dispose();
  damaged.dispose();
});
void test('Damper damage and limited supply multiply once, including yaw assistance', () => {
  const limitedProfile = {
    ...profile,
    power: { ...profile.power, reactorOutputW: 0 },
  };
  const ship = make(50, 0, limitedProfile, 30);
  ship.engine.requestEnabled(true);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  ship.control.turn(1);
  step(ship);
  const t = ship.telemetry;
  assert.ok(t.dampers.powerFraction > 0 && t.dampers.powerFraction < 1);
  close(t.dampers.activityFraction, t.dampers.powerFraction * 0.5);
  const gain = -Math.expm1(-3 / profile.dampers.responseSeconds);
  const nominalTorque = 2 * profile.dampers.maxYawRateRadps * gain - 4;
  close(
    t.dampers.yawTorqueNm,
    nominalTorque * t.engine.activityFraction * t.dampers.activityFraction,
  );
  close(t.dampers.transmittedFraction, 1 - 0.99 * t.dampers.activityFraction);
  assert.equal(t.dampers.state, 'limited');
  ship.dispose();
});
void test('Failure commits at a step boundary, preserves momentum and other module health, and leaves engine thrust available', () => {
  const ship = make();
  step(ship);
  const before = ship.telemetry;
  ship.dampers.damage(100);
  assert.equal(ship.telemetry, before);
  step(ship);
  const t = ship.telemetry;
  assert.equal(t.dampers.state, 'failed');
  assert.equal(t.dampers.requested, true);
  assert.equal(t.dampers.demandW, 0);
  assert.equal(t.dampers.suppliedW, 0);
  assert.equal(t.dampers.transmittedFraction, 1);
  assert.deepEqual(t.body.velocityMps, before.body.velocityMps);
  assert.equal(t.engine.health.points, 100);
  assert.equal(t.power.health.points, 100);
  assert.equal(t.cooling.health.points, 100);
  ship.engine.requestEnabled(true);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  step(ship);
  close(ship.telemetry.body.velocityMps.z - t.body.velocityMps.z, 10);
  close(ship.telemetry.crewG, ship.telemetry.shipG);
  ship.dispose();
});
void test('Repair restarts with remembered switch, replans interrupted capture from actual velocity, and off stays off', () => {
  const equipment = {
    ...profile,
    dampers: {
      ...profile.dampers,
      thermal: { ...profile.dampers.thermal, manualStartSeconds: 1 },
    },
  };
  const ship = make(100, 12300, equipment);
  step(ship); // manual startup
  step(ship);
  ship.dampers.damage(100);
  step(ship);
  const speed = ship.telemetry.body.velocityMps.z;
  ship.dampers.repair(100);
  step(ship, 0.5);
  assert.equal(ship.telemetry.dampers.state, 'restarting');
  close(ship.telemetry.body.velocityMps.z, speed);
  step(ship, 0.5);
  step(ship, 0.5);
  const plan = new CapturePlan(equipment.dampers.capture, speed);
  close(ship.telemetry.dampers.captureElapsedSeconds, 0.5);
  close(ship.telemetry.body.velocityMps.z, plan.at(0.5).speedMps);
  ship.dampers.requestEnabled(false);
  ship.dampers.damage(100);
  step(ship);
  ship.dampers.repair(25);
  step(ship);
  assert.equal(ship.telemetry.dampers.state, 'off');
  assert.equal(ship.telemetry.dampers.demandW, 0);
  ship.dispose();
});
void test('Health repair cannot erase a thermal trip or advance its reboot while failed', () => {
  const thermal = { ...profile.dampers.thermal, rebootSeconds: 3 };
  const ship = make(
    0,
    100,
    { ...profile, dampers: { ...profile.dampers, thermal } },
    1e6,
    thermal.tripTemperatureK,
  );
  step(ship);
  close(ship.telemetry.dampers.thermal.restartRemainingSeconds, 3);
  ship.dampers.removeHeat(1e20, 290);
  step(ship);
  close(ship.telemetry.dampers.thermal.restartRemainingSeconds, 3);
  ship.dampers.repair(100);
  step(ship);
  assert.equal(ship.telemetry.dampers.state, 'restarting');
  close(ship.telemetry.dampers.thermal.restartRemainingSeconds, 2);
  close(ship.telemetry.body.velocityMps.z, 100);
  step(ship);
  step(ship);
  step(ship);
  assert.ok(ship.telemetry.body.velocityMps.z < 100);
  ship.dispose();
});
void test('Damper health validates profiles, initial condition and commands, uses the configured curve and rejects disposed mutations', () => {
  assert.throws(() =>
    validateDamperProfile({
      ...profile.dampers,
      health: { maxPoints: 100, outputExponent: 0 },
    }),
  );
  assert.throws(() => make(101), /damperHealthPoints/);
  const ship = make(50, 100, {
    ...profile,
    dampers: {
      ...profile.dampers,
      health: { maxPoints: 100, outputExponent: 2 },
    },
  });
  assert.throws(() => ship.dampers.damage(-1));
  assert.throws(() => ship.dampers.repair(NaN));
  step(ship);
  close(ship.telemetry.dampers.activityFraction, 0.25);
  ship.dispose();
  assert.throws(() => ship.dampers.damage(1), /not attached/);
  assert.throws(() => ship.dampers.repair(1), /not attached/);
});
