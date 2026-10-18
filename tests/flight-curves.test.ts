import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultCurves,
  FlightCurves,
  standardGravity,
  validateCurves,
} from '../apps/flight-foundry/FlightCurves.js';

function close(a: number, b: number, tolerance = 1e-8): void {
  assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
}
void test('Flight curves derive acceleration and protection from speed and chosen duration', () => {
  const curve = new FlightCurves(defaultCurves);
  close(curve.totalSeconds, 8);
  close(curve.totalDistanceM, 3200);
  const midpoint = curve.at(2);
  close(midpoint.speedMps, 400);
  close(midpoint.positionM, 400);
  close(midpoint.accelerationMps2, 200);
  close(midpoint.shipG, 200 / standardGravity);
  close(midpoint.idealCrewG, 2);
  close(midpoint.suppressionPercent, 90.19335);
  close(midpoint.cancelledG + midpoint.idealCrewG, midpoint.shipG);
  close(curve.at(6).accelerationMps2, -200);
  close(curve.at(8).speedMps, 0);
  close(curve.at(8).shipG, 0);
});
void test('Early and late curves preserve arrival speeds and duration while changing peak load and distance', () => {
  const early = new FlightCurves({ ...defaultCurves, accelerationShape: -1 });
  const late = new FlightCurves({ ...defaultCurves, accelerationShape: 1 });
  close(early.at(4).speedMps, 800);
  close(late.at(4).speedMps, 800);
  close(early.totalSeconds, late.totalSeconds);
  close(early.peakShipG, 400 / standardGravity);
  close(late.peakShipG, early.peakShipG);
  assert.ok(early.at(2).speedMps > late.at(2).speedMps);
  assert.ok(early.at(4).positionM > late.at(4).positionM);
  close(early.at(0).accelerationMps2, 400);
  close(late.at(0).accelerationMps2, 0);
  for (const curve of [early, late]) {
    const samples = curve.samples();
    close(Math.max(...samples.map((point) => point.shipG)), curve.peakShipG);
    close(
      Math.max(...samples.map((point) => point.suppressionPercent)),
      curve.peakSuppressionPercent,
    );
  }
});
void test('Braking shape is independent of acceleration shape and never changes final speed', () => {
  const early = new FlightCurves({ ...defaultCurves, decelerationShape: -1 });
  const late = new FlightCurves({ ...defaultCurves, decelerationShape: 1 });
  close(early.at(2).speedMps, late.at(2).speedMps);
  assert.ok(early.at(6).speedMps < late.at(6).speedMps);
  close(early.at(8).speedMps, late.at(8).speedMps);
  assert.ok(early.totalDistanceM < late.totalDistanceM);
});
void test('Curve velocity derivative agrees with signed acceleration, position derivative with velocity', () => {
  const curve = new FlightCurves({
    ...defaultCurves,
    initialMps: 1200,
    arrivalMps: 100,
    accelerationShape: 0.63,
    decelerationShape: -0.48,
    coastSeconds: 12,
  });
  const h = 1e-4;
  for (const time of [0.8, 2.5, 7, 17, 19.1]) {
    const before = curve.at(time - h);
    const after = curve.at(time + h);
    const sample = curve.at(time);
    close(
      (after.speedMps - before.speedMps) / (2 * h),
      sample.accelerationMps2,
      1e-6,
    );
    close(
      (after.positionM - before.positionM) / (2 * h),
      sample.speedMps,
      1e-5,
    );
  }
});
void test('Capture from high entry speed, coast and endpoint samples preserve continuity', () => {
  const curve = new FlightCurves({
    ...defaultCurves,
    initialMps: 50_000,
    coastSeconds: 120,
    arrivalMps: 800,
  });
  close(curve.at(4).speedMps, 800);
  close(curve.at(4).shipG, 0);
  close(curve.at(124).speedMps, 800);
  close(curve.at(124).positionM - curve.at(4).positionM, 96_000);
  assert.ok(curve.at(2).accelerationMps2 < 0);
  const points = curve.samples();
  assert.ok(points.some((p) => p.time === 4 && p.shipG > 0));
  assert.ok(points.some((p) => p.time === 4 && p.shipG === 0));
  close(points.at(-1)!.positionM, curve.totalDistanceM);
  assert.ok(Object.isFrozen(points));
  assert.ok(Object.isFrozen(points[0]));
});
void test('Protection is a requirement with exact zero/100 percent semantics, never extra load', () => {
  const stationary = new FlightCurves({
    ...defaultCurves,
    cruiseMps: 0,
    crewTargetG: 0,
  });
  close(stationary.peakShipG, 0);
  close(stationary.peakSuppressionPercent, 0);
  const fullyProtected = new FlightCurves({ ...defaultCurves, crewTargetG: 0 });
  close(fullyProtected.at(2).suppressionPercent, 100);
  close(fullyProtected.at(2).idealCrewG, 0);
  const gentle = new FlightCurves({ ...defaultCurves, cruiseMps: 1 });
  close(gentle.at(2).suppressionPercent, 0);
  close(gentle.at(2).idealCrewG, gentle.at(2).shipG);
});
void test('Curve boundaries reject invalid inputs without mutating caller-owned profiles', () => {
  const input = { ...defaultCurves };
  const curve = new FlightCurves(input);
  input.cruiseMps = 2;
  close(curve.profile.cruiseMps, 800);
  assert.ok(Object.isFrozen(curve.profile));
  for (const invalid of [
    null,
    [],
    { ...defaultCurves, accelerationSeconds: 0 },
    { ...defaultCurves, cruiseMps: Infinity },
    { ...defaultCurves, initialMps: -1 },
    { ...defaultCurves, accelerationShape: 1.1 },
    { ...defaultCurves, crewTargetG: -1 },
    { ...defaultCurves, unknown: 1 },
  ])
    assert.throws(() => validateCurves(invalid));
  assert.throws(() => curve.at(-1));
  assert.throws(() => curve.at(Infinity));
  assert.throws(() => curve.at(9));
});
