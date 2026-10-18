import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship } from '../games/ship/Ship.js';
import type { ShipProfile } from '../games/ship/ShipProfiles.js';
import { starterSetup } from './helpers/shipSetup.js';

const profile: ShipProfile = {
  ...starterSetup.profile,
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
  engine: { ...starterSetup.profile.engine, restartEnergyJ: 0 },
  dampers: { ...starterSetup.profile.dampers, restartEnergyJ: 0 },
  cooling: {
    ...starterSetup.profile.cooling,
    sinkTemperatureK: 290,
    baselineW: 1,
    fullPowerW: 2,
    maxCoolingW: 10,
    restartEnergyJ: 0,
  },
  shields: {
    id: 'thermal-shield',
    health: starterSetup.profile.shields.health,
    capacityJ: 100,
    baselineW: 2,
    rechargeW: 20,
    rechargeEfficiency: 0.5,
    rechargeDelaySeconds: 2,
    restartEnergyJ: 0,
    diversionW: 20,
    diversionEfficiency: 0.8,
    thermal: {
      heatCapacityJPerK: 10,
      wasteHeatFraction: 0.1,
      tripTemperatureK: 310,
      restartTemperatureK: 300,
      manualStartSeconds: 0,
      rebootSeconds: 3,
    },
  },
};
function make(temperatureK = 290, equipment = profile, energyJ = 10000) {
  const ship = new Ship(equipment, {
    ...starterSetup.initialState,
    energyJ,
    engineTemperatureK: 290,
    reactorTemperatureK: 290,
    damperTemperatureK: 290,
    shieldTemperatureK: temperatureK,
  });
  ship.engine.requestEnabled(false);
  return ship;
}
function step(ship: Ship, count = 1, dt = 1) {
  for (let i = 0; i < count; i++)
    ship.fixedUpdate(dt, {
      dt,
      time: ship.telemetry.timeSeconds + dt,
      tick: ship.telemetry.tick + 1,
    });
}
const close = (a: number, b: number, epsilon = 1e-8) =>
  assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);

void test('Shield heat separates maintenance losses from actual recharge conversion losses without heating stored energy twice', () => {
  const ship = make();
  ship.shields.requestEnabled(true);
  step(ship);
  close(ship.telemetry.shields.energyJ, 10);
  close(ship.telemetry.shields.thermal.generatedHeatW, 10.2);
  close(ship.telemetry.shields.thermal.temperatureK, 291.02);
  step(ship, 9);
  close(ship.telemetry.shields.energyJ, 100);
  step(ship);
  close(ship.telemetry.shields.thermal.generatedHeatW, 0.2);
  close(ship.telemetry.shields.demandW, 2);
  ship.dispose();
});
void test('Partial maintenance supply produces heat only from funded maintenance; zero delivery produces none', () => {
  const ship = make(
    290,
    { ...profile, power: { ...profile.power, reactorOutputW: 0 } },
    1,
  );
  ship.shields.requestEnabled(true);
  step(ship);
  close(ship.telemetry.shields.suppliedW, 1);
  close(ship.telemetry.shields.energyJ, 0);
  close(ship.telemetry.shields.thermal.generatedHeatW, 0.1);
  close(ship.telemetry.shields.thermal.temperatureK, 290.01);
  step(ship);
  close(ship.telemetry.shields.thermal.generatedHeatW, 0);
  close(ship.telemetry.shields.thermal.temperatureK, 290.01);
  ship.dispose();
});
void test('Shield trip retains charge and requested state but removes protection; cooling precedes a powered reboot and toggles cannot skip it', () => {
  const ship = make(309.5, {
    ...profile,
    cooling: { ...profile.cooling, maxCoolingW: 1000 },
  });
  ship.shields.requestEnabled(true);
  step(ship);
  assert.equal(ship.telemetry.shields.state, 'overheated');
  assert.equal(ship.telemetry.shields.active, false);
  close(ship.telemetry.shields.energyJ, 10);
  assert.throws(() => ship.shields.startDiversion(), /cool and reboot/);
  ship.shields.requestEnabled(false);
  ship.shields.requestEnabled(true);
  close(ship.shields.telemetry.thermal.restartRemainingSeconds, 3);
  ship.hull.hit(3);
  step(ship);
  close(ship.telemetry.hull.hullDamageJ, 3);
  close(ship.telemetry.shields.suppliedW, 0);
  close(ship.telemetry.shields.energyJ, 10);
  ship.cooling.requestEnabled(true);
  step(ship);
  assert.equal(ship.telemetry.shields.thermal.tripped, true);
  close(ship.telemetry.shields.thermal.restartRemainingSeconds, 3);
  close(ship.telemetry.shields.thermal.temperatureK, 290);
  step(ship, 2);
  close(ship.telemetry.shields.thermal.restartRemainingSeconds, 1);
  assert.equal(ship.telemetry.shields.active, false);
  step(ship);
  assert.equal(ship.telemetry.shields.thermal.tripped, false);
  assert.equal(ship.telemetry.shields.requested, true);
  step(ship);
  assert.equal(ship.telemetry.shields.active, true);
  ship.dispose();
});
void test('Diversion conversion loss becomes heat, a thermal trip stops the converter and preserves unspent charge', () => {
  const ship = make(309, {
    ...profile,
    shields: {
      ...profile.shields,
      rechargeEfficiency: 1,
      diversionW: 50,
      diversionEfficiency: 0.5,
      thermal: { ...profile.shields.thermal, wasteHeatFraction: 0 },
    },
  });
  ship.shields.requestEnabled(true);
  step(ship, 5);
  close(ship.telemetry.shields.energyJ, 100);
  close(ship.telemetry.shields.thermal.temperatureK, 309);
  ship.shields.startDiversion();
  step(ship);
  close(ship.telemetry.shields.energyJ, 50);
  close(ship.telemetry.power.receivedEnergyJ, 25);
  close(ship.telemetry.shields.thermal.generatedHeatW, 25);
  close(ship.telemetry.shields.thermal.temperatureK, 311.5);
  assert.equal(ship.telemetry.shields.thermal.tripped, true);
  assert.equal(ship.telemetry.shields.diverting, false);
  step(ship);
  close(ship.telemetry.power.receivedEnergyJ, 0);
  close(ship.telemetry.shields.energyJ, 50);
  close(ship.telemetry.shields.thermal.generatedHeatW, 0);
  ship.dispose();
});
void test('Four module cooling shares one budget, reports every transfer and conserves shield thermal energy', () => {
  const ship = new Ship(profile, {
    ...starterSetup.initialState,
    energyJ: 10000,
    engineTemperatureK: 300,
    damperTemperatureK: 300,
    reactorTemperatureK: 300,
    shieldTemperatureK: 300,
  });
  ship.engine.requestEnabled(false);
  ship.cooling.requestEnabled(true);
  const before = ship.telemetry;
  step(ship);
  const t = ship.telemetry,
    c = t.cooling;
  close(c.removedHeatW, 10);
  close(
    c.removedHeatW,
    c.engineRemovedHeatW +
      c.damperRemovedHeatW +
      c.reactorRemovedHeatW +
      c.shieldRemovedHeatW,
  );
  assert.ok(c.shieldRemovedHeatW > 0);
  close(t.shields.thermal.removedHeatW, c.shieldRemovedHeatW);
  close(
    (t.shields.thermal.temperatureK - before.shields.thermal.temperatureK) *
      profile.shields.thermal.heatCapacityJPerK,
    t.shields.thermal.generatedHeatW - c.shieldRemovedHeatW,
  );
  assert.ok(t.shields.thermal.temperatureK >= profile.cooling.sinkTemperatureK);
  ship.dispose();
});
void test('Manual boot is short, advances only with supplied maintenance, and initial/installation boundaries fail early', () => {
  const equipment = {
    ...profile,
    shields: {
      ...profile.shields,
      thermal: { ...profile.shields.thermal, manualStartSeconds: 1 },
    },
  };
  const ship = make(290, equipment);
  ship.shields.requestEnabled(true);
  step(ship, 1, 0.5);
  assert.equal(ship.telemetry.shields.state, 'restarting');
  close(ship.telemetry.shields.energyJ, 0);
  close(ship.telemetry.shields.thermal.restartRemainingSeconds, 0.5);
  ship.power.requestEnabled(false);
  const drain = ship.power.connect(0, 'utility');
  drain.request(true, 1e20);
  step(ship, 1, 0.1);
  assert.ok(ship.telemetry.shields.thermal.restartRemainingSeconds > 0.39);
  drain.dispose();
  step(ship, 1, 0.1);
  const remaining = ship.telemetry.shields.thermal.restartRemainingSeconds;
  step(ship, 1, 0.1);
  close(ship.telemetry.shields.thermal.restartRemainingSeconds, remaining);
  ship.dispose();
  assert.throws(() => make(NaN), /shieldTemperatureK/);
  assert.throws(
    () =>
      make(290, {
        ...profile,
        cooling: { ...profile.cooling, sinkTemperatureK: 300 },
      }),
    /sink/,
  );
});
