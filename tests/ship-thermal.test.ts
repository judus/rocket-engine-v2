import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship } from '../games/ship/Ship.js';
import type { ShipProfile } from '../games/ship/ShipProfiles.js';
import {
  validateCoolingProfile,
  validateEngineThermalProfile,
} from '../games/ship/ShipProfiles.js';
import { starterSetup } from './helpers/shipSetup.js';

const close = (a: number, b: number, tolerance = 1e-8) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const profile: ShipProfile = {
  ...starterSetup.profile,
  body: { ...starterSetup.profile.body, massKg: 2, yawInertiaKgM2: 2 },
  power: {
    ...starterSetup.profile.power,
    capacityJ: 1e6,
    reactorOutputW: 1000,
  },
  engine: {
    ...starterSetup.profile.engine,
    maxThrustN: 20,
    maxYawTorqueNm: 4,
    baselineW: 10,
    fullThrustW: 100,
    fullYawW: 20,
    restartEnergyJ: 10,
    thermal: {
      heatCapacityJPerK: 10,
      wasteHeatFraction: 0.5,
      tripTemperatureK: 310,
      restartTemperatureK: 300,
      manualStartSeconds: 1,
      rebootSeconds: 3,
    },
  },
  dampers: { ...starterSetup.profile.dampers, restartEnergyJ: 10 },
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
  temperature = 293.15,
  equipment = profile,
  energyJ = 10000,
): Ship {
  return new Ship(equipment, {
    engineTemperatureK: temperature,
    energyJ,
    velocityMps: { x: 0, y: 0, z: 0 },
  });
}
function step(ship: Ship, dt = 1): void {
  ship.fixedUpdate(dt, {
    dt,
    tick: ship.telemetry.tick + 1,
    time: ship.telemetry.timeSeconds + dt,
  });
}
void test('Engine heat is based on supplied energy including baseline losses, not requested thrust', () => {
  const ship = make(
    293.15,
    { ...profile, power: { ...profile.power, reactorOutputW: 0 } },
    20,
  );
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  step(ship);
  close(ship.telemetry.engine.suppliedW, 20);
  close(ship.telemetry.engine.activityFraction, 0.1);
  close(ship.telemetry.engine.thermal.generatedHeatW, 10);
  close(ship.telemetry.engine.thermal.temperatureK, 294.15);
  step(ship);
  close(ship.telemetry.engine.thermal.generatedHeatW, 0);
  close(ship.telemetry.engine.thermal.temperatureK, 294.15);
  ship.dispose();
});
void test('Engine temperature and the single electrical ledger conserve generated and removed energy', () => {
  const ship = make(300);
  ship.cooling.requestEnabled(true);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  step(ship, 0.5);
  const t = ship.telemetry;
  close(t.engine.thermal.generatedHeatW, 55);
  close(t.cooling.removedHeatW, 10);
  close(t.engine.thermal.removedHeatW, 10);
  close(t.engine.thermal.temperatureK, 302.25);
  close((t.engine.thermal.temperatureK - 300) * 10, (55 - 10) * 0.5);
  close(
    t.power.consumptionW,
    t.engine.suppliedW + t.dampers.suppliedW + t.cooling.suppliedW,
  );
  close(t.power.energyJ, 10000 + (1000 - 113) * 0.5);
  assert.ok(Object.isFrozen(t.engine.thermal));
  ship.dispose();
});
void test('Thermal trip latches at the step boundary, removes subsequent thrust and preserves momentum and requested state', () => {
  const ship = make(309);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  step(ship);
  assert.equal(ship.telemetry.engine.state, 'overheated');
  assert.equal(ship.telemetry.engine.thermal.tripped, true);
  close(ship.telemetry.engine.thermal.temperatureK, 314.5);
  close(ship.telemetry.worldForceN.z, 20); // energy/force delivered during the completed interval
  const velocity = ship.telemetry.body.velocityMps;
  step(ship);
  close(ship.telemetry.engine.demandW, 0);
  close(ship.telemetry.worldForceN.z, 0);
  assert.deepEqual(ship.telemetry.body.velocityMps, velocity);
  assert.equal(ship.telemetry.engine.requested, true);
  close(ship.telemetry.engine.thermal.restartRemainingSeconds, 3);
  ship.engine.requestEnabled(false);
  ship.engine.requestEnabled(true);
  step(ship);
  assert.equal(ship.telemetry.engine.thermal.tripped, true);
  close(ship.telemetry.engine.thermal.restartRemainingSeconds, 3);
  ship.dispose();
});
void test('Cooling to the lower threshold precedes a powered reboot; switching cannot bypass the latched delay', () => {
  const ship = make(315);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  ship.cooling.requestEnabled(true);
  for (let i = 0; i < 15; i++) {
    step(ship);
    close(ship.telemetry.worldForceN.z, 0);
  }
  close(ship.telemetry.engine.thermal.temperatureK, 300);
  close(ship.telemetry.engine.thermal.restartRemainingSeconds, 3);
  step(ship);
  close(ship.telemetry.engine.thermal.restartRemainingSeconds, 2);
  ship.engine.requestEnabled(false);
  step(ship);
  close(ship.telemetry.engine.thermal.restartRemainingSeconds, 2);
  ship.engine.requestEnabled(true);
  step(ship);
  close(ship.telemetry.engine.thermal.restartRemainingSeconds, 1);
  step(ship);
  assert.equal(ship.telemetry.engine.thermal.tripped, false);
  close(ship.telemetry.worldForceN.z, 0);
  step(ship);
  close(ship.telemetry.worldForceN.z, 20);
  assert.equal(ship.telemetry.engine.requested, true);
  ship.dispose();
});
void test('Manual start is shorter than a trip reboot, and restart progress depends on actual baseline supply', () => {
  const manual = make();
  manual.control.thrust({ x: 0, y: 0, z: 1 });
  manual.engine.requestEnabled(false);
  manual.engine.requestEnabled(true);
  step(manual);
  close(manual.telemetry.worldForceN.z, 0);
  close(manual.telemetry.engine.thermal.restartRemainingSeconds, 0);
  close(manual.telemetry.engine.suppliedW, 10);
  step(manual);
  close(manual.telemetry.worldForceN.z, 20);
  const reboot = make(
    315,
    { ...profile, power: { ...profile.power, reactorOutputW: 0 } },
    5,
  );
  // Cool through the module-owned transfer interface; no temperature overwrite.
  reboot.engine.removeHeat(160, 290);
  step(reboot);
  close(reboot.telemetry.engine.suppliedW, 5);
  close(reboot.telemetry.engine.thermal.restartRemainingSeconds, 2.5);
  step(reboot);
  close(reboot.telemetry.engine.thermal.restartRemainingSeconds, 2.5);
  assert.equal(reboot.telemetry.engine.thermal.tripped, true);
  manual.dispose();
  reboot.dispose();
});
void test('Partial and zero cooling supply reduce heat removal; cooling never crosses its sink temperature', () => {
  const limited = make(
    300,
    { ...profile, power: { ...profile.power, reactorOutputW: 0 } },
    1.5,
  );
  limited.engine.requestEnabled(false);
  limited.cooling.requestEnabled(true);
  step(limited);
  close(limited.telemetry.cooling.activityFraction, 0.25);
  close(limited.telemetry.cooling.removedHeatW, 2.5);
  close(limited.telemetry.engine.thermal.temperatureK, 299.75);
  step(limited);
  close(limited.telemetry.cooling.removedHeatW, 0);
  close(limited.telemetry.engine.thermal.temperatureK, 299.75);
  assert.equal(limited.telemetry.cooling.requested, true);
  const floor = make(290.5);
  floor.engine.requestEnabled(false);
  floor.cooling.requestEnabled(true);
  step(floor);
  close(floor.telemetry.cooling.removedHeatW, 5);
  close(floor.telemetry.engine.thermal.temperatureK, 290);
  step(floor);
  close(floor.telemetry.cooling.demandW, 1);
  close(floor.telemetry.cooling.removedHeatW, 0);
  limited.dispose();
  floor.dispose();
});
void test('Cooling cannot hide a trip threshold crossed during the same interval', () => {
  const ship = make(309, {
    ...profile,
    cooling: { ...profile.cooling, maxCoolingW: 1000 },
  });
  ship.cooling.requestEnabled(true);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  step(ship);
  close(ship.telemetry.engine.thermal.temperatureK, 290);
  assert.equal(ship.telemetry.engine.thermal.tripped, true);
  close(ship.telemetry.engine.thermal.restartRemainingSeconds, 3);
  step(ship);
  close(ship.telemetry.worldForceN.z, 0);
  ship.dispose();
});
void test('Overheated engine cannot obtain propulsion through assisted dampers', () => {
  const ship = make(315);
  ship.dampers.requestEnabled(true);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  step(ship);
  close(ship.telemetry.body.velocityMps.z, 0);
  close(ship.telemetry.worldForceN.z, 0);
  ship.dispose();
});
void test('Thermal and cooling JSON contracts reject invalid ratios, thresholds, delays and initial temperatures', () => {
  const thermal = profile.engine.thermal;
  for (const fields of [
    { wasteHeatFraction: 2 },
    { heatCapacityJPerK: 0 },
    { restartTemperatureK: 311 },
    { rebootSeconds: 1 },
    { manualStartSeconds: '1' },
  ])
    assert.throws(() =>
      validateEngineThermalProfile({ ...thermal, ...fields }),
    );
  assert.throws(() =>
    validateCoolingProfile({ ...profile.cooling, maxCoolingW: -1 }),
  );
  assert.throws(() => make(-1));
  assert.throws(() =>
    make(300, {
      ...profile,
      cooling: { ...profile.cooling, restartEnergyJ: 1e7 },
    }),
  );
  const ship = make();
  assert.throws(() =>
    ship.cooling.requestEnabled('true' as unknown as boolean),
  );
  assert.throws(() => ship.engine.removeHeat(-1, 290));
  assert.throws(() => ship.engine.removeHeat(1, NaN));
  ship.dispose();
});

void test('Cooling and temperature remain independent across ships and stop with their owning attachment lifetime', () => {
  const first = make(300),
    second = make(300);
  first.engine.requestEnabled(false);
  second.engine.requestEnabled(false);
  first.cooling.requestEnabled(true);
  step(first);
  step(second);
  close(first.telemetry.engine.thermal.temperatureK, 299);
  close(second.telemetry.engine.thermal.temperatureK, 300);
  const final = first.telemetry;
  first.dispose();
  first.dispose();
  step(first);
  assert.equal(first.telemetry, final);
  second.cooling.requestEnabled(true);
  step(second);
  close(second.telemetry.engine.thermal.temperatureK, 299);
  close(profile.engine.thermal.tripTemperatureK, 310);
  second.dispose();
});
