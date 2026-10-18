import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship } from '../games/ship/Ship.js';
import { CapturePlan } from '../games/ship/CaptureResponse.js';
import type { ShipProfile } from '../games/ship/ShipProfiles.js';
import { starterSetup } from './helpers/shipSetup.js';

const close = (a: number, b: number, tolerance = 1e-8) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const thermal = {
  heatCapacityJPerK: 10,
  wasteHeatFraction: 0.5,
  tripTemperatureK: 310,
  restartTemperatureK: 300,
  manualStartSeconds: 0,
  rebootSeconds: 3,
};
const profile: ShipProfile = {
  ...starterSetup.profile,
  shields: { ...starterSetup.profile.shields, restartEnergyJ: 0 },
  body: { ...starterSetup.profile.body, massKg: 2, yawInertiaKgM2: 2 },
  power: {
    ...starterSetup.profile.power,
    thermal: {
      ...starterSetup.profile.power.thermal,
      manualStartSeconds: 0,
      wasteHeatFraction: 0,
    },
    capacityJ: 1e6,
    reactorOutputW: 1000,
  },
  engine: {
    ...starterSetup.profile.engine,
    baselineW: 10,
    fullThrustW: 100,
    fullYawW: 20,
    maxThrustN: 20,
    maxYawTorqueNm: 4,
    restartEnergyJ: 10,
    thermal: { ...thermal, wasteHeatFraction: 0 },
  },
  dampers: {
    ...starterSetup.profile.dampers,
    baselineW: 10,
    wattsPerNewton: 0.1,
    wattsPerNewtonMeter: 0.1,
    restartEnergyJ: 10,
    thermal,
  },
  cooling: {
    ...starterSetup.profile.cooling,
    sinkTemperatureK: 290,
    maxCoolingW: 10,
    baselineW: 1,
    fullPowerW: 2,
    restartEnergyJ: 0,
  },
};
function make(
  damperTemperatureK = 309,
  speed = 100,
  equipment = profile,
  engineTemperatureK = 290,
  energyJ = 10000,
): Ship {
  return new Ship(equipment, {
    shieldHealthPoints: 100,
    damperHealthPoints: 100,
    coolingHealthPoints: 100,
    reactorHealthPoints: 100,
    engineHealthPoints: 100,
    shieldTemperatureK: 290,
    reactorTemperatureK: 290,
    engineTemperatureK,
    damperTemperatureK,
    energyJ,
    velocityMps: { x: 0, y: 0, z: speed },
  });
}
function step(ship: Ship, dt = 1): void {
  ship.fixedUpdate(dt, {
    dt,
    tick: ship.telemetry.tick + 1,
    time: ship.telemetry.timeSeconds + dt,
  });
}
void test('Damper overheat removes subsequent braking and crew protection without clearing its requested switch', () => {
  const ship = make();
  ship.engine.requestEnabled(false);
  ship.dampers.requestEnabled(true);
  step(ship);
  assert.equal(ship.telemetry.dampers.thermal.tripped, true);
  assert.equal(ship.telemetry.dampers.state, 'overheated');
  const v = ship.telemetry.body.velocityMps.z;
  step(ship);
  close(ship.telemetry.worldForceN.z, 0);
  close(ship.telemetry.body.velocityMps.z, v);
  close(ship.telemetry.dampers.transmittedFraction, 1);
  close(ship.telemetry.dampers.demandW, 0);
  assert.equal(ship.telemetry.dampers.requested, true);
  ship.engine.requestEnabled(true);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  step(ship);
  assert.ok(ship.telemetry.shipG > 0);
  close(ship.telemetry.crewG, ship.telemetry.shipG);
  ship.dispose();
});
void test('Thermal capture interruption coasts, reboots after cooling, and replans from actual remaining velocity', () => {
  const ship = make(309, 12300);
  ship.engine.requestEnabled(false);
  ship.dampers.requestEnabled(true);
  step(ship);
  assert.equal(ship.telemetry.dampers.thermal.tripped, true);
  const v = ship.telemetry.body.velocityMps.z;
  step(ship);
  close(ship.telemetry.body.velocityMps.z, v);
  ship.dampers.requestEnabled(false);
  ship.dampers.requestEnabled(true);
  close(ship.dampers.telemetry.thermal.restartRemainingSeconds, 3);
  ship.cooling.requestEnabled(true);
  let count = 0;
  while (ship.telemetry.dampers.thermal.temperatureK > 300) {
    step(ship);
    if (++count > 30)
      assert.fail('Cooling did not reach the restart threshold');
  }
  close(ship.telemetry.dampers.thermal.restartRemainingSeconds, 3);
  for (let i = 0; i < 3; i++) step(ship);
  assert.equal(ship.telemetry.dampers.thermal.tripped, false);
  assert.equal(ship.telemetry.dampers.state, 'online');
  close(ship.telemetry.body.velocityMps.z, v);
  step(ship);
  assert.equal(ship.telemetry.dampers.mode, 'capture');
  close(
    ship.telemetry.body.velocityMps.z,
    new CapturePlan(profile.dampers.capture, v).at(1).speedMps,
  );
  ship.dispose();
});
void test('The shared cooler removes one heat budget proportionally from both modules', () => {
  const ship = make(310, 0, profile, 300);
  ship.engine.requestEnabled(false);
  ship.cooling.requestEnabled(true);
  step(ship);
  const t = ship.telemetry;
  close(t.cooling.engineRemovedHeatW, 10 / 3);
  close(t.cooling.damperRemovedHeatW, 20 / 3);
  close(t.cooling.removedHeatW, 10);
  close(t.engine.thermal.removedHeatW, t.cooling.engineRemovedHeatW);
  close(t.dampers.thermal.removedHeatW, t.cooling.damperRemovedHeatW);
  close(
    (300 - t.engine.thermal.temperatureK) * 10 +
      (310 - t.dampers.thermal.temperatureK) * 10,
    10,
  );
  close(
    t.power.consumptionW,
    t.engine.suppliedW + t.dampers.suppliedW + t.cooling.suppliedW,
  );
  assert.ok(Object.isFrozen(t.dampers.thermal));
  ship.dispose();
  const floor = make(
    291,
    0,
    { ...profile, cooling: { ...profile.cooling, maxCoolingW: 1000 } },
    292,
  );
  floor.engine.requestEnabled(false);
  floor.cooling.requestEnabled(true);
  step(floor);
  close(floor.telemetry.engine.thermal.temperatureK, 290);
  close(floor.telemetry.dampers.thermal.temperatureK, 290);
  close(floor.telemetry.cooling.removedHeatW, 30);
  floor.dispose();
});
void test('Partial cooler supply reduces the combined budget rather than giving both targets a full allocation', () => {
  const ship = make(
    310,
    0,
    { ...profile, power: { ...profile.power, reactorOutputW: 0 } },
    300,
    1.5,
  );
  ship.engine.requestEnabled(false);
  ship.cooling.requestEnabled(true);
  step(ship);
  close(ship.telemetry.cooling.activityFraction, 0.25);
  close(ship.telemetry.cooling.removedHeatW, 2.5);
  close(ship.telemetry.cooling.engineRemovedHeatW, 2.5 / 3);
  close(ship.telemetry.cooling.damperRemovedHeatW, 5 / 3);
  const before = ship.telemetry;
  step(ship);
  close(ship.telemetry.cooling.removedHeatW, 0);
  close(
    ship.telemetry.dampers.thermal.temperatureK,
    before.dampers.thermal.temperatureK,
  );
  ship.dispose();
});
void test('Damper heat follows delivered electrical energy and cannot be hidden by same-interval cooling', () => {
  const partial = make(
    293.15,
    100,
    { ...profile, power: { ...profile.power, reactorOutputW: 0 } },
    290,
    12,
  );
  partial.engine.requestEnabled(false);
  partial.dampers.requestEnabled(true);
  step(partial);
  close(partial.telemetry.dampers.suppliedW, 12);
  close(partial.telemetry.dampers.thermal.generatedHeatW, 6);
  close(partial.telemetry.dampers.thermal.temperatureK, 293.75);
  partial.dispose();
  const cooled = make(309, 100, {
    ...profile,
    cooling: { ...profile.cooling, maxCoolingW: 1000 },
  });
  cooled.engine.requestEnabled(false);
  cooled.dampers.requestEnabled(true);
  cooled.cooling.requestEnabled(true);
  step(cooled);
  close(cooled.telemetry.dampers.thermal.temperatureK, 290);
  assert.equal(cooled.telemetry.dampers.thermal.tripped, true);
  close(cooled.telemetry.dampers.thermal.restartRemainingSeconds, 3);
  cooled.dispose();
});
