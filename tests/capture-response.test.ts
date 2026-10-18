import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CapturePlan,
  exampleCaptureProfile,
  validateCaptureProfile,
} from '../games/ship/CaptureResponse.js';
import { standardGravity } from '../apps/flight-foundry/FlightCurves.js';
const close = (a: number, b: number, tolerance = 1e-7) =>
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const referenceEntry =
  exampleCaptureProfile.assistedSpeedMps +
  exampleCaptureProfile.referenceExcessMps;
void test('Capture reference is a response anchor, not a Newtonian speed cap or a crew G clamp', () => {
  const reference = new CapturePlan(exampleCaptureProfile, referenceEntry);
  const fast = new CapturePlan(
    exampleCaptureProfile,
    exampleCaptureProfile.assistedSpeedMps +
      10 * exampleCaptureProfile.referenceExcessMps,
  );
  close(reference.durationSeconds, 4);
  close(
    reference.peakNominalCrewG,
    (((12000 / 4) * 2) / standardGravity) * 0.01,
  );
  close(fast.entrySpeedMps, 120800);
  close(fast.durationSeconds, 8);
  assert.ok(fast.curvePower > reference.curvePower);
  assert.ok(fast.peakNominalCrewG > reference.peakNominalCrewG * 5);
  close(fast.averageNominalCrewG / reference.averageNominalCrewG, 5);
  close(fast.at(fast.durationSeconds).speedMps, 800);
});
void test('Capture duration and steepness are independent profile controls with continuous anchor boundaries', () => {
  const entry = 24800;
  const base = new CapturePlan(exampleCaptureProfile, entry);
  const longer = new CapturePlan(
    { ...exampleCaptureProfile, durationGrowthExponent: 0.8 },
    entry,
  );
  const steeper = new CapturePlan(
    { ...exampleCaptureProfile, curvePowerGrowthPerDoubling: 1 },
    entry,
  );
  assert.ok(longer.durationSeconds > base.durationSeconds);
  close(longer.curvePower, base.curvePower);
  close(steeper.durationSeconds, base.durationSeconds);
  assert.ok(steeper.peakShipG > base.peakShipG);
  const below = new CapturePlan(exampleCaptureProfile, referenceEntry - 1e-6);
  const above = new CapturePlan(exampleCaptureProfile, referenceEntry + 1e-6);
  close(below.durationSeconds, above.durationSeconds);
  close(below.curvePower, above.curvePower);
  close(below.peakNominalCrewG, above.peakNominalCrewG);
});
void test('Capture removes exactly the excess speed; its analytical derivatives agree with motion', () => {
  for (const peakAt of ['start', 'end'] as const) {
    const plan = new CapturePlan({ ...exampleCaptureProfile, peakAt }, 50800);
    close(plan.at(0).speedMps, 50800);
    const end = plan.at(plan.durationSeconds);
    close(end.speedMps, 800);
    close(end.distanceM, plan.distanceM);
    assert.equal(end.complete, true);
    assert.equal(end.shipG, 0);
    const h = 1e-5;
    for (const fraction of [0.1, 0.5, 0.9]) {
      const t = fraction * plan.durationSeconds;
      const s = plan.at(t),
        a = plan.at(t - h),
        b = plan.at(t + h);
      close(
        (b.speedMps - a.speedMps) / (2 * h),
        s.requestedAccelerationMps2,
        1e-5,
      );
      close((b.distanceM - a.distanceM) / (2 * h), s.speedMps, 1e-4);
      close(s.nominalCrewG, s.shipG * 0.01);
    }
    // Midpoint quadrature checks total braking impulse, not just the endpoints.
    const count = 10000;
    let removed = 0;
    for (let i = 0; i < count; i++)
      removed -=
        (plan.at(((i + 0.5) * plan.durationSeconds) / count)
          .requestedAccelerationMps2 *
          plan.durationSeconds) /
        count;
    close(removed, plan.excessMps, 0.001);
  }
});
void test('Early/late bias has equal duration and peak but different braking distance', () => {
  const early = new CapturePlan(
    { ...exampleCaptureProfile, peakAt: 'start' },
    referenceEntry,
  );
  const late = new CapturePlan(exampleCaptureProfile, referenceEntry);
  close(early.durationSeconds, late.durationSeconds);
  close(early.peakShipG, late.peakShipG);
  assert.ok(early.distanceM < late.distanceM);
  assert.ok(early.at(2).speedMps < late.at(2).speedMps);
  close(early.at(0).shipG, early.peakShipG);
  close(late.at(0).shipG, 0);
});
void test('Capture does nothing at or below the assisted envelope and admits constant braking', () => {
  for (const speed of [0, 400, 800]) {
    const plan = new CapturePlan(exampleCaptureProfile, speed);
    close(plan.durationSeconds, 0);
    close(plan.at(0).speedMps, speed);
    close(plan.peakNominalCrewG, 0);
  }
  const linear = new CapturePlan(
    {
      ...exampleCaptureProfile,
      baseCurvePower: 1,
      curvePowerGrowthPerDoubling: 0,
    },
    referenceEntry,
  );
  close(linear.at(0).shipG, linear.averageShipG);
  close(linear.at(2).speedMps, 6800);
  const zeroTransmission = new CapturePlan(
    { ...exampleCaptureProfile, transmittedFraction: 0 },
    referenceEntry,
  );
  close(zeroTransmission.peakNominalCrewG, 0);
  assert.ok(zeroTransmission.peakShipG > 0);
});
void test('Capture validates public inputs and freezes the engagement profile', () => {
  const profile = { ...exampleCaptureProfile };
  const plan = new CapturePlan(profile, referenceEntry);
  profile.transmittedFraction = 1;
  close(plan.profile.transmittedFraction, 0.01);
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.profile));
  assert.ok(Object.isFrozen(plan.at(0)));
  for (const value of [
    null,
    {},
    { ...profile, unknown: 1 },
    { ...profile, referenceExcessMps: 0 },
    { ...profile, referenceDurationSeconds: 0 },
    { ...profile, durationGrowthExponent: Infinity },
    { ...profile, baseCurvePower: 0.5 },
    { ...profile, transmittedFraction: 1.1 },
    { ...profile, peakAt: 'middle' },
  ])
    assert.throws(() => validateCaptureProfile(value));
  assert.throws(() => new CapturePlan(profile, -1));
  assert.throws(() => new CapturePlan(profile, Infinity));
  assert.throws(() => plan.at(-1));
  assert.throws(() => plan.at(plan.durationSeconds + 1));
});
