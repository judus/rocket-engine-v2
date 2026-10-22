import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shipPowerSystem,
  EnergyReserve,
  ShipModule,
  PowerLoad,
  ShipOwner,
  Reactor,
} from '../games/farwake/PowerLedger.js';
import { createPowerTrial } from '../examples/ship/PowerTrial.js';
import { CockpitSystemsPanel } from '../examples/webgl/CockpitSystemsPanel.js';

const close = (a: number, b: number, epsilon = 1e-6) =>
  assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);

void test('power integrates watts into joules, consumes reserve and preserves manual requests', () => {
  const p = createPowerTrial(),
    panel = new CockpitSystemsPanel(p);
  const reserve = p.world.get(p.ship, EnergyReserve)!;
  shipPowerSystem(p.world, 2);
  close(reserve.energyJ, 54e6);
  assert.equal(reserve.generationW, 2e6);
  assert.equal(reserve.consumptionW, 5e6);
  assert.equal(p.world.get(p.load, ShipModule)!.state, 'online');
  panel.toggleRow(3); // engine test load
  assert.equal(panel.requested('propulsion'), false);
  shipPowerSystem(p.world, 2);
  close(reserve.energyJ, 58e6);
  assert.equal(reserve.consumptionW, 0);
  assert.equal(p.world.get(p.load, ShipModule)!.state, 'off');
  panel.toggleRow(0); // reactor
  shipPowerSystem(p.world, 2);
  close(reserve.energyJ, 58e6);
  assert.equal(reserve.generationW, 0);
  panel.toggleRow(3);
  shipPowerSystem(p.world, 2);
  close(reserve.energyJ, 48e6);
  assert.equal(panel.requested('reactor'), false);
  assert.equal(panel.requested('propulsion'), true);
});

void test('full reserve rejects excess generation and energy ledger balances', () => {
  const p = createPowerTrial(),
    r = p.world.get(p.ship, EnergyReserve)!;
  p.world.get(p.load, ShipModule)!.requested = false;
  r.energyJ = 99e6;
  shipPowerSystem(p.world, 1);
  assert.equal(r.energyJ, 100e6);
  assert.equal(r.spillW, 1e6);
  close(99e6 + (r.generationW - r.consumptionW - r.spillW), r.energyJ);
  shipPowerSystem(p.world, 1);
  assert.equal(r.spillW, 2e6);
});

void test('depletion never creates negative energy, retains requested state and waits for recharge', () => {
  const p = createPowerTrial(),
    r = p.world.get(p.ship, EnergyReserve)!;
  const module = p.world.get(p.load, ShipModule)!,
    load = p.world.get(p.load, PowerLoad)!;
  r.energyJ = 1e6;
  shipPowerSystem(p.world, 1);
  assert.equal(r.energyJ, 0);
  assert.equal(load.suppliedW, 3e6); // final partial tick
  assert.equal(module.requested, true);
  assert.equal(module.state, 'waiting-for-charge');
  module.requested = false;
  shipPowerSystem(p.world, 1);
  assert.equal(module.state, 'off');
  module.requested = true;
  shipPowerSystem(p.world, 1);
  assert.equal(module.state, 'waiting-for-charge'); // toggling cannot bypass latch
  assert.equal(r.energyJ, 4e6);
  assert.equal(r.consumptionW, 0);
  shipPowerSystem(p.world, 2);
  assert.equal(module.state, 'waiting-for-charge');
  shipPowerSystem(p.world, 1);
  assert.equal(module.state, 'online');
  assert.equal(r.energyJ, 5e6);
  assert.equal(load.depleted, false);
});

void test('reactor off prevents blackout recovery; restoring supply resumes without losing requests', () => {
  const p = createPowerTrial(),
    r = p.world.get(p.ship, EnergyReserve)!;
  r.energyJ = 0;
  p.world.get(p.reactor, ShipModule)!.requested = false;
  shipPowerSystem(p.world, 1);
  shipPowerSystem(p.world, 5);
  assert.equal(r.energyJ, 0);
  assert.equal(p.world.get(p.load, ShipModule)!.state, 'waiting-for-charge');
  p.world.get(p.reactor, ShipModule)!.requested = true;
  for (let n = 0; n < 300; n++) shipPowerSystem(p.world, 1 / 60);
  assert.equal(p.world.get(p.load, ShipModule)!.requested, true);
  assert.ok(r.energyJ <= 10e6 && r.energyJ >= 0);
});

void test('fixed power results agree across step sizes before depletion; zero/invalid steps', () => {
  const a = createPowerTrial(),
    b = createPowerTrial();
  for (let n = 0; n < 600; n++) shipPowerSystem(a.world, 1 / 60);
  for (let n = 0; n < 1200; n++) shipPowerSystem(b.world, 1 / 120);
  close(a.world.get(a.ship, EnergyReserve)!.energyJ, 30e6);
  close(b.world.get(b.ship, EnergyReserve)!.energyJ, 30e6);
  const before = JSON.stringify(a.world.get(a.ship, EnergyReserve));
  shipPowerSystem(a.world, 0);
  assert.equal(JSON.stringify(a.world.get(a.ship, EnergyReserve)), before);
  for (const dt of [-1, NaN, Infinity])
    assert.throws(() => shipPowerSystem(a.world, dt), RangeError);
});

void test('ship ownership isolates reserves and sources; loads share a final partial tick fairly', () => {
  const p = createPowerTrial(),
    r = p.world.get(p.ship, EnergyReserve)!;
  const otherShip = p.world.create(),
    otherReactor = p.world.create(),
    secondLoad = p.world.create();
  p.world.set(otherShip, EnergyReserve, {
    capacityJ: 100,
    energyJ: 20,
    generationW: 0,
    consumptionW: 0,
    spillW: 0,
  });
  p.world.set(otherReactor, ShipOwner, otherShip);
  p.world.set(otherReactor, Reactor, { outputW: 10 });
  p.world.set(otherReactor, ShipModule, { requested: true, state: 'off' });
  p.world.set(secondLoad, ShipOwner, p.ship);
  p.world.set(secondLoad, ShipModule, { requested: true, state: 'off' });
  p.world.set(secondLoad, PowerLoad, {
    demandW: 5e6,
    restartEnergyJ: 10e6,
    depleted: false,
    suppliedW: 0,
  });
  r.energyJ = 2e6;
  shipPowerSystem(p.world, 1);
  close(r.energyJ, 0);
  assert.equal(p.world.get(p.load, PowerLoad)!.suppliedW, 2e6);
  assert.equal(p.world.get(secondLoad, PowerLoad)!.suppliedW, 2e6);
  assert.equal(p.world.get(otherShip, EnergyReserve)!.energyJ, 30);
});
