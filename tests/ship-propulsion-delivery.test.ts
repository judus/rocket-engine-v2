import test from 'node:test';
import assert from 'node:assert/strict';
import { propulsionDelivery } from '../games/farwake/PropulsionDelivery.js';
import { Ship } from '../games/farwake/Ship.js';
import { starterSetup } from './helpers/shipSetup.js';

void test('Fully supplied propulsion retains exact assistance for sub-baseline rounding and small demands', () => {
  for (const demand of [5.6547216065365985e-9, 0.00001, 11.792237769011084]) {
    const baseline = 100_000_000;
    const delivery = propulsionDelivery(
      baseline + demand,
      baseline,
      0,
      demand,
      true,
      1,
    );
    assert.equal(delivery.rotationPowerFraction, 1);
    assert.equal(delivery.powerFraction, 1);
    assert.equal(delivery.rotationSuppliedW, demand);
  }
});

void test('A real propulsion shortage still funds rotation before translation', () => {
  const delivery = propulsionDelivery(150, 100, 80, 40, true, 1);
  assert.equal(delivery.rotationSuppliedW, 40);
  assert.equal(delivery.translationSuppliedW, 10);
  assert.equal(delivery.rotationPowerFraction, 1);
  assert.equal(delivery.translationPowerFraction, 0.125);
  assert.ok(delivery.powerFraction < 1);
  assert.equal(propulsionDelivery(99, 100, 0, 1, true, 1).powerFraction, 0);
});

void test('Powered starter dampers stay online through small turns and settling to rest', () => {
  const ship = new Ship(starterSetup.profile, starterSetup.initialState);
  ship.dampers.requestEnabled(true);
  ship.cooling.requestEnabled(true);
  try {
    for (let i = 0; i < 900; i++) {
      ship.control.turn(i >= 180 && i < 300 ? 0.01 : 0);
      ship.fixedUpdate(1 / 60, { dt: 1 / 60, tick: i, time: i / 60 });
      if (i >= 180) {
        assert.equal(ship.telemetry.dampers.state, 'online', `tick ${i}`);
        assert.equal(ship.telemetry.dampers.rotationPowerFraction, 1);
      }
    }
    assert.ok(Math.abs(ship.telemetry.body.yawRateRadps) < 1e-15);
  } finally {
    ship.dispose();
  }
});
