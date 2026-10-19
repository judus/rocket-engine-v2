import test from 'node:test';
import assert from 'node:assert/strict';
import { ShipBody } from '../games/ship/ShipBody.js';
import { Ship } from '../games/ship/Ship.js';
import { ShipNavigation } from '../games/ship/ShipNavigation.js';
import {
  validateBodyProfile,
  validateEngineProfile,
  validateDamperProfile,
} from '../games/ship/ShipProfiles.js';
import { starterSetup } from './helpers/shipSetup.js';
const zero = { x: 0, y: 0, z: 0 };
const bodyProfile = {
  id: 'rotation-body',
  massKg: 10,
  pitchInertiaKgM2: 2,
  yawInertiaKgM2: 2,
  rollInertiaKgM2: 2,
};
const close = (a: number, b: number, tolerance = 1e-8) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
function step(ship: Ship, count = 1, dt = 1 / 60) {
  for (let i = 0; i < count; i++)
    ship.fixedUpdate(dt, {
      dt,
      tick: ship.telemetry.tick + 1,
      time: ship.telemetry.timeSeconds + dt,
    });
}
const profile = {
  ...starterSetup.profile,
  body: {
    ...bodyProfile,
    pitchInertiaKgM2: 10,
    yawInertiaKgM2: 10,
    rollInertiaKgM2: 10,
  },
  power: {
    ...starterSetup.profile.power,
    reactorOutputW: 1e6,
    thermal: {
      ...starterSetup.profile.power.thermal,
      manualStartSeconds: 0,
      wasteHeatFraction: 0,
    },
  },
  engine: {
    ...starterSetup.profile.engine,
    maxThrustN: 20,
    maxYawTorqueNm: 2,
    maxPitchTorqueNm: 2,
    maxRollTorqueNm: 2,
    baselineW: 1,
    fullThrustW: 100,
    fullYawW: 10,
    fullPitchW: 10,
    fullRollW: 10,
    restartEnergyJ: 0,
    thermal: {
      ...starterSetup.profile.engine.thermal,
      manualStartSeconds: 0,
      wasteHeatFraction: 0.1,
    },
  },
  dampers: {
    ...starterSetup.profile.dampers,
    maxYawRateRadps: 0.6,
    maxPitchRateRadps: 0.4,
    maxRollRateRadps: 0.8,
    baselineW: 1,
    wattsPerNewton: 0.1,
    wattsPerNewtonMeter: 0.1,
    restartEnergyJ: 0,
    thermal: {
      ...starterSetup.profile.dampers.thermal,
      manualStartSeconds: 0,
      wasteHeatFraction: 0,
    },
  },
};
void test('Pitch lifts the nose, roll banks right, and all axes transform and invert world vectors', () => {
  const pitched = new ShipBody(bodyProfile);
  pitched.advance(zero, { x: -2 * Math.PI, y: 0, z: 0 }, 1);
  close(pitched.localToWorld({ x: 0, y: 0, z: 1 }).y, 1);
  close(pitched.telemetry.pitchRadians, Math.PI / 2);
  const rolled = new ShipBody(bodyProfile);
  rolled.advance(zero, { x: 0, y: 0, z: -2 * Math.PI }, 1);
  close(rolled.localToWorld({ x: 1, y: 0, z: 0 }).y, -1);
  close(rolled.telemetry.rollRadians, Math.PI / 2);
  const v = { x: 3, y: -7, z: 8 },
    back = pitched.worldToLocal(pitched.localToWorld(v));
  for (const axis of ['x', 'y', 'z'] as const) close(back[axis], v[axis]);
});
void test('Quaternion orientation stays normalized through repeated loops; coasting preserves world translation', () => {
  const body = new ShipBody(bodyProfile, { x: 3, y: 4, z: 5 });
  body.advance(zero, { x: -4, y: 0, z: 0 }, 1);
  let lowest = 1,
    highest = -1;
  for (let i = 0; i < 2000; i++) {
    body.advance(zero, zero, 0.01);
    const y = body.localToWorld({ x: 0, y: 0, z: 1 }).y;
    lowest = Math.min(lowest, y);
    highest = Math.max(highest, y);
  }
  const t = body.telemetry;
  close(
    Math.hypot(
      t.orientation.x,
      t.orientation.y,
      t.orientation.z,
      t.orientation.w,
    ),
    1,
  );
  close(t.pitchRateRadps, 2);
  assert.ok(lowest < -0.99 && highest > 0.99);
  assert.deepEqual(t.velocityMps, { x: 3, y: 4, z: 5 });
  assert.ok(Object.isFrozen(t.orientation));
});
void test('Asymmetric free rotation approximately conserves world angular momentum under the midpoint integrator', () => {
  const body = new ShipBody({
    ...bodyProfile,
    pitchInertiaKgM2: 2,
    yawInertiaKgM2: 3,
    rollInertiaKgM2: 4,
  });
  body.advance(zero, { x: 3, y: 4, z: 5 }, 0.1);
  const momentum = () => {
    const w = body.telemetry.angularVelocityRadps;
    return body.localToWorld({ x: w.x * 2, y: w.y * 3, z: w.z * 4 });
  };
  const before = momentum();
  for (let i = 0; i < 2000; i++) body.advance(zero, zero, 0.001);
  const after = momentum();
  for (const axis of ['x', 'y', 'z'] as const)
    close(after[axis], before[axis], 1e-5);
});
void test('Assisted flight controls and brakes pitch, yaw and roll; disabling assistance preserves angular momentum', () => {
  const ship = new Ship(profile, starterSetup.initialState);
  ship.dampers.requestEnabled(true);
  ship.control.turn(0.5);
  ship.control.pitch(1);
  ship.control.roll(-1);
  step(ship, 180);
  const a = ship.telemetry.body;
  close(a.yawRateRadps, 0.3 * (1 - Math.exp(-3)));
  close(a.pitchRateRadps, 0.4 * (1 - Math.exp(-3)));
  close(a.rollRateRadps, -0.8 * (1 - Math.exp(-3)));
  ship.control.clear();
  step(ship, 180);
  close(ship.telemetry.body.pitchRateRadps, a.pitchRateRadps * Math.exp(-3));
  close(ship.telemetry.body.rollRateRadps, a.rollRateRadps * Math.exp(-3));
  ship.dampers.requestEnabled(false);
  ship.engine.requestEnabled(false);
  const before = ship.telemetry.body.angularVelocityRadps;
  step(ship, 60);
  assert.deepEqual(ship.telemetry.body.angularVelocityRadps, before);
  assert.equal(ship.computer.telemetry.tick, ship.telemetry.tick);
  ship.dispose();
});
void test('Combined rotation shares one power/health allocation and heat debit; a failed engine adds no torque', () => {
  const ship = new Ship(
    { ...profile, power: { ...profile.power, reactorOutputW: 0 } },
    { ...starterSetup.initialState, energyJ: 20 },
  );
  ship.control.turn(1);
  ship.control.pitch(1);
  ship.control.roll(1);
  ship.engine.damage(50);
  step(ship, 1, 1);
  const t = ship.telemetry;
  close(t.engine.demandW, 31);
  close(t.engine.suppliedW, 20);
  const fraction = (19 / 30) * 0.5;
  close(t.engine.yawTorqueNm, 2 * fraction);
  close(t.engine.pitchTorqueNm, 2 * fraction);
  close(t.engine.rollTorqueNm, 2 * fraction);
  close(t.engine.thermal.generatedHeatW, 2);
  close(t.power.energyJ, 0);
  const before = t.body.angularVelocityRadps;
  ship.engine.damage(50);
  step(ship, 1, 1);
  close(ship.telemetry.engine.pitchTorqueNm, 0);
  close(ship.telemetry.engine.rollTorqueNm, 0);
  assert.deepEqual(ship.telemetry.body.angularVelocityRadps, before);
  ship.dispose();
});
void test('Navigation guidance uses pitch and roll rather than only horizontal yaw', () => {
  const pitched = new ShipBody(bodyProfile);
  pitched.advance(zero, { x: -2 * Math.PI, y: 0, z: 0 }, 1);
  const contact = {
    id: 'above',
    label: 'Above',
    positionM: { x: 0, y: 1000, z: 0 },
    arrivalRadiusM: 1,
  };
  const nav = new ShipNavigation(pitched, [contact]);
  nav.selectDestination('above');
  nav.commit();
  close(nav.telemetry.destination!.relativeBearingDegrees, 0);
  close(nav.telemetry.destination!.elevationDegrees, 0);
  const rolled = new ShipBody(bodyProfile);
  rolled.advance(zero, { x: 0, y: 0, z: -2 * Math.PI }, 1);
  const banked = new ShipNavigation(rolled, [contact]);
  banked.selectDestination('above');
  banked.commit();
  close(banked.telemetry.destination!.relativeBearingDegrees, -90);
  close(banked.telemetry.destination!.elevationDegrees, 0);
});
void test('New axis commands and required profile parameters reject invalid inputs', () => {
  const ship = new Ship(profile, starterSetup.initialState);
  assert.throws(() => ship.control.pitch(NaN));
  assert.throws(() => ship.control.roll(2));
  assert.throws(() =>
    validateBodyProfile({ ...bodyProfile, rollInertiaKgM2: 0 }),
  );
  assert.throws(() =>
    validateEngineProfile({ ...profile.engine, maxPitchTorqueNm: -1 }),
  );
  assert.throws(() =>
    validateDamperProfile({ ...profile.dampers, maxRollRateRadps: 11 }),
  );
  ship.control.pitch(0.5);
  ship.control.roll(-0.5);
  ship.control.clear();
  assert.equal(ship.control.intent.pitch, 0);
  assert.equal(ship.control.intent.roll, 0);
  ship.dispose();
});

void test('Asymmetric torque-free motion stays bounded for ten simulated minutes at 60/120 Hz', () => {
  for (const hz of [60, 120]) {
    const body = new ShipBody({
      ...bodyProfile,
      pitchInertiaKgM2: 2,
      yawInertiaKgM2: 3,
      rollInertiaKgM2: 4,
    });
    body.advance(zero, { x: 3, y: 4, z: 5 }, 0.1);
    const momentum = () => {
      const w = body.telemetry.angularVelocityRadps;
      return body.localToWorld({ x: w.x * 2, y: w.y * 3, z: w.z * 4 });
    };
    const energy = () => {
      const w = body.telemetry.angularVelocityRadps;
      return (2 * w.x ** 2 + 3 * w.y ** 2 + 4 * w.z ** 2) / 2;
    };
    const initial = momentum(),
      initialEnergy = energy();
    const scale = Math.hypot(initial.x, initial.y, initial.z);
    for (let i = 0; i < 600 * hz; i++) {
      body.advance(zero, zero, 1 / hz);
      if (i % hz === 0) {
        const current = momentum();
        assert.ok(
          Math.hypot(
            current.x - initial.x,
            current.y - initial.y,
            current.z - initial.z,
          ) /
            scale <
            0.0001,
        );
        assert.ok(Math.abs(energy() / initialEnergy - 1) < 0.0001);
      }
    }
  }
});
void test('Simultaneous thrust and three-axis rotation converge as the fixed step shrinks', () => {
  const simulate = (hz: number) => {
    const ship = new Ship(profile, starterSetup.initialState);
    ship.control.thrust({ x: 0.2, y: 0.1, z: 1 });
    ship.control.turn(0.4);
    ship.control.pitch(0.3);
    ship.control.roll(-0.2);
    step(ship, 4 * hz, 1 / hz);
    const t = ship.telemetry.body;
    assert.equal(ship.telemetry.engine.activityFraction, 1);
    ship.dispose();
    return t;
  };
  const reference = simulate(960);
  const error = (t: ReturnType<typeof simulate>) =>
    Math.hypot(
      t.positionM.x - reference.positionM.x,
      t.positionM.y - reference.positionM.y,
      t.positionM.z - reference.positionM.z,
      t.velocityMps.x - reference.velocityMps.x,
      t.velocityMps.y - reference.velocityMps.y,
      t.velocityMps.z - reference.velocityMps.z,
    );
  const coarse = error(simulate(30)),
    normal = error(simulate(60)),
    fine = error(simulate(120));
  assert.ok(normal < coarse * 0.65, `${normal} >= ${coarse} * 0.65`);
  assert.ok(fine < normal * 0.65, `${fine} >= ${normal} * 0.65`);
});
