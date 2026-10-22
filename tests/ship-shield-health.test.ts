import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship } from '../games/farwake/Ship.js';
import { validateShieldProfile } from '../games/farwake/ShipProfiles.js';
import type { ShipProfile } from '../games/farwake/ShipProfiles.js';
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
      tripTemperatureK: 1000,
      restartTemperatureK: 900,
      manualStartSeconds: 0,
      rebootSeconds: 3,
    },
  },
};
function make(
  temperatureK = 290,
  equipment = profile,
  energyJ = 10000,
  health = 100,
) {
  const ship = new Ship(equipment, {
    ...starterSetup.initialState,
    energyJ,
    shieldHealthPoints: health,
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

void test('Damaged shields recharge less efficiently, account for conversion heat and still fill their unchanged capacity', () => {
  const ship = make(290, profile, 10000, 50);
  ship.shields.requestEnabled(true);
  step(ship);
  const t = ship.telemetry;
  close(t.shields.energyJ, 5);
  close(t.shields.suppliedW, 22);
  close(t.shields.thermal.generatedHeatW, 15.2);
  close(t.shields.protectionFraction, 0.5);
  close(t.power.energyJ, 10000 + 1000 - 22);
  assert.ok(Object.isFrozen(t.shields.health));
  step(ship, 19);
  close(ship.telemetry.shields.energyJ, 100);
  assert.equal(ship.telemetry.shields.state, 'damaged');
  step(ship);
  close(ship.telemetry.shields.demandW, 2);
  ship.dispose();
});
void test('Damaged shields leak the configured fraction of every hit to hull and only debit absorbed energy', () => {
  const ship = make();
  ship.shields.requestEnabled(true);
  step(ship, 10);
  const before = ship.telemetry;
  ship.shields.damage(50);
  ship.hull.hit(40);
  assert.equal(ship.telemetry, before);
  step(ship);
  close(ship.telemetry.hull.shieldAbsorbedJ, 20);
  close(ship.telemetry.hull.hullDamageJ, 20);
  close(ship.telemetry.shields.energyJ, 80);
  close(ship.telemetry.shields.rechargeDelaySeconds, 2);
  ship.hull.hit(400);
  step(ship);
  close(ship.telemetry.hull.shieldAbsorbedJ, 80);
  close(ship.telemetry.hull.hullDamageJ + ship.telemetry.hull.excessJ, 320);
  close(ship.telemetry.shields.energyJ, 0);
  ship.dispose();
});
void test('Failed shields retain stored charge, draw no power and permit conserved emergency diversion', () => {
  const ship = make();
  ship.shields.requestEnabled(true);
  step(ship, 10);
  ship.shields.damage(100);
  ship.hull.hit(10);
  step(ship);
  let t = ship.telemetry;
  assert.equal(t.shields.state, 'failed');
  assert.equal(t.shields.requested, true);
  close(t.shields.energyJ, 100);
  close(t.shields.demandW, 0);
  close(t.shields.protectionFraction, 0);
  close(t.hull.hullDamageJ, 10);
  close(t.engine.health.points, 100);
  close(t.dampers.health.points, 100);
  ship.power.requestEnabled(false);
  const reserve = t.power.energyJ;
  ship.shields.startDiversion();
  step(ship);
  t = ship.telemetry;
  assert.equal(t.shields.diverting, true);
  close(t.shields.energyJ, 80);
  close(t.power.energyJ, reserve + 16);
  close(t.shields.thermal.generatedHeatW, 4);
  close(
    t.shields.divertedJ,
    t.shields.diversionReceivedJ + t.shields.diversionLostJ,
  );
  ship.dispose();
});
void test('Repair preserves requested state, performs startup and does not refill shield energy', () => {
  const equipment = {
    ...profile,
    shields: {
      ...profile.shields,
      thermal: { ...profile.shields.thermal, manualStartSeconds: 2 },
    },
  };
  const ship = make(290, equipment, 10000, 0);
  ship.shields.requestEnabled(true);
  step(ship);
  ship.shields.repair(25);
  step(ship);
  assert.equal(ship.telemetry.shields.state, 'restarting');
  close(ship.telemetry.shields.thermal.restartRemainingSeconds, 1);
  close(ship.telemetry.shields.energyJ, 0);
  step(ship);
  step(ship);
  close(ship.telemetry.shields.energyJ, 2.5);
  close(ship.telemetry.shields.protectionFraction, 0.25);
  ship.shields.requestEnabled(false);
  ship.shields.damage(25);
  step(ship);
  ship.shields.repair(100);
  step(ship);
  assert.equal(ship.telemetry.shields.state, 'off');
  close(ship.telemetry.shields.energyJ, 2.5);
  close(ship.telemetry.shields.demandW, 0);
  ship.dispose();
});
void test('Health repair does not clear thermal shutdown, and failure pauses a powered reboot', () => {
  const ship = make(1000, profile, 10000, 0);
  ship.shields.requestEnabled(true);
  step(ship);
  close(ship.telemetry.shields.thermal.restartRemainingSeconds, 3);
  assert.throws(() => ship.shields.startDiversion(), /cool and reboot/);
  ship.shields.removeHeat(1e10, 290);
  step(ship);
  close(ship.telemetry.shields.thermal.restartRemainingSeconds, 3);
  ship.shields.repair(100);
  step(ship);
  assert.equal(ship.telemetry.shields.state, 'restarting');
  close(ship.telemetry.shields.thermal.restartRemainingSeconds, 2);
  close(ship.telemetry.shields.energyJ, 0);
  step(ship, 3);
  assert.equal(ship.telemetry.shields.active, true);
  ship.dispose();
});
void test('Shield health validates boundaries and configured output curve, including partial recharge supply and disposal', () => {
  assert.throws(() => make(290, profile, 10000, 101), /shieldHealthPoints/);
  assert.throws(() =>
    validateShieldProfile({
      ...profile.shields,
      health: { maxPoints: 0, outputExponent: 1 },
    }),
  );
  const equipment = {
    ...profile,
    power: { ...profile.power, reactorOutputW: 0 },
    shields: {
      ...profile.shields,
      health: { maxPoints: 100, outputExponent: 2 },
    },
  };
  const ship = make(290, equipment, 12, 50);
  ship.shields.requestEnabled(true);
  assert.throws(() => ship.shields.damage(-1));
  assert.throws(() => ship.shields.repair(Infinity));
  step(ship);
  close(ship.telemetry.shields.suppliedW, 12);
  close(ship.telemetry.shields.energyJ, 1.25);
  close(ship.telemetry.shields.protectionFraction, 0.25);
  close(ship.telemetry.shields.thermal.generatedHeatW, 8.95);
  step(ship);
  assert.equal(ship.telemetry.shields.active, false);
  close(ship.telemetry.shields.energyJ, 1.25);
  close(ship.telemetry.shields.protectionFraction, 0);
  ship.dispose();
  assert.throws(() => ship.shields.damage(1), /not attached/);
  assert.throws(() => ship.shields.repair(1), /not attached/);
});
