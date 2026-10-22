import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship } from '../games/farwake/Ship.js';
import {
  validateShieldProfile,
  validateHullProfile,
} from '../games/farwake/ShipProfiles.js';
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
        health: p.shields.health,
        thermal: { ...p.shields.thermal, manualStartSeconds: 0 },
        diversionW: 20,
        diversionEfficiency: 0.8,
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
        thermal: { ...p.shields.thermal, manualStartSeconds: 0 },
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
    cargoPocketId: 'test-pocket',
    cargoTemperatureK: 290,
    cargoHealthPoints: 100,
    shieldHealthPoints: 100,
    damperHealthPoints: 100,
    coolingHealthPoints: 100,
    reactorHealthPoints: 100,
    engineHealthPoints: 100,
    shieldTemperatureK: 293.15,
    reactorTemperatureK:
      starterSetup.profile.power.thermal.tripTemperatureK + 5,
  });
  ship.shields.requestEnabled(true);
  ship.engine.requestEnabled(false);
  let sawRecovery = false;
  for (let i = 0; i < 12000; i++) {
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

void test('Diversion debits stored energy at its configured rate, credits efficiency-adjusted energy once, and collapses protection', () => {
  const ship = make();
  ship.shields.requestEnabled(true);
  step(ship, 5);
  ship.power.requestEnabled(false);
  const before = ship.telemetry;
  ship.shields.startDiversion();
  ship.shields.startDiversion(); // repeated requests cannot reset an active transfer
  assert.equal(ship.telemetry, before); // commands do not advance simulation
  ship.hull.hit(5);
  step(ship);
  close(ship.telemetry.shields.energyJ, 30);
  close(ship.telemetry.power.energyJ, before.power.energyJ + 16);
  close(ship.telemetry.power.receivedEnergyJ, 16);
  close(ship.telemetry.shields.divertedJ, 20);
  close(ship.telemetry.shields.diversionLostJ, 4);
  close(ship.telemetry.shields.suppliedW, 0);
  close(ship.telemetry.shields.demandW, 0);
  close(ship.telemetry.hull.hullDamageJ, 5);
  assert.equal(ship.telemetry.shields.state, 'diverting');
  step(ship, 2);
  close(ship.telemetry.shields.energyJ, 0);
  close(ship.telemetry.shields.divertedJ, 50);
  close(ship.telemetry.shields.diversionReceivedJ, 40);
  close(ship.telemetry.shields.diversionLostJ, 10);
  assert.equal(ship.telemetry.shields.diverting, false);
  assert.equal(ship.telemetry.shields.requested, false);
  step(ship);
  close(ship.telemetry.power.receivedEnergyJ, 0);
  close(ship.telemetry.shields.rechargeJ, 0);
  ship.dispose();
});
void test('Diversion into a nearly full reserve only debits accepted energy; cancellation retains the rest and re-enabling cancels diversion', () => {
  const ship = make();
  ship.shields.requestEnabled(true);
  step(ship, 10); // reserve 780 J, shields 100 J
  ship.shields.requestEnabled(false);
  ship.power.receiveTransferredEnergy(215); // reserve 995; owning ledger accepts 215
  ship.power.requestEnabled(false);
  ship.shields.startDiversion();
  step(ship);
  close(ship.telemetry.power.energyJ, 1000);
  close(ship.telemetry.power.receivedEnergyJ, 5);
  close(ship.telemetry.shields.energyJ, 93.75);
  close(ship.telemetry.shields.diversionLostJ, 1.25);
  assert.equal(ship.telemetry.shields.diverting, false);
  ship.shields.startDiversion(); // already full: no energy discarded
  step(ship);
  close(ship.telemetry.shields.energyJ, 93.75);
  close(ship.telemetry.shields.divertedJ, 0);
  ship.shields.startDiversion();
  ship.shields.cancelDiversion();
  step(ship);
  close(ship.telemetry.power.receivedEnergyJ, 0);
  ship.shields.startDiversion();
  ship.shields.requestEnabled(true);
  step(ship);
  assert.equal(ship.telemetry.shields.diverting, false);
  assert.equal(ship.telemetry.shields.active, true);
  close(ship.telemetry.power.receivedEnergyJ, 0);
  ship.dispose();
});
void test('Empty-reserve diversion powers actual loads without a working reactor and cannot bypass emergency startup', () => {
  const ship = make();
  ship.shields.requestEnabled(true);
  step(ship, 5);
  ship.power.requestEnabled(false);
  const drain = ship.power.connect(0, 'utility');
  drain.request(true, 10000);
  step(ship);
  close(ship.telemetry.power.energyJ, 0);
  const stored = ship.telemetry.shields.energyJ;
  drain.request(true, 8);
  ship.shields.startDiversion();
  step(ship);
  assert.equal(ship.telemetry.power.emergency, true);
  close(ship.telemetry.power.generationW, 0);
  close(ship.telemetry.power.receivedEnergyJ, 16);
  close(drain.delivery().suppliedW, 8);
  close(ship.telemetry.power.energyJ, 8);
  close(ship.telemetry.shields.energyJ, stored - 20);
  close(
    ship.telemetry.power.thermal.restartRemainingSeconds,
    ship.power.profile.recovery.emergencyStartSeconds,
  );
  const remaining = ship.telemetry.shields.energyJ;
  ship.dispose();
  assert.throws(() => ship.shields.startDiversion(), /attached/);
  assert.throws(() => ship.shields.cancelDiversion(), /attached/);
  assert.throws(() => ship.power.receiveTransferredEnergy(1), /disposed/);
  close(ship.telemetry.shields.energyJ, remaining);
});
void test('Diversion conservation includes concurrent reactor generation, consumption and spill across different tick sizes', () => {
  for (const dt of [1, 0.1, 1 / 60]) {
    const ship = make();
    ship.shields.requestEnabled(true);
    step(ship, 5);
    ship.shields.startDiversion();
    let drawnJ = 0;
    for (let i = 0; i < Math.ceil(3 / dt); i++) {
      const before = ship.telemetry;
      step(ship, 1, dt);
      const after = ship.telemetry;
      close(
        after.power.energyJ - before.power.energyJ,
        after.power.receivedEnergyJ +
          (after.power.generationW -
            after.power.consumptionW -
            after.power.spillW) *
            dt,
      );
      drawnJ += before.shields.energyJ - after.shields.energyJ;
      close(
        drawnJ,
        after.shields.diversionReceivedJ + after.shields.diversionLostJ,
      );
      close(after.shields.demandW, 0);
    }
    close(ship.telemetry.shields.energyJ, 0);
    ship.dispose();
  }
});
void test('Invalid transferred energy leaves the reserve unchanged; empty diversion is harmless', () => {
  const ship = make();
  for (const value of [-1, NaN, Infinity])
    assert.throws(() => ship.power.receiveTransferredEnergy(value));
  close(ship.power.telemetry.energyJ, 0);
  ship.shields.startDiversion();
  step(ship);
  close(ship.telemetry.shields.divertedJ, 0);
  close(ship.telemetry.power.receivedEnergyJ, 0);
  assert.equal(ship.telemetry.shields.diverting, false);
  ship.dispose();
});
