import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship } from '../games/ship/Ship.js';
import type { ShipProfile } from '../games/ship/ShipProfiles.js';
import { starterSetup } from './helpers/shipSetup.js';

const profile: ShipProfile = {
  ...starterSetup.profile,
  power: {
    ...starterSetup.profile.power,
    capacityJ: 1000,
    reactorOutputW: 100,
    thermal: {
      heatCapacityJPerK: 10,
      wasteHeatFraction: 0.1,
      tripTemperatureK: 310,
      restartTemperatureK: 300,
      manualStartSeconds: 2,
      rebootSeconds: 3,
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
    fullThrustW: 100,
    restartEnergyJ: 0,
    thermal: {
      ...starterSetup.profile.engine.thermal,
      wasteHeatFraction: 0,
      manualStartSeconds: 0,
    },
  },
  dampers: { ...starterSetup.profile.dampers, restartEnergyJ: 0 },
  cooling: {
    ...starterSetup.profile.cooling,
    restartEnergyJ: 0,
    sinkTemperatureK: 290,
  },
  shields: { ...starterSetup.profile.shields, restartEnergyJ: 0 },
};
function make(
  health = 100,
  energyJ = 500,
  equipment = profile,
  temperatureK = 290,
) {
  const ship = new Ship(equipment, {
    ...starterSetup.initialState,
    reactorHealthPoints: health,
    reactorTemperatureK: temperatureK,
    energyJ,
  });
  ship.engine.requestEnabled(false);
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

void test('Reactor condition scales actual generation and heat while retaining the existing reserve and load ledger', () => {
  const ship = make();
  const load = ship.power.connect(0, 'utility');
  load.request(true, 20);
  const before = ship.telemetry;
  ship.power.damage(50);
  assert.equal(ship.telemetry, before);
  step(ship);
  const p = ship.telemetry.power;
  assert.equal(p.state, 'damaged');
  assert.equal(p.requested, true);
  close(p.health.points, 50);
  close(p.generationW, 50);
  close(p.thermal.generatedHeatW, 5);
  close(p.consumptionW, 20);
  close(p.energyJ, 530);
  close(p.capacityJ, 1000);
  close(before.power.health.points, 100);
  assert.ok(Object.isFrozen(p.health));
  ship.dispose();
  const curved = make(50, 500, {
    ...profile,
    power: { ...profile.power, health: { maxPoints: 100, outputExponent: 2 } },
  });
  step(curved);
  close(curved.telemetry.power.generationW, 25);
  curved.dispose();
});
void test('Reactor failure stops generation and starter demand but reserve energy continues funding the engine', () => {
  const ship = make();
  step(ship);
  const before = ship.telemetry;
  ship.engine.requestEnabled(true);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  ship.power.damage(100);
  step(ship);
  const p = ship.telemetry.power;
  assert.equal(p.state, 'failed');
  assert.equal(p.requested, true);
  close(p.generationW, 0);
  close(p.startupDemandW, 0);
  close(p.thermal.generatedHeatW, 0);
  close(p.energyJ, before.power.energyJ - p.consumptionW);
  assert.ok(ship.telemetry.worldForceN.z > 0);
  assert.ok(ship.telemetry.body.velocityMps.z > 0);
  ship.power.requestEnabled(false);
  ship.power.requestEnabled(true);
  step(ship);
  assert.equal(ship.telemetry.power.state, 'failed');
  close(ship.telemetry.power.generationW, 0);
  ship.dispose();
});
void test('Repair with reserve goes through funded manual startup and cannot erase an existing thermal reboot', () => {
  const ship = make(0);
  step(ship);
  ship.power.repair(25);
  step(ship);
  assert.equal(ship.telemetry.power.state, 'restarting');
  close(ship.telemetry.power.generationW, 0);
  close(ship.telemetry.power.startupSuppliedW, 10);
  close(ship.telemetry.power.energyJ, 490);
  close(ship.telemetry.power.thermal.restartRemainingSeconds, 1);
  step(ship);
  close(ship.telemetry.power.generationW, 0);
  step(ship);
  close(ship.telemetry.power.generationW, 25);
  assert.equal(ship.telemetry.power.state, 'damaged');
  ship.dispose();
  const hot = make(0, 500, profile, 315);
  hot.power.repair(100);
  step(hot);
  assert.equal(hot.telemetry.power.state, 'overheated');
  assert.equal(hot.telemetry.power.thermal.tripped, true);
  close(hot.telemetry.power.thermal.restartRemainingSeconds, 3);
  close(hot.telemetry.power.generationW, 0);
  hot.dispose();
});
void test('A failed empty reactor cannot self-ignite; repair retains the emergency penalty and health scales reduced output', () => {
  const ship = make(0, 0);
  step(ship, 10);
  assert.equal(ship.telemetry.power.state, 'failed');
  assert.equal(ship.telemetry.power.emergency, true);
  close(ship.telemetry.power.thermal.restartRemainingSeconds, 6);
  close(ship.telemetry.power.energyJ, 0);
  ship.power.repair(25);
  step(ship, 6);
  close(ship.telemetry.power.generationW, 0);
  step(ship);
  close(ship.telemetry.power.generationW, 5);
  close(ship.telemetry.power.energyJ, 5);
  assert.equal(ship.telemetry.power.state, 'recovering');
  assert.equal(ship.telemetry.power.nonessentialAllowed, false);
  for (let i = 0; i < 50 && ship.telemetry.power.emergency; i++) step(ship);
  assert.equal(ship.telemetry.power.emergency, false);
  step(ship);
  close(ship.telemetry.power.generationW, 25);
  assert.equal(ship.telemetry.power.state, 'damaged');
  ship.dispose();
});
void test('Failure during reduced-output recovery requires a fresh emergency restart instead of resuming generation immediately after repair', () => {
  const ship = make(0, 0);
  ship.power.repair(100);
  step(ship, 7);
  assert.equal(ship.telemetry.power.state, 'recovering');
  close(ship.telemetry.power.generationW, 20);
  ship.power.damage(100);
  step(ship, 3);
  assert.equal(ship.telemetry.power.state, 'failed');
  close(ship.telemetry.power.generationW, 0);
  close(ship.telemetry.power.thermal.restartRemainingSeconds, 6);
  ship.power.repair(100);
  step(ship);
  assert.equal(ship.telemetry.power.state, 'emergency-start');
  close(ship.telemetry.power.thermal.restartRemainingSeconds, 5);
  close(ship.telemetry.power.generationW, 0);
  ship.dispose();
});
void test('Reactor health is independent per ship, validates commands before mutation and honors disposal', () => {
  const first = make(),
    second = make();
  first.power.damage(75);
  step(first);
  step(second);
  close(first.telemetry.power.health.points, 25);
  close(second.telemetry.power.health.points, 100);
  for (const value of [-1, NaN, Infinity]) {
    assert.throws(() => first.power.damage(value));
    assert.throws(() => first.power.repair(value));
  }
  step(first);
  close(first.telemetry.power.health.points, 25);
  first.power.repair(100);
  first.dispose();
  step(first);
  close(first.telemetry.power.health.points, 25);
  assert.throws(() => first.power.damage(1), /disposed/);
  assert.throws(() => first.power.repair(1), /disposed/);
  second.dispose();
  assert.throws(() => make(101), /reactorHealthPoints/);
});
