import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship } from '../games/ship/Ship.js';
import type { ShipProfile } from '../games/ship/ShipProfiles.js';
import { validatePowerProfile } from '../games/ship/ShipProfiles.js';
import { starterSetup } from './helpers/shipSetup.js';

const close = (a: number, b: number, tolerance = 1e-8) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const quietThermal = {
  heatCapacityJPerK: 10,
  wasteHeatFraction: 0,
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
    id: 'recovery-test',
    capacityJ: 1000,
    reactorOutputW: 500,
    thermal: {
      ...quietThermal,
      wasteHeatFraction: 0.05,
      manualStartSeconds: 1,
    },
    recovery: {
      startupPowerW: 10,
      emergencyStartSeconds: 6,
      emergencyOutputFraction: 0.2,
      restoreReserveFraction: 0.1,
      passiveCoolingW: 10,
      sinkTemperatureK: 290,
    },
  },
  engine: {
    ...starterSetup.profile.engine,
    baselineW: 1,
    fullThrustW: 1000,
    fullYawW: 20,
    maxThrustN: 20,
    maxYawTorqueNm: 4,
    restartEnergyJ: 10,
    thermal: quietThermal,
  },
  dampers: {
    ...starterSetup.profile.dampers,
    baselineW: 1,
    wattsPerNewton: 0.1,
    wattsPerNewtonMeter: 0.1,
    restartEnergyJ: 10,
    thermal: quietThermal,
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
function make(energyJ = 0, temperatureK = 315, equipment = profile): Ship {
  return new Ship(equipment, {
    energyJ,
    reactorTemperatureK: temperatureK,
    engineTemperatureK: 290,
    damperTemperatureK: 290,
    velocityMps: { x: 0, y: 0, z: 100 },
  });
}
function step(ship: Ship, dt = 1): void {
  ship.fixedUpdate(dt, {
    dt,
    tick: ship.telemetry.tick + 1,
    time: ship.telemetry.timeSeconds + dt,
  });
}
function quiet(ship: Ship): void {
  ship.engine.requestEnabled(false);
  ship.dampers.requestEnabled(false);
}
void test('Hot reactor with zero reserve cools passively, preserves the full emergency delay, and generates no free reserve', () => {
  const ship = make();
  ship.cooling.requestEnabled(true);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  ship.dampers.requestEnabled(true);
  for (let i = 1; i <= 15; i++) {
    step(ship);
    close(ship.telemetry.power.thermal.temperatureK, 315 - i);
    close(ship.telemetry.power.thermal.restartRemainingSeconds, 6);
    close(ship.telemetry.power.energyJ, 0);
    close(ship.telemetry.power.generationW, 0);
    close(ship.telemetry.power.startupSuppliedW, 0);
    close(ship.telemetry.power.consumptionW, 0);
    close(ship.telemetry.worldForceN.z, 0);
    close(ship.telemetry.body.velocityMps.z, 100);
    assert.equal(ship.telemetry.power.nonessentialAllowed, false);
  }
  for (let i = 1; i <= 6; i++) {
    step(ship);
    close(ship.telemetry.power.thermal.restartRemainingSeconds, 6 - i);
    close(ship.telemetry.power.energyJ, 0);
  }
  assert.equal(ship.telemetry.power.thermal.tripped, false);
  ship.dispose();
});
void test('Emergency output powers utility cooling and charges before propulsion can reclaim any supply', () => {
  const ship = make();
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  ship.dampers.requestEnabled(true);
  ship.cooling.requestEnabled(true);
  for (let i = 0; i < 21; i++) step(ship);
  step(ship);
  close(ship.telemetry.power.generationW, 100);
  close(ship.telemetry.cooling.suppliedW, 3);
  close(ship.telemetry.power.energyJ, 97);
  close(ship.telemetry.engine.suppliedW, 0);
  close(ship.telemetry.dampers.suppliedW, 0);
  assert.equal(ship.telemetry.power.state, 'recovering');
  assert.equal(ship.telemetry.power.nonessentialAllowed, false);
  close(ship.telemetry.body.velocityMps.z, 100);
  step(ship);
  assert.equal(ship.telemetry.power.emergency, false);
  close(ship.telemetry.power.generationW, 100); // completed interval used reduced output
  close(ship.telemetry.worldForceN.z, 0);
  step(ship);
  close(ship.telemetry.power.generationW, 500);
  assert.ok(ship.telemetry.engine.suppliedW > 0);
  assert.ok(ship.telemetry.dampers.suppliedW > 0);
  assert.equal(ship.telemetry.engine.requested, true);
  assert.equal(ship.telemetry.dampers.requested, true);
  ship.dispose();
});
void test('A nonzero reserve that funds reboot recovers sooner than zero; depletion upgrades a normal reboot to emergency', () => {
  const equipment = {
    ...profile,
    power: {
      ...profile.power,
      recovery: { ...profile.power.recovery, startupPowerW: 0.1 },
    },
  };
  const warm = make(1, 315, equipment),
    empty = make(0, 315, equipment);
  quiet(warm);
  quiet(empty);
  let warmFirst = 0,
    emptyFirst = 0;
  for (let i = 1; i <= 30; i++) {
    if (!warmFirst) {
      step(warm);
      assert.equal(warm.telemetry.power.emergency, false);
      if (warm.telemetry.power.generationW > 0) warmFirst = i;
    }
    if (!emptyFirst) {
      step(empty);
      if (empty.telemetry.power.generationW > 0) emptyFirst = i;
    }
  }
  assert.ok(warmFirst > 0 && warmFirst < emptyFirst);
  const depleted = make(0.1);
  quiet(depleted);
  while (depleted.telemetry.power.thermal.temperatureK > 300) step(depleted);
  step(depleted);
  close(depleted.telemetry.power.energyJ, 0);
  assert.equal(depleted.telemetry.power.emergency, false);
  step(depleted);
  assert.equal(depleted.telemetry.power.emergency, true);
  assert.ok(depleted.telemetry.power.thermal.restartRemainingSeconds >= 5);
  warm.dispose();
  empty.dispose();
  depleted.dispose();
});
void test('Manual toggles pause emergency startup without replacing its delay with the short manual start', () => {
  const ship = make(0, 315);
  quiet(ship);
  for (let i = 0; i < 17; i++) step(ship);
  close(ship.telemetry.power.thermal.restartRemainingSeconds, 4);
  ship.power.requestEnabled(false);
  for (let i = 0; i < 2; i++) step(ship);
  close(ship.telemetry.power.thermal.restartRemainingSeconds, 4);
  close(ship.telemetry.power.generationW, 0);
  ship.power.requestEnabled(true);
  step(ship);
  close(ship.telemetry.power.thermal.restartRemainingSeconds, 3);
  assert.equal(ship.telemetry.power.emergency, true);
  ship.dispose();
});
void test('Normal reactor heat can trip even while active cooling lowers the completed-step temperature', () => {
  const ship = make(100, 309);
  quiet(ship);
  ship.cooling.requestEnabled(true);
  step(ship);
  const t = ship.telemetry;
  close(t.power.generationW, 500);
  close(t.power.thermal.generatedHeatW, 25);
  close(t.power.passiveRemovedHeatW, 10);
  close(t.cooling.reactorRemovedHeatW, 10);
  close(t.power.thermal.temperatureK, 309.5);
  assert.equal(t.power.thermal.tripped, true);
  close(
    (t.power.thermal.temperatureK - 309) * 10,
    t.power.thermal.generatedHeatW -
      t.power.passiveRemovedHeatW -
      t.cooling.reactorRemovedHeatW,
  );
  step(ship);
  close(ship.telemetry.power.generationW, 0);
  assert.equal(ship.telemetry.power.requested, true);
  assert.equal(ship.telemetry.power.emergency, false);
  ship.dispose();
});
void test('Normal startup costs reserve energy; disposal stops recovery with no cross-ship state', () => {
  const first = make(100, 293),
    second = make(100, 293);
  quiet(first);
  quiet(second);
  first.power.requestEnabled(false);
  first.power.requestEnabled(true);
  step(first);
  close(first.telemetry.power.startupSuppliedW, 10);
  close(first.telemetry.power.generationW, 0);
  close(first.telemetry.power.energyJ, 90);
  close(first.telemetry.power.consumptionW, 10);
  close(second.telemetry.power.energyJ, 100);
  const last = first.telemetry;
  first.dispose();
  first.dispose();
  step(first);
  assert.equal(first.telemetry, last);
  step(second);
  close(second.telemetry.power.generationW, 500);
  second.dispose();
});
void test('Recovery contracts reject unsafe fractions, missing passive cooling and thermally unsustainable emergency output', () => {
  const p = profile.power;
  for (const recovery of [
    { ...p.recovery, emergencyStartSeconds: 3 },
    { ...p.recovery, restoreReserveFraction: 1 },
    { ...p.recovery, emergencyOutputFraction: 1 },
    { ...p.recovery, passiveCoolingW: 0 },
    { ...p.recovery, sinkTemperatureK: 300 },
    { ...p.recovery, emergencyOutputFraction: 0.9 },
  ])
    assert.throws(() => validatePowerProfile({ ...p, recovery }));
  const ship = make();
  assert.throws(() => ship.power.connect(1, 'other' as 'utility'));
  ship.dispose();
});
void test('Actual JSON ship recovers from hot and empty while held propulsion requests cannot prevent recharge', () => {
  const ship = new Ship(starterSetup.profile, {
    ...starterSetup.initialState,
    energyJ: 0,
    reactorTemperatureK: 455,
    velocityMps: { x: 0, y: 0, z: 1000 },
  });
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  ship.dampers.requestEnabled(true);
  ship.cooling.requestEnabled(true);
  let firstGeneration = 0,
    steps = 0;
  while (ship.telemetry.power.emergency) {
    const previous = ship.telemetry;
    step(ship, 1 / 60);
    const t = ship.telemetry;
    close(t.worldForceN.z, 0);
    close(t.body.velocityMps.z, 1000);
    close(
      t.power.consumptionW,
      t.engine.suppliedW +
        t.dampers.suppliedW +
        t.cooling.suppliedW +
        t.power.startupSuppliedW,
    );
    close(
      t.power.energyJ - previous.power.energyJ,
      (t.power.generationW - t.power.consumptionW - t.power.spillW) / 60,
      0.001,
    );
    if (t.power.generationW > 0) {
      if (!firstGeneration) firstGeneration = t.timeSeconds;
      close(t.power.generationW, 1e9);
    }
    if (++steps > 75 * 60) assert.fail('Default loadout did not recover');
  }
  assert.ok(firstGeneration >= 49 && firstGeneration < 49.1);
  assert.ok(ship.telemetry.timeSeconds > 69 && ship.telemetry.timeSeconds < 71);
  assert.ok(ship.telemetry.power.energyJ >= 20e9);
  assert.equal(ship.telemetry.engine.requested, true);
  assert.equal(ship.telemetry.dampers.requested, true);
  ship.dispose();
});
