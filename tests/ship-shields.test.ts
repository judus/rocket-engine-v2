import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship } from '../games/ship/Ship.js';
import {
  validateShieldProfile,
  validateHullProfile,
} from '../games/ship/ShipProfiles.js';
import { starterSetup } from './helpers/shipSetup.js';

function make(outputW = 100) {
  const p = starterSetup.profile;
  const ship = new Ship(
    {
      ...p,
      power: {
        ...p.power,
        capacityJ: 1000,
        reactorOutputW: outputW,
        thermal: {
          ...p.power.thermal,
          wasteHeatFraction: 0,
          manualStartSeconds: 0,
        },
      },
      engine: { ...p.engine, restartEnergyJ: 0 },
      dampers: { ...p.dampers, restartEnergyJ: 0 },
      cooling: { ...p.cooling, restartEnergyJ: 0 },
      shields: {
        id: 'test-shield',
        capacityJ: 100,
        baselineW: 2,
        rechargeW: 20,
        rechargeEfficiency: 0.5,
        rechargeDelaySeconds: 2,
        restartEnergyJ: 0,
      },
      hull: { id: 'test-structure', damageCapacityJ: 200 },
    },
    { ...starterSetup.initialState, energyJ: 0 },
  );
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
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

void test('Shield charging uses the existing power ledger, efficiency and capacity; full fields draw maintenance only', () => {
  const ship = make();
  ship.shields.requestEnabled(true);
  const before = ship.telemetry;
  step(ship);
  close(ship.telemetry.shields.energyJ, 10);
  close(ship.telemetry.power.energyJ, 78);
  close(ship.telemetry.shields.suppliedW, 22);
  close(before.shields.energyJ, 0);
  assert.ok(Object.isFrozen(ship.telemetry.shields));
  step(ship, 9);
  close(ship.telemetry.shields.energyJ, 100);
  step(ship);
  close(ship.telemetry.shields.demandW, 2);
  assert.equal(ship.telemetry.shields.state, 'online');
  ship.dispose();
});
void test('Hits wait for a committed tick, drain shields first, overflow to hull and preserve last-hit accounting', () => {
  const ship = make();
  ship.shields.requestEnabled(true);
  step(ship, 10);
  const before = ship.telemetry;
  ship.hull.hit(80);
  ship.hull.hit(50);
  assert.equal(ship.telemetry, before);
  step(ship);
  assert.deepEqual(ship.telemetry.hull, {
    remainingJ: 170,
    capacityJ: 200,
    breached: false,
    incomingJ: 130,
    shieldAbsorbedJ: 100,
    hullDamageJ: 30,
    excessJ: 0,
  });
  close(ship.telemetry.shields.energyJ, 0);
  close(ship.telemetry.shields.rechargeDelaySeconds, 2);
  step(ship, 2);
  close(ship.telemetry.shields.energyJ, 0);
  close(ship.telemetry.shields.demandW, 2);
  step(ship);
  close(ship.telemetry.shields.energyJ, 10);
  close(ship.telemetry.hull.incomingJ, 130);
  ship.hull.hit(1000);
  step(ship);
  assert.equal(ship.telemetry.hull.breached, true);
  const h = ship.telemetry.hull;
  close(h.incomingJ, h.shieldAbsorbedJ + h.hullDamageJ + h.excessJ);
  close(h.remainingJ, 0);
  ship.dispose();
});
void test('Switching off preserves charge but removes protection; re-enabling restores the stored field', () => {
  const ship = make();
  ship.shields.requestEnabled(true);
  step(ship, 5);
  ship.shields.requestEnabled(false);
  ship.hull.hit(20);
  step(ship);
  close(ship.telemetry.shields.energyJ, 50);
  close(ship.telemetry.hull.hullDamageJ, 20);
  close(ship.telemetry.shields.demandW, 0);
  assert.equal(ship.telemetry.shields.active, false);
  ship.shields.requestEnabled(true);
  ship.hull.hit(20);
  step(ship);
  close(ship.telemetry.shields.energyJ, 40); // funded recharge precedes the queued hit
  close(ship.telemetry.hull.hullDamageJ, 0);
  ship.dispose();
});
void test('Below-maintenance power disables protection without erasing charge; partial recharge remains funded', () => {
  const p = starterSetup.profile;
  const funded = new Ship(
    {
      ...p,
      power: { ...p.power, reactorOutputW: 0 },
      shields: {
        ...p.shields,
        capacityJ: 100,
        baselineW: 2,
        rechargeW: 20,
        rechargeEfficiency: 0.5,
        restartEnergyJ: 0,
      },
    },
    { ...starterSetup.initialState, energyJ: 23 },
  );
  funded.engine.requestEnabled(false);
  funded.shields.requestEnabled(true);
  step(funded);
  close(funded.telemetry.shields.energyJ, 10);
  funded.hull.hit(5);
  step(funded);
  assert.equal(funded.telemetry.shields.active, false);
  close(funded.telemetry.shields.energyJ, 10);
  close(funded.telemetry.hull.hullDamageJ, 5);
  close(funded.telemetry.power.energyJ, 0);
  funded.dispose();
  const partial = make(12);
  partial.shields.requestEnabled(true);
  step(partial);
  assert.equal(partial.telemetry.shields.active, true);
  close(partial.telemetry.shields.energyJ, 5);
  close(partial.telemetry.power.energyJ, 0);
  partial.dispose();
});
void test('Shield recharge cannot consume emergency recovery output, and requested state resumes afterward', () => {
  const ship = new Ship(starterSetup.profile, {
    ...starterSetup.initialState,
    energyJ: 0,
    reactorTemperatureK: 455,
  });
  ship.shields.requestEnabled(true);
  ship.engine.requestEnabled(false);
  let sawRecovery = false;
  for (let i = 0; i < 4500; i++) {
    step(ship, 1, 1 / 60);
    if (ship.telemetry.power.emergency) {
      sawRecovery = true;
      close(ship.telemetry.shields.suppliedW, 0);
      close(ship.telemetry.shields.energyJ, 0);
    }
  }
  assert.equal(sawRecovery, true);
  assert.equal(ship.telemetry.power.emergency, false);
  assert.equal(ship.telemetry.shields.requested, true);
  assert.ok(ship.telemetry.shields.energyJ > 0);
  ship.dispose();
});
void test('Bad damage/profile inputs fail before mutation, lifetimes retire ports and independent ships retain separate stores', () => {
  const first = make(),
    second = make();
  first.shields.requestEnabled(true);
  step(first);
  step(second);
  close(second.telemetry.shields.energyJ, 0);
  assert.throws(() => first.hull.hit(NaN));
  assert.throws(() => first.hull.hit(-1));
  assert.throws(() => first.shields.absorb(Infinity));
  first.hull.hit(1e30);
  assert.throws(() => first.hull.hit(1e30));
  step(first);
  close(first.telemetry.hull.incomingJ, 1e30);
  const last = first.telemetry;
  first.dispose();
  first.dispose();
  step(first);
  assert.equal(first.telemetry, last);
  assert.throws(() => first.hull.hit(1), /disposed/);
  assert.throws(() => first.shields.requestEnabled(true), /attached/);
  second.dispose();
  for (const value of [0, 2, NaN])
    assert.throws(() =>
      validateShieldProfile({
        ...starterSetup.profile.shields,
        rechargeEfficiency: value,
      }),
    );
  assert.throws(() =>
    validateShieldProfile({ ...starterSetup.profile.shields, capacityJ: '10' }),
  );
  assert.throws(() =>
    validateHullProfile({ ...starterSetup.profile.hull, damageCapacityJ: 0 }),
  );
});
