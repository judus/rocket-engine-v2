import test from 'node:test';
import assert from 'node:assert/strict';
import { CargoLink } from '../games/farwake/CargoLink.js';
import { Ship } from '../games/farwake/Ship.js';
import { ShipCargo } from '../games/farwake/ShipCargo.js';
import { validateCargoProfile } from '../games/farwake/ShipProfiles.js';
import { starterSetup } from './helpers/shipSetup.js';

const profile = {
  ...starterSetup.profile,
  power: {
    ...starterSetup.profile.power,
    capacityJ: 1e6,
    reactorOutputW: 1000,
    thermal: {
      ...starterSetup.profile.power.thermal,
      manualStartSeconds: 0,
      wasteHeatFraction: 0,
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
    maxCoolingW: 50,
  },
  cargo: {
    ...starterSetup.profile.cargo,
    baselineW: 20,
    thermal: {
      ...starterSetup.profile.cargo.thermal,
      heatCapacityJPerK: 10,
      wasteHeatFraction: 0.1,
      manualStartSeconds: 0,
      tripTemperatureK: 310,
      restartTemperatureK: 300,
      rebootSeconds: 3,
    },
  },
};
function make(health = 100) {
  const ship = new Ship(profile, {
    ...starterSetup.initialState,
    energyJ: 10000,
    cargoTemperatureK: 290,
    engineTemperatureK: 290,
    damperTemperatureK: 290,
    shieldTemperatureK: 290,
    reactorTemperatureK: 290,
    cargoHealthPoints: health,
  });
  ship.engine.requestEnabled(false);
  ship.cargo.requestEnabled(true);
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
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

void test('Cargo link uses funded maintenance, one energy ledger, thermal losses and independent health', () => {
  const ship = make(50);
  const before = ship.telemetry;
  step(ship);
  const t = ship.telemetry;
  assert.equal(t.cargo.link.state, 'connected');
  assert.equal(t.cargo.state, 'damaged');
  close(t.cargo.suppliedW, 30);
  close(t.cargo.thermal.generatedHeatW, 3);
  close(t.power.energyJ, 10000 + 1000 - 30);
  close(t.engine.health.points, 100);
  close(before.cargo.health.points, 50);
  assert.ok(Object.isFrozen(t.cargo.link));
  ship.dispose();
});
void test('Manual shutdown starts one deadline; toggles and brief recovery cannot refresh it; stabilized operation rearms it', () => {
  const ship = make();
  step(ship);
  ship.cargo.requestEnabled(false);
  step(ship, 4);
  close(ship.telemetry.cargo.link.remainingSeconds, 14);
  ship.cargo.requestEnabled(true);
  step(ship);
  close(ship.telemetry.cargo.link.remainingSeconds, 13);
  assert.equal(ship.telemetry.cargo.link.accessible, false);
  ship.cargo.requestEnabled(false);
  step(ship);
  close(ship.telemetry.cargo.link.remainingSeconds, 12);
  close(ship.telemetry.cargo.link.stabilizationSeconds, 0);
  ship.cargo.requestEnabled(true);
  step(ship, 2);
  assert.equal(ship.telemetry.cargo.link.state, 'connected');
  ship.cargo.requestEnabled(false);
  step(ship);
  close(ship.telemetry.cargo.link.remainingSeconds, 17);
  ship.dispose();
});
void test('Failure and power shortage interrupt access; expiry is final and repair cannot resurrect the pocket', () => {
  const ship = make();
  step(ship);
  ship.cargo.damage(100);
  step(ship);
  assert.equal(ship.telemetry.cargo.state, 'failed');
  assert.equal(ship.telemetry.cargo.link.state, 'interrupted');
  close(ship.telemetry.cargo.demandW, 0);
  step(ship, 17);
  assert.equal(ship.telemetry.cargo.link.state, 'lost');
  ship.cargo.repair(100);
  step(ship, 10);
  assert.equal(ship.telemetry.cargo.state, 'lost');
  assert.equal(ship.telemetry.cargo.link.accessible, false);
  close(ship.telemetry.cargo.demandW, 0);
  ship.dispose();
  const starved = new Ship(
    { ...profile, power: { ...profile.power, reactorOutputW: 0 } },
    { ...starterSetup.initialState, energyJ: 1, cargoTemperatureK: 290 },
  );
  starved.engine.requestEnabled(false);
  starved.cargo.requestEnabled(true);
  step(starved);
  assert.equal(starved.telemetry.cargo.link.state, 'interrupted');
  assert.equal(starved.telemetry.cargo.state, 'unpowered');
  starved.dispose();
});
void test('Thermal trip interrupts the link; shared cooling and powered reboot permit recovery within its original window', () => {
  const ship = make();
  step(ship);
  ship.cargo.generateHeat(100); // lab-equivalent heat injection, crosses threshold
  step(ship);
  assert.equal(ship.telemetry.cargo.state, 'overheated');
  assert.equal(ship.telemetry.cargo.link.state, 'interrupted');
  ship.cooling.requestEnabled(true);
  let removedJ = 0;
  for (let i = 0; i < 12; i++) {
    step(ship);
    removedJ += ship.telemetry.cooling.cargoRemovedHeatW;
  }
  assert.equal(ship.telemetry.cargo.link.state, 'connected');
  assert.ok(removedJ > 200);
  ship.dispose();
});
void test('Deadline wins at exact expiry, pause does not advance it, and frame partitions agree', () => {
  const a = new CargoLink('pocket-a'),
    b = new CargoLink('pocket-b');
  for (let i = 0; i < 2; i++) a.advance(1, false, 4, 2);
  for (let i = 0; i < 8; i++) b.advance(0.25, false, 4, 2);
  close(a.telemetry.remainingSeconds, b.telemetry.remainingSeconds);
  const paused = a.telemetry;
  assert.deepEqual(a.telemetry, paused);
  a.advance(1, true, 4, 2);
  a.advance(1, true, 4, 2);
  assert.equal(a.telemetry.state, 'lost');
  a.advance(1, true, 4, 2);
  assert.equal(a.telemetry.state, 'lost');
});
void test('Replacing equipment retains the host pocket deadline; module cleanup never erases the reference', () => {
  const ship = make();
  step(ship);
  ship.cargo.requestEnabled(false);
  step(ship, 3);
  const before = ship.cargoLink.telemetry;
  const replacement = new ShipCargo(
    profile.cargo,
    ship.power,
    ship.cargoLink,
    290,
    100,
  );
  assert.deepEqual(replacement.telemetry.link, before);
  replacement.dispose();
  assert.deepEqual(ship.cargoLink.telemetry, before);
  ship.dispose();
  assert.throws(() => ship.cargo.damage(1), /not attached/);
  assert.throws(() => ship.cargo.repair(1), /not attached/);
});
void test('Cargo JSON and command boundaries reject invalid timing, identifiers, health and temperatures', () => {
  assert.throws(() =>
    validateCargoProfile({ ...profile.cargo, stabilizationSeconds: 19 }),
  );
  assert.throws(() =>
    validateCargoProfile({ ...profile.cargo, graceSeconds: 0 }),
  );
  assert.throws(() => new CargoLink('../bad'));
  assert.throws(() => make(101), /cargoHealthPoints/);
  const ship = make();
  assert.throws(() => ship.cargo.damage(-1));
  assert.throws(() => ship.cargo.repair(NaN));
  assert.throws(() => ship.cargo.requestEnabled(1 as unknown as boolean));
  ship.dispose();
});

void test('Cargo recovery and expiry resolve in event order across coarse and fine partitions', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 120, 1 / 240]) {
    for (const stabilization of [
      0.02,
      1 / 30 - 1e-10,
      1 / 30,
      1 / 30 + 1e-10,
      0.04,
    ]) {
      const link = new CargoLink('event-order');
      link.advance(1 / 60, false, 0.05, stabilization);
      let remaining = 1 / 30;
      while (remaining > 1e-12) {
        const interval = Math.min(dt, remaining);
        link.advance(interval, true, 0.05, stabilization);
        remaining -= interval;
      }
      assert.equal(
        link.telemetry.state,
        stabilization < 1 / 30 ? 'connected' : 'lost',
      );
      assert.equal(link.telemetry.remainingSeconds, 0);
      assert.equal(link.telemetry.stabilizationSeconds, 0);
    }
  }
});
