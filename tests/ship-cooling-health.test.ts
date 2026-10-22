import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship } from '../games/farwake/Ship.js';
import type { ShipProfile } from '../games/farwake/ShipProfiles.js';
import { starterSetup } from './helpers/shipSetup.js';

const profile: ShipProfile = {
  ...starterSetup.profile,
  power: {
    ...starterSetup.profile.power,
    capacityJ: 1e6,
    reactorOutputW: 0,
    thermal: {
      ...starterSetup.profile.power.thermal,
      heatCapacityJPerK: 100,
      wasteHeatFraction: 0,
      manualStartSeconds: 0,
    },
    recovery: {
      ...starterSetup.profile.power.recovery,
      passiveCoolingW: 10,
      sinkTemperatureK: 290,
    },
  },
  engine: {
    ...starterSetup.profile.engine,
    restartEnergyJ: 0,
    thermal: {
      ...starterSetup.profile.engine.thermal,
      heatCapacityJPerK: 100,
      wasteHeatFraction: 0,
      manualStartSeconds: 0,
    },
  },
  dampers: {
    ...starterSetup.profile.dampers,
    restartEnergyJ: 0,
    thermal: {
      ...starterSetup.profile.dampers.thermal,
      heatCapacityJPerK: 100,
    },
  },
  shields: {
    ...starterSetup.profile.shields,
    restartEnergyJ: 0,
    thermal: {
      ...starterSetup.profile.shields.thermal,
      heatCapacityJPerK: 100,
    },
  },
  cooling: {
    ...starterSetup.profile.cooling,
    sinkTemperatureK: 290,
    maxCoolingW: 40,
    baselineW: 2,
    fullPowerW: 8,
    restartEnergyJ: 0,
  },
};
function make(health = 100, equipment = profile, energyJ = 10000) {
  const ship = new Ship(equipment, {
    ...starterSetup.initialState,
    cargoPocketId: 'test-pocket',
    cargoTemperatureK: 290,
    cargoHealthPoints: 100,
    shieldHealthPoints: 100,
    damperHealthPoints: 100,
    coolingHealthPoints: health,
    energyJ,
    engineTemperatureK: 300,
    damperTemperatureK: 300,
    shieldTemperatureK: 300,
    reactorTemperatureK: 300,
  });
  ship.engine.requestEnabled(false);
  ship.cooling.requestEnabled(true);
  return ship;
}
function step(ship: Ship, count = 1) {
  for (let i = 0; i < count; i++)
    ship.fixedUpdate(1, {
      dt: 1,
      tick: ship.telemetry.tick + 1,
      time: ship.telemetry.timeSeconds + 1,
    });
}
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

void test('Cooling health scales one shared removal budget while preserving nominal pump demand and thermal accounting', () => {
  const ship = make();
  const before = ship.telemetry;
  ship.cooling.damage(50);
  assert.equal(ship.telemetry, before);
  step(ship);
  const c = ship.telemetry.cooling;
  close(c.health.points, 50);
  close(c.powerFraction, 1);
  close(c.activityFraction, 0.5);
  close(c.removedHeatW, 20);
  close(c.demandW, 10);
  close(c.suppliedW, 10);
  assert.equal(c.state, 'damaged');
  close(
    c.removedHeatW,
    c.engineRemovedHeatW +
      c.damperRemovedHeatW +
      c.reactorRemovedHeatW +
      c.shieldRemovedHeatW,
  );
  assert.ok(
    c.engineRemovedHeatW > 0 &&
      c.damperRemovedHeatW > 0 &&
      c.reactorRemovedHeatW > 0 &&
      c.shieldRemovedHeatW > 0,
  );
  const t = ship.telemetry;
  close(
    (t.engine.thermal.temperatureK - before.engine.thermal.temperatureK) *
      profile.engine.thermal.heatCapacityJPerK,
    -c.engineRemovedHeatW,
  );
  close(
    (t.shields.thermal.temperatureK - before.shields.thermal.temperatureK) *
      profile.shields.thermal.heatCapacityJPerK,
    -c.shieldRemovedHeatW,
  );
  close(t.power.energyJ, before.power.energyJ - 10);
  assert.ok(Object.isFrozen(c.health));
  ship.dispose();
});
void test('Cooling power and condition limits multiply once, including a configurable nonlinear condition curve', () => {
  const ship = make(50, profile, 6);
  step(ship);
  close(ship.telemetry.cooling.powerFraction, 0.5);
  close(ship.telemetry.cooling.activityFraction, 0.25);
  close(ship.telemetry.cooling.removedHeatW, 10);
  close(ship.telemetry.power.energyJ, 0);
  step(ship);
  close(ship.telemetry.cooling.removedHeatW, 0);
  assert.equal(ship.telemetry.cooling.state, 'waiting-for-charge');
  ship.dispose();
  const curved = make(50, {
    ...profile,
    cooling: {
      ...profile.cooling,
      health: { maxPoints: 100, outputExponent: 2 },
    },
  });
  step(curved);
  close(curved.telemetry.cooling.removedHeatW, 10);
  curved.dispose();
});
void test('Failed cooling removes pump demand and active heat removal, preserves requested state and leaves reactor passive cooling intact', () => {
  const ship = make();
  ship.cooling.damage(100);
  step(ship);
  const t = ship.telemetry;
  assert.equal(t.cooling.state, 'failed');
  assert.equal(t.cooling.requested, true);
  close(t.cooling.removedHeatW, 0);
  close(t.cooling.suppliedW, 0);
  close(t.cooling.demandW, 0);
  close(t.engine.thermal.temperatureK, 300);
  close(t.shields.thermal.temperatureK, 300);
  close(t.power.passiveRemovedHeatW, 10);
  close(t.power.thermal.temperatureK, 299.9);
  ship.cooling.requestEnabled(false);
  ship.cooling.requestEnabled(true);
  step(ship);
  assert.equal(ship.telemetry.cooling.state, 'failed');
  ship.dispose();
});
void test('Repair restores only repaired capacity on the next step and does not silently enable a manually disabled pump', () => {
  const ship = make(0);
  step(ship);
  ship.cooling.repair(25);
  step(ship);
  close(ship.telemetry.cooling.health.points, 25);
  close(ship.telemetry.cooling.removedHeatW, 10);
  assert.equal(ship.telemetry.cooling.state, 'damaged');
  assert.equal(ship.telemetry.cooling.requested, true);
  ship.cooling.requestEnabled(false);
  ship.cooling.repair(100);
  step(ship);
  close(ship.telemetry.cooling.health.points, 100);
  close(ship.telemetry.cooling.removedHeatW, 0);
  assert.equal(ship.telemetry.cooling.state, 'off');
  ship.cooling.requestEnabled(true);
  step(ship);
  close(ship.telemetry.cooling.removedHeatW, 40);
  ship.dispose();
});
void test('Failed cooling lets an operating engine overheat; pump repair cools it without erasing its thermal reboot', () => {
  const equipment = {
    ...profile,
    engine: {
      ...profile.engine,
      baselineW: 2,
      fullThrustW: 1000,
      thermal: {
        heatCapacityJPerK: 10,
        wasteHeatFraction: 0.5,
        tripTemperatureK: 310,
        restartTemperatureK: 300,
        manualStartSeconds: 0,
        rebootSeconds: 3,
      },
    },
    cooling: { ...profile.cooling, maxCoolingW: 10000 },
  };
  const ship = make(0, equipment);
  ship.engine.requestEnabled(true);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  step(ship);
  assert.equal(ship.telemetry.engine.thermal.tripped, true);
  assert.equal(ship.telemetry.engine.health.points, 100);
  close(ship.telemetry.cooling.removedHeatW, 0);
  ship.cooling.repair(100);
  step(ship);
  assert.ok(ship.telemetry.engine.thermal.temperatureK <= 300);
  assert.equal(ship.telemetry.engine.thermal.tripped, true);
  close(ship.telemetry.engine.thermal.restartRemainingSeconds, 3);
  close(ship.telemetry.worldForceN.z, 0);
  step(ship, 3);
  assert.equal(ship.telemetry.engine.thermal.tripped, false);
  ship.dispose();
});
void test('Cooling health stays independent across ships; invalid commands/initial state fail and disposed pumps reject commands', () => {
  const first = make(),
    second = make();
  first.cooling.damage(75);
  step(first);
  step(second);
  close(first.telemetry.cooling.health.points, 25);
  close(second.telemetry.cooling.health.points, 100);
  for (const value of [-1, NaN, Infinity]) {
    assert.throws(() => first.cooling.damage(value));
    assert.throws(() => first.cooling.repair(value));
  }
  step(first);
  close(first.telemetry.cooling.health.points, 25);
  first.cooling.repair(100);
  first.dispose();
  step(first);
  close(first.telemetry.cooling.health.points, 25);
  assert.throws(() => first.cooling.damage(1), /attached/);
  assert.throws(() => first.cooling.repair(1), /attached/);
  second.dispose();
  assert.throws(() => make(101), /coolingHealthPoints/);
});
