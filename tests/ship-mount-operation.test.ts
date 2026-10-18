import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship } from '../games/ship/Ship.js';
import { validateMountsProfile } from '../games/ship/ShipMounts.js';
import { starterSetup } from './helpers/shipSetup.js';
const equipment = starterSetup.profile.mounts.equipment.map((e) => ({
  ...e,
  baselineW: 2,
  operatingW: 20,
  restartEnergyJ: 0,
  initialTemperatureK: 290,
  thermal: {
    ...e.thermal,
    heatCapacityJPerK: 10,
    wasteHeatFraction: 0.1,
    manualStartSeconds: 0,
    tripTemperatureK: 350,
    restartTemperatureK: 330,
    rebootSeconds: 3,
  },
}));
const profile = {
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
  shields: { ...starterSetup.profile.shields, restartEnergyJ: 0 },
  cooling: {
    ...starterSetup.profile.cooling,
    restartEnergyJ: 0,
    sinkTemperatureK: 290,
    baselineW: 1,
    fullPowerW: 1,
    maxCoolingW: 20,
  },
  mounts: { ...starterSetup.profile.mounts, equipment },
};
function make(p = profile, energyJ = 10000) {
  const ship = new Ship(p, {
    ...starterSetup.initialState,
    energyJ,
    engineTemperatureK: 290,
    reactorTemperatureK: 290,
    shieldTemperatureK: 290,
    damperTemperatureK: 290,
    cargoTemperatureK: 290,
  });
  ship.engine.requestEnabled(false);
  return ship;
}
function step(ship: Ship, count = 1, dt = 1) {
  for (let i = 0; i < count; i++)
    ship.fixedUpdate(dt, {
      dt,
      tick: ship.telemetry.tick + 1,
      time: ship.telemetry.timeSeconds + dt,
    });
}
function operation(ship: Ship, slot = 'mount-1') {
  const i = ship.telemetry.mounts.installations.find((i) => i.slotId === slot);
  assert.ok(i);
  return i.operation;
}
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
void test('Firing selected group aggregates real funded output, heat and power for every enabled member once', () => {
  const ship = make();
  ship.mounts.requestEnabled('mount-1', true);
  ship.mounts.requestEnabled('mount-2', true);
  ship.mounts.requestFiring(true);
  const before = ship.telemetry;
  assert.equal(before.mounts.firingRequested, false);
  step(ship);
  close(ship.telemetry.mounts.demandW, 44);
  close(ship.telemetry.mounts.suppliedW, 44);
  close(ship.telemetry.mounts.outputW, 20);
  close(ship.telemetry.power.energyJ, 10000 + 1000 - 44);
  const o = operation(ship);
  close(o.outputJ, 10);
  close(o.thermal.generatedHeatW, 10.2);
  close(o.thermal.temperatureK, 291.02);
  assert.equal(o.state, 'operating');
  assert.ok(Object.isFrozen(o.health));
  assert.ok(Object.isFrozen(o.thermal));
  ship.mounts.assign('group-2', 'mount-1', true);
  step(ship);
  close(operation(ship).totalOutputJ, 20);
  close(before.mounts.outputW, 0);
  ship.dispose();
});
void test('Idle weapons consume baseline, group changes stop unselected output, utilities operate independently and trigger release stops firing', () => {
  const ship = make();
  for (const id of ['mount-1', 'mount-2', 'mount-3'])
    ship.mounts.requestEnabled(id, true);
  step(ship);
  close(ship.telemetry.mounts.demandW, 26);
  close(operation(ship).outputW, 0);
  close(operation(ship, 'mount-3').outputW, 10);
  assert.equal(operation(ship).state, 'idle');
  ship.mounts.requestFiring(true);
  ship.mounts.assign('group-2', 'mount-2', true);
  ship.mounts.selectGroup('group-2');
  step(ship);
  close(operation(ship).outputW, 0);
  close(operation(ship, 'mount-2').outputW, 10);
  close(operation(ship, 'mount-3').outputW, 10);
  ship.mounts.requestFiring(false);
  step(ship);
  close(operation(ship, 'mount-2').outputW, 0);
  ship.mounts.requestEnabled('mount-3', false);
  step(ship);
  close(operation(ship, 'mount-3').suppliedW, 0);
  ship.dispose();
});
void test('Partial power limits actual output after baseline; depletion preserves the trigger without phantom output or heat', () => {
  const ship = make(
    { ...profile, power: { ...profile.power, reactorOutputW: 0 } },
    12,
  );
  ship.mounts.requestEnabled('mount-1', true);
  ship.mounts.requestFiring(true);
  step(ship);
  const o = operation(ship);
  close(o.suppliedW, 12);
  close(o.activityFraction, 0.5);
  close(o.outputW, 5);
  close(o.thermal.generatedHeatW, 5.2);
  close(ship.telemetry.power.energyJ, 0);
  step(ship);
  close(operation(ship).outputW, 0);
  close(operation(ship).thermal.generatedHeatW, 0);
  assert.equal(ship.telemetry.mounts.firingRequested, true);
  assert.equal(operation(ship).requested, true);
  ship.dispose();
});
void test('Per-installation damage weakens output and adds conversion loss; zero health stops demand and repair preserves condition of neighbors', () => {
  const ship = make();
  ship.mounts.requestEnabled('mount-1', true);
  ship.mounts.requestEnabled('mount-2', true);
  ship.mounts.requestFiring(true);
  ship.mounts.damage('mount-1', 50);
  step(ship);
  close(operation(ship).outputW, 5);
  close(operation(ship).thermal.generatedHeatW, 15.2);
  close(operation(ship, 'mount-2').health.points, 100);
  ship.mounts.damage('mount-1', 50);
  step(ship);
  assert.equal(operation(ship).state, 'failed');
  close(operation(ship).demandW, 0);
  close(operation(ship).outputW, 0);
  ship.mounts.repair('mount-1', 25);
  step(ship);
  close(operation(ship).outputW, 2.5);
  close(operation(ship).health.points, 25);
  ship.dispose();
});
void test('Thermal trip removes subsequent output, manual toggles cannot bypass it, and shared cooling permits powered reboot', () => {
  const hot = {
    ...profile,
    mounts: {
      ...profile.mounts,
      equipment: equipment.map((e) => ({
        ...e,
        thermal: {
          ...e.thermal,
          heatCapacityJPerK: 1,
          tripTemperatureK: 293,
          restartTemperatureK: 291,
        },
      })),
    },
  };
  const ship = make(hot);
  ship.mounts.requestEnabled('mount-1', true);
  ship.mounts.requestFiring(true);
  step(ship);
  assert.equal(operation(ship).state, 'overheated');
  assert.ok(operation(ship).outputW > 0);
  step(ship);
  close(operation(ship).outputW, 0);
  close(operation(ship).thermal.restartRemainingSeconds, 3);
  ship.mounts.requestEnabled('mount-1', false);
  step(ship);
  ship.mounts.requestEnabled('mount-1', true);
  step(ship);
  close(operation(ship).thermal.restartRemainingSeconds, 3);
  ship.cooling.requestEnabled(true);
  step(ship);
  assert.ok(ship.telemetry.cooling.mountRemovedHeatW > 0);
  close(operation(ship).outputW, 0);
  close(
    ship.telemetry.cooling.removedHeatW,
    ship.telemetry.cooling.mountRemovedHeatW,
  );
  step(ship, 3);
  close(operation(ship).thermal.restartRemainingSeconds, 0);
  ship.mounts.requestFiring(false);
  step(ship);
  assert.equal(operation(ship).state, 'idle');
  assert.ok(operation(ship).thermal.temperatureK <= 291);
  ship.dispose();
});
void test('Removal rejects enabled or hot devices, retires ports without inherited output and rejects identity recycling', () => {
  const ship = make();
  ship.mounts.requestEnabled('mount-1', true);
  step(ship);
  assert.throws(() => ship.mounts.remove('mount-1'), /Switch equipment off/);
  ship.mounts.requestEnabled('mount-1', false);
  ship.mounts.remove('mount-1');
  step(ship);
  close(ship.telemetry.mounts.demandW, 0);
  assert.throws(
    () => ship.mounts.install('mount-1', 'mining-laser', 'cannon-port'),
    /retired/,
  );
  ship.mounts.install('mount-1', 'mining-laser', 'replacement');
  step(ship);
  close(operation(ship).health.points, 100);
  close(operation(ship).totalOutputJ, 0);
  assert.equal(operation(ship).requested, false);
  assert.throws(
    () => ship.mounts.requestEnabled('empty', true),
    /no installation/,
  );
  assert.throws(() => ship.mounts.damage('mount-7', 1), /committed/);
  ship.dispose();
  assert.throws(() => ship.mounts.requestFiring(true), /disposed/);
  const hot = make({
    ...profile,
    mounts: {
      ...profile.mounts,
      equipment: equipment.map((e) => ({ ...e, initialTemperatureK: 340 })),
    },
  });
  assert.throws(() => hot.mounts.remove('mount-1'), /cool/);
  hot.dispose();
});
void test('Equipment profiles validate operational boundaries before installation and manual startup requires supplied power', () => {
  const invalid = {
    ...profile.mounts,
    equipment: equipment.map((e) => ({ ...e, outputEfficiency: 1.1 })),
  };
  assert.throws(() => validateMountsProfile(invalid));
  assert.throws(
    () =>
      make({
        ...profile,
        mounts: {
          ...profile.mounts,
          equipment: equipment.map((e) => ({ ...e, restartEnergyJ: 1e9 })),
        },
      }),
    /restartEnergyJ/,
  );
  const boot = make({
    ...profile,
    mounts: {
      ...profile.mounts,
      equipment: equipment.map((e) => ({
        ...e,
        thermal: { ...e.thermal, manualStartSeconds: 2 },
      })),
    },
  });
  boot.mounts.requestEnabled('mount-1', true);
  boot.mounts.requestFiring(true);
  step(boot);
  assert.equal(operation(boot).state, 'restarting');
  close(operation(boot).outputW, 0);
  step(boot);
  step(boot);
  assert.ok(operation(boot).outputW > 0);
  boot.dispose();
});
