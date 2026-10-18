import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FoundryShip,
  baseline,
  duration,
  parseExperiment,
  serializeExperiment,
  validateProfile,
} from '../apps/flight-foundry/MotionExperiment.js';
import type { ExperimentProfile } from '../apps/flight-foundry/MotionExperiment.js';
import { FixedClock } from '../src/FixedClock.js';

function close(actual: number, expected: number, tolerance = 1e-7): void {
  assert.ok(
    Math.abs(actual - expected) < tolerance,
    `${actual} != ${expected}`,
  );
}
function run(overrides: Partial<ExperimentProfile> = {}) {
  const profile = validateProfile({ ...baseline, ...overrides });
  const ship = new FoundryShip(profile);
  let tick = 0;
  while (ship.telemetry.phase !== 'complete') {
    tick++;
    const dt = profile.stepSeconds;
    ship.fixedUpdate(dt, { dt, tick, time: tick * dt });
    assert.ok(tick < 400_000);
  }
  const sample = ship.telemetry;
  ship.dispose();
  return sample;
}
void test('Foundry constant force uses SI mass, force and exact constant-acceleration displacement', () => {
  const s = run({
    massKg: 100,
    thrustN: 200,
    burnSeconds: 3,
    coastSeconds: 0,
    brakeSeconds: 0,
  });
  close(s.velocityMps, 6);
  close(s.positionM, 9);
  close(s.forceN, 200);
  close(s.accelerationMps2, 2);
  close(s.g, 2 / 9.80665);
  close(s.kineticJ, 1800);
});
void test('Foundry burn/coast/counter-thrust preserves momentum and returns to zero without drag', () => {
  const s = run();
  close(s.velocityMps, 0);
  close(s.positionM, 1500);
  close(s.distanceM, 1500);
  close(s.timeSeconds, duration(baseline));
  assert.equal(s.tick, 3000);
  const coast = run({
    initialVelocityMps: 50_000,
    burnSeconds: 0,
    coastSeconds: 120,
    brakeSeconds: 0,
  });
  close(coast.velocityMps, 50_000);
  close(coast.positionM, 6_000_000, 1e-4);
  close(coast.forceN, 0);
});
void test('Foundry counter-thrust can reverse; path length accounts for crossing zero inside a tick', () => {
  const s = run({
    massKg: 1,
    thrustN: 10,
    initialVelocityMps: 10,
    burnSeconds: 0,
    coastSeconds: 0,
    brakeSeconds: 2,
    stepSeconds: 0.06,
  });
  close(s.velocityMps, -10);
  close(s.positionM, 0);
  close(s.distanceM, 10);
});
void test('Foundry phase boundaries and final partial step agree across timesteps', () => {
  const p = {
    initialVelocityMps: -7,
    burnSeconds: 0.37,
    coastSeconds: 0.19,
    brakeSeconds: 0.41,
  };
  const slow = run({ ...p, stepSeconds: 1 / 15 });
  const fast = run({ ...p, stepSeconds: 0.001 });
  close(slow.timeSeconds, 0.97);
  close(slow.velocityMps, -7.4);
  close(slow.velocityMps, fast.velocityMps);
  close(slow.positionM, fast.positionM);
  close(slow.distanceM, fast.distanceM);
});
void test('Foundry same fixed scenario replays independently of display cadence', () => {
  const replay = (fps: number) => {
    const p = validateProfile({ ...baseline, stepSeconds: 0.01 });
    const clock = new FixedClock({ step: p.stepSeconds, maxSteps: 100 });
    const ship = new FoundryShip(p);
    for (let frame = 0; frame < fps * 25; frame++) {
      const count = clock.begin(1 / fps);
      for (let i = 0; i < count; i++) {
        const tick = clock.next();
        ship.fixedUpdate(tick.dt, tick);
      }
    }
    const sample = ship.telemetry;
    ship.dispose();
    return sample;
  };
  assert.deepEqual(replay(30), replay(144));
  assert.deepEqual(run(), run());
});
void test('Foundry observations remain immutable and attached simulation stops on entity disposal', () => {
  const p = validateProfile(baseline);
  const ship = new FoundryShip(p);
  const before = ship.telemetry;
  ship.fixedUpdate(0.1, { dt: 0.1, time: 0.1, tick: 1 });
  assert.equal(before.timeSeconds, 0);
  assert.ok(Object.isFrozen(ship.telemetry));
  const after = ship.telemetry;
  ship.dispose();
  ship.fixedUpdate(0.1, { dt: 0.1, time: 0.2, tick: 2 });
  assert.equal(ship.telemetry, after);
});
void test('Foundry experiment documents round-trip exact initial conditions and reject invalid persisted input', () => {
  assert.deepEqual(parseExperiment(serializeExperiment(baseline)), baseline);
  for (const value of [
    null,
    [],
    { ...baseline, massKg: 0 },
    { ...baseline, thrustN: -1 },
    { ...baseline, massKg: Infinity },
    { ...baseline, stepSeconds: 0 },
    { ...baseline, burnSeconds: 0, coastSeconds: 0, brakeSeconds: 0 },
    { ...baseline, unknown: 1 },
  ])
    assert.throws(() => validateProfile(value));
  assert.throws(() => parseExperiment('{"version":2,"profile":{}}'));
  assert.throws(() =>
    parseExperiment('{"version":1,"profile":{},"extra":true}'),
  );
  assert.throws(() => parseExperiment('broken'));
  assert.equal(run({ thrustN: 0, initialVelocityMps: -3 }).velocityMps, -3);
});
