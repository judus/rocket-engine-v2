import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship } from '../games/ship/Ship.js';
import { CapturePlan } from '../games/ship/CaptureResponse.js';
import { validateDamperProfile } from '../games/ship/ShipProfiles.js';
import type { ShipProfile } from '../games/ship/ShipProfiles.js';
import { starterSetup } from './helpers/shipSetup.js';

const close = (a: number, b: number, tolerance = 1e-7) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function step(ship: Ship, dt = 1 / 60): void {
  ship.fixedUpdate(dt, {
    dt,
    tick: ship.telemetry.tick + 1,
    time: ship.telemetry.timeSeconds + dt,
  });
}
const funded: ShipProfile = {
  ...starterSetup.profile,
  body: { ...starterSetup.profile.body, massKg: 2, yawInertiaKgM2: 2 },
  power: {
    ...starterSetup.profile.power,
    thermal: {
      ...starterSetup.profile.power.thermal,
      manualStartSeconds: 0,
      wasteHeatFraction: 0,
    },
    capacityJ: 1e12,
    reactorOutputW: 1e9,
  },
  engine: {
    ...starterSetup.profile.engine,
    maxThrustN: 20,
    maxYawTorqueNm: 4,
    baselineW: 1,
    fullThrustW: 100,
    fullYawW: 20,
    restartEnergyJ: 10,
  },
  dampers: {
    ...starterSetup.profile.dampers,
    thermal: { ...starterSetup.profile.dampers.thermal, manualStartSeconds: 0 },
    baselineW: 1,
    wattsPerNewton: 0.1,
    wattsPerNewtonMeter: 0.1,
    restartEnergyJ: 10,
  },
};
function make(speed = 0, profile = funded, energyJ = 1e6): Ship {
  return new Ship(profile, {
    cargoPocketId: 'test-pocket',
    cargoTemperatureK: 290,
    cargoHealthPoints: 100,
    shieldHealthPoints: 100,
    damperHealthPoints: 100,
    coolingHealthPoints: 100,
    reactorHealthPoints: 100,
    engineHealthPoints: 100,
    shieldTemperatureK: 290,
    reactorTemperatureK: 290,
    damperTemperatureK: 293.15,
    engineTemperatureK: 293.15,
    energyJ,
    velocityMps: { x: 0, y: 0, z: speed },
  });
}
void test('Powered assistance approaches a bounded speed, stops drift/yaw, and disabling it preserves momentum', () => {
  const ship = make();
  ship.dampers.requestEnabled(true);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  for (let i = 0; i < 180; i++) step(ship);
  close(ship.telemetry.body.velocityMps.z, 300 * (1 - Math.exp(-3)));
  assert.equal(ship.telemetry.dampers.mode, 'assisted');
  for (let i = 0; i < 720; i++) step(ship);
  assert.ok(ship.telemetry.body.velocityMps.z <= 300);
  close(ship.telemetry.body.velocityMps.z, 300, 0.001);
  ship.control.clear();
  const v = ship.telemetry.body.velocityMps.z;
  for (let i = 0; i < 180; i++) step(ship);
  close(ship.telemetry.body.velocityMps.z, v * Math.exp(-3));
  ship.control.turn(1);
  for (let i = 0; i < 180; i++) step(ship);
  close(
    ship.telemetry.body.yawRateRadps,
    funded.dampers.maxYawAccelerationRadps2 * 3,
  );
  ship.control.clear();
  const omega = ship.telemetry.body.yawRateRadps;
  for (let i = 0; i < 180; i++) step(ship);
  close(ship.telemetry.body.yawRateRadps, omega * Math.exp(-3));
  ship.dampers.requestEnabled(false);
  const before = ship.telemetry.body;
  step(ship);
  assert.deepEqual(ship.telemetry.body.velocityMps, before.velocityMps);
  close(ship.telemetry.body.yawRateRadps, before.yawRateRadps);
  assert.equal(ship.telemetry.dampers.demandW, 0);
  assert.equal(ship.telemetry.dampers.transmittedFraction, 1);
  ship.dispose();
});
void test('Assisted diagonal commands stay normalized and heading redirects new assistance, not existing velocity', () => {
  const ship = make();
  ship.dampers.requestEnabled(true);
  ship.control.thrust({ x: 1, y: 1, z: 1 });
  for (let i = 0; i < 180; i++) step(ship);
  close(
    Math.hypot(...Object.values(ship.telemetry.body.velocityMps)),
    300 * (1 - Math.exp(-3)),
  );
  ship.control.clear();
  ship.control.turn(1);
  step(ship, 1);
  assert.ok(ship.telemetry.body.yawRadians > 0);
  const before = ship.telemetry.body.velocityMps;
  const heading = ship.telemetry.body.yawRadians;
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  step(ship);
  const gain = 1 - Math.exp(-1 / 60);
  close(
    ship.telemetry.body.velocityMps.x,
    before.x * (1 - gain) + 300 * Math.sin(heading) * gain,
  );
  assert.ok(ship.telemetry.body.velocityMps.x !== 0);
  ship.dispose();
});
void test('High-speed engagement follows the immutable capture plan through force integration, then obeys commands', () => {
  const ship = make(12300);
  ship.engine.requestEnabled(false);
  ship.dampers.requestEnabled(true);
  const plan = new CapturePlan(funded.dampers.capture, 12300);
  for (let i = 1; i <= 240; i++) {
    step(ship);
    close(
      ship.telemetry.body.velocityMps.z,
      plan.at(Math.min(i / 60, plan.durationSeconds)).speedMps,
      1e-6,
    );
    close(ship.telemetry.crewG, ship.telemetry.shipG * 0.01);
  }
  close(ship.telemetry.body.velocityMps.z, 300, 1e-6);
  step(ship);
  step(ship);
  assert.equal(ship.telemetry.dampers.mode, 'assisted');
  assert.ok(ship.telemetry.body.velocityMps.z < 300);
  ship.dispose();
});
void test('Tenfold excess speed increases capture duration twofold and increases actual peak crew G without clamping', () => {
  const slow = make(12300),
    fast = make(120300);
  for (const ship of [slow, fast]) {
    ship.engine.requestEnabled(false);
    ship.dampers.requestEnabled(true);
  }
  let slowPeak = 0,
    fastPeak = 0;
  for (let i = 0; i < 480; i++) {
    if (i < 240) {
      step(slow);
      slowPeak = Math.max(slowPeak, slow.telemetry.crewG);
    }
    step(fast);
    fastPeak = Math.max(fastPeak, fast.telemetry.crewG);
    if (i === 0) {
      close(slow.telemetry.dampers.captureDurationSeconds, 4);
      close(fast.telemetry.dampers.captureDurationSeconds, 8);
    }
  }
  assert.ok(slowPeak > 6 && slowPeak < 6.2);
  assert.ok(fastPeak > 40 && fastPeak < 42);
  close(fast.telemetry.body.velocityMps.z, 300, 1e-6);
  slow.dispose();
  fast.dispose();
});
void test('Partial power scales braking and protection; depletion coasts, recovery retains the requested switch', () => {
  const profile = { ...funded, power: { ...funded.power, reactorOutputW: 0 } };
  const full = make(100, profile),
    limited = make(100, profile, 7);
  for (const ship of [full, limited]) {
    ship.engine.requestEnabled(false);
    ship.dampers.requestEnabled(true);
    step(ship, 1);
  }
  const t = limited.telemetry;
  assert.equal(t.dampers.state, 'limited');
  assert.ok(t.dampers.activityFraction > 0 && t.dampers.activityFraction < 1);
  close(
    t.dampers.worldForceN.z,
    full.telemetry.dampers.worldForceN.z * t.dampers.activityFraction,
  );
  close(t.crewG, t.shipG * (1 - 0.99 * t.dampers.activityFraction));
  close(t.power.energyJ, 0);
  const v = t.body.velocityMps.z;
  step(limited, 1);
  close(limited.telemetry.body.velocityMps.z, v);
  close(limited.telemetry.worldForceN.z, 0);
  assert.equal(limited.telemetry.dampers.state, 'waiting-for-charge');
  assert.equal(limited.telemetry.dampers.requested, true);
  const recovery = make(
    100,
    { ...funded, power: { ...funded.power, reactorOutputW: 50 } },
    0,
  );
  recovery.engine.requestEnabled(false);
  recovery.dampers.requestEnabled(true);
  step(recovery, 1);
  step(recovery, 1);
  assert.equal(recovery.telemetry.dampers.state, 'online');
  assert.ok(recovery.telemetry.body.velocityMps.z < 100);
  full.dispose();
  limited.dispose();
  recovery.dispose();
});
void test('Unpowered engine cannot obtain propulsion from dampers, but powered dampers can still arrest drift', () => {
  const ship = make(100);
  ship.engine.requestEnabled(false);
  ship.dampers.requestEnabled(true);
  ship.control.thrust({ x: 1, y: 0, z: 0 });
  ship.control.turn(1);
  step(ship, 1);
  close(ship.telemetry.body.velocityMps.x, 0);
  close(ship.telemetry.body.yawRateRadps, 0);
  assert.ok(ship.telemetry.body.velocityMps.z < 100);
  ship.dispose();
  const starved = make(
    0,
    {
      ...funded,
      engine: { ...funded.engine, baselineW: 1e12 },
      power: { ...funded.power, reactorOutputW: 0 },
    },
    100,
  );
  starved.dampers.requestEnabled(true);
  starved.control.thrust({ x: 0, y: 0, z: 1 });
  step(starved, 1);
  close(starved.telemetry.engine.activityFraction, 0);
  close(starved.telemetry.body.velocityMps.z, 0);
  starved.dispose();
});
void test('Engine and dampers share one conserved power ledger; disposed ships leave independent bodies untouched', () => {
  const first = make(),
    second = make();
  first.dampers.requestEnabled(true);
  first.control.thrust({ x: 0, y: 0, z: 1 });
  step(first);
  const t = first.telemetry;
  close(t.power.consumptionW, t.engine.suppliedW + t.dampers.suppliedW);
  close(
    t.power.energyJ,
    1e6 + (t.power.generationW - t.power.consumptionW) / 60,
    0.001,
  );
  assert.ok(Object.isFrozen(t.dampers.worldForceN));
  first.dispose();
  first.dispose();
  step(first);
  step(second);
  assert.equal(first.telemetry, t);
  close(second.telemetry.body.velocityMps.z, 0);
  assert.equal(second.telemetry.dampers.requested, false);
  second.dispose();
});
void test('Damper profiles reject malformed protection and impossible restart thresholds', () => {
  assert.throws(() =>
    validateDamperProfile({ ...funded.dampers, responseSeconds: 0 }),
  );
  assert.throws(() =>
    validateDamperProfile({ ...funded.dampers, wattsPerNewton: '100' }),
  );
  assert.throws(() =>
    validateDamperProfile({
      ...funded.dampers,
      capture: { ...funded.dampers.capture, transmittedFraction: 2 },
    }),
  );
  assert.throws(
    () =>
      new Ship(
        { ...funded, dampers: { ...funded.dampers, restartEnergyJ: 1e13 } },
        {
          cargoPocketId: 'test-pocket',
          cargoTemperatureK: 290,
          cargoHealthPoints: 100,
          shieldHealthPoints: 100,
          damperHealthPoints: 100,
          coolingHealthPoints: 100,
          reactorHealthPoints: 100,
          engineHealthPoints: 100,
          shieldTemperatureK: 290,
          reactorTemperatureK: 290,
          damperTemperatureK: 293.15,
          engineTemperatureK: 293.15,
          energyJ: 0,
          velocityMps: { x: 0, y: 0, z: 0 },
        },
      ),
  );
  const ship = make();
  assert.throws(() => ship.dampers.requestEnabled(1 as unknown as boolean));
  ship.dispose();
});

void test('Interrupted capture preserves actual momentum and recovery captures from current speed', () => {
  const ship = make(12300, funded, 100);
  ship.power.requestEnabled(false);
  ship.engine.requestEnabled(false);
  ship.dampers.requestEnabled(true);
  step(ship, 1);
  assert.equal(ship.telemetry.dampers.state, 'limited');
  assert.ok(ship.telemetry.body.velocityMps.z > 300);
  const v = ship.telemetry.body.velocityMps.z;
  step(ship, 1);
  close(ship.telemetry.body.velocityMps.z, v);
  assert.equal(ship.telemetry.dampers.mode, 'coast');
  ship.power.requestEnabled(true);
  let recoveryTicks = 0;
  while (ship.telemetry.power.emergency) {
    step(ship, 1);
    if (++recoveryTicks > 600)
      assert.fail('Emergency reserve recovery did not finish');
  }
  step(ship, 1); // restored propulsion replans from current velocity
  assert.equal(ship.telemetry.dampers.state, 'online');
  assert.equal(ship.telemetry.dampers.mode, 'capture');
  close(ship.telemetry.dampers.captureElapsedSeconds, 1);
  const newPlan = new CapturePlan(funded.dampers.capture, v);
  close(ship.telemetry.body.velocityMps.z, newPlan.at(1).speedMps);
  ship.dampers.requestEnabled(false);
  const after = ship.telemetry.body.velocityMps;
  step(ship, 1);
  assert.deepEqual(ship.telemetry.body.velocityMps, after);
  ship.dispose();
});

const captureFunded: ShipProfile = {
  ...funded,
  engine: {
    ...funded.engine,
    thermal: {
      ...funded.engine.thermal,
      manualStartSeconds: 0,
      wasteHeatFraction: 0,
    },
  },
  dampers: {
    ...funded.dampers,
    thermal: { ...funded.dampers.thermal, wasteHeatFraction: 0 },
  },
};
for (const dt of [1, 1 / 60]) {
  void test(`Damaged capture completes at the physical endpoint with no pilot thrust leakage at dt=${dt}`, () => {
    for (const thrust of [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: -1 },
    ]) {
      const ship = make(12300, captureFunded);
      ship.dampers.damage(50);
      ship.dampers.requestEnabled(true);
      ship.control.thrust(thrust);
      const intent = ship.control.intent;
      let finished = false;
      for (let i = 0; i < 3000; i++) {
        const before = ship.telemetry.body.velocityMps.z;
        step(ship, dt);
        const t = ship.telemetry;
        if (t.dampers.mode === 'assisted') {
          assert.ok(before <= 300 + 1e-6, `Early handover at ${before}`);
          assert.ok(t.engine.demandW > captureFunded.engine.baselineW);
          finished = true;
          break;
        }
        assert.equal(t.dampers.mode, 'capture');
        assert.deepEqual(t.engine.thrustN, { x: 0, y: 0, z: 0 });
        close(t.engine.demandW, captureFunded.engine.baselineW);
        close(t.body.velocityMps.x, 0);
        assert.ok(t.body.velocityMps.z >= 300 - 1e-6);
        assert.ok(t.body.velocityMps.z <= before);
        assert.ok(
          t.dampers.captureElapsedSeconds <= t.dampers.captureDurationSeconds,
        );
        assert.deepEqual(ship.control.intent, intent);
      }
      assert.ok(finished, 'Capture never completed');
      ship.dispose();
    }
  });
}
void test('Capture retains rotation controls and raw translation intent; disabling releases translation', () => {
  const ship = make(12300, captureFunded);
  ship.dampers.damage(50);
  ship.dampers.requestEnabled(true);
  ship.control.thrust({ x: 1, y: 0, z: 0 });
  ship.control.turn(1);
  ship.control.pitch(1);
  ship.control.roll(1);
  step(ship);
  assert.equal(ship.telemetry.dampers.mode, 'capture');
  assert.ok(ship.telemetry.dampers.rotationActivityFraction > 0);
  close(ship.telemetry.dampers.translationActivityFraction, 0);
  close(ship.telemetry.dampers.captureElapsedSeconds, 0);
  close(ship.telemetry.body.velocityMps.z, 12300);
  assert.ok(ship.telemetry.body.yawRateRadps > 0);
  assert.ok(ship.telemetry.body.pitchRateRadps > 0);
  assert.ok(ship.telemetry.body.rollRateRadps > 0);
  close(
    ship.telemetry.engine.demandW,
    captureFunded.engine.baselineW +
      captureFunded.engine.fullYawW +
      captureFunded.engine.fullPitchW +
      captureFunded.engine.fullRollW,
  );
  close(ship.telemetry.body.velocityMps.x, 0);
  ship.dampers.requestEnabled(false);
  step(ship);
  assert.equal(ship.telemetry.dampers.mode, 'coast');
  assert.ok(ship.telemetry.engine.translationDemandW > 0);
  // Translation is admitted, but the held high-cost rotation commands own
  // the available engine budget first. Releasing them makes thrust available.
  close(ship.telemetry.engine.thrustN.x, 0);
  ship.control.turn(0);
  ship.control.pitch(0);
  ship.control.roll(0);
  step(ship);
  assert.ok(ship.telemetry.engine.thrustN.x > 0);
  ship.dispose();
});
void test('Changing partial power cannot advance capture past its physical endpoint', () => {
  const profile = {
    ...captureFunded,
    power: { ...captureFunded.power, reactorOutputW: 100 },
  };
  const ship = make(12300, profile, 0);
  ship.engine.requestEnabled(false);
  ship.dampers.requestEnabled(true);
  let partial = false,
    complete = false;
  for (let i = 0; i < 6000; i++) {
    if (i === 30) ship.dampers.damage(50);
    if (i === 60) ship.dampers.repair(50);
    const before = ship.telemetry.body.velocityMps.z;
    step(ship);
    const t = ship.telemetry;
    partial ||= t.dampers.powerFraction > 0 && t.dampers.powerFraction < 1;
    if (t.dampers.mode === 'assisted') {
      assert.ok(before <= 300 + 1e-6);
      complete = true;
      break;
    }
    assert.ok(t.body.velocityMps.z <= before);
    assert.ok(t.body.velocityMps.z >= 300 - 1e-6);
  }
  assert.ok(partial);
  assert.ok(complete);
  ship.dispose();
});

void test('Zero-service capture coasts without translational demand; disabling admits held thrust', () => {
  const ship = make(
    12300,
    { ...captureFunded, power: { ...captureFunded.power, reactorOutputW: 0 } },
    0,
  );
  ship.dampers.requestEnabled(true);
  ship.control.thrust({ x: 1, y: 0, z: 0 });
  for (let i = 0; i < 3; i++) {
    step(ship);
    assert.equal(ship.telemetry.dampers.mode, 'coast');
    assert.deepEqual(ship.telemetry.body.velocityMps, { x: 0, y: 0, z: 12300 });
    close(ship.telemetry.engine.demandW, captureFunded.engine.baselineW);
  }
  ship.dampers.requestEnabled(false);
  step(ship);
  close(
    ship.telemetry.engine.demandW,
    captureFunded.engine.baselineW + captureFunded.engine.fullThrustW,
  );
  ship.dispose();
});
