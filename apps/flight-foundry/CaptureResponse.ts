import { standardGravity } from './FlightCurves.js';

/** Equipment response parameters, independent of rendering and crew injury rules. */
export interface CaptureProfile {
  assistedSpeedMps: number;
  /** Anchor is speed to REMOVE, not total entry speed or a Newtonian speed cap. */
  referenceExcessMps: number;
  referenceDurationSeconds: number;
  /** Above the anchor, duration grows with excess-speed ratio raised to this power. */
  durationGrowthExponent: number;
  /** 1 = constant braking; larger values concentrate braking near the selected end. */
  baseCurvePower: number;
  curvePowerGrowthPerDoubling: number;
  peakAt: 'start' | 'end';
  /** 0.01 transmits 1% (99% suppression). Never caps the resulting crew G. */
  transmittedFraction: number;
}
/** An illustrative anchor, not an accepted ship balance or safety threshold. */
export const exampleCaptureProfile: Readonly<CaptureProfile> = Object.freeze({
  assistedSpeedMps: 800,
  referenceExcessMps: 12_000,
  referenceDurationSeconds: 4,
  durationGrowthExponent: Math.log10(2),
  baseCurvePower: 2,
  curvePowerGrowthPerDoubling: 0.2,
  peakAt: 'end',
  transmittedFraction: 0.01,
});
export function validateCaptureProfile(
  value: unknown,
): Readonly<CaptureProfile> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError('Expected a capture profile');
  const input = value as Record<string, unknown>;
  const limits = {
    assistedSpeedMps: [0, 1e8],
    referenceExcessMps: [1, 1e8],
    referenceDurationSeconds: [0.01, 120],
    durationGrowthExponent: [0, 1],
    baseCurvePower: [1, 16],
    curvePowerGrowthPerDoubling: [0, 4],
    transmittedFraction: [0, 1],
  } as const;
  if (Object.keys(input).length !== Object.keys(limits).length + 1)
    throw new TypeError('Capture profile has missing or unknown fields');
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    const n = input[key];
    const [min, max] = limits[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
      throw new RangeError(
        `${key} must be finite and between ${min} and ${max}`,
      );
  }
  if (input.peakAt !== 'start' && input.peakAt !== 'end')
    throw new TypeError('peakAt must be start or end');
  return Object.freeze({ ...input }) as unknown as Readonly<CaptureProfile>;
}
export interface CaptureSample {
  readonly elapsedSeconds: number;
  readonly speedMps: number;
  readonly distanceM: number;
  readonly requestedAccelerationMps2: number;
  readonly shipG: number;
  readonly nominalCrewG: number;
  readonly complete: boolean;
}
/**
 * One immutable plan selected at ID engagement. Evaluations are requested motion
 * assuming full service, NOT force integration or a power/protection guarantee.
 * Replanning from the remaining speed every tick would change the response.
 */
export class CapturePlan {
  readonly profile: Readonly<CaptureProfile>;
  readonly entrySpeedMps: number;
  readonly targetSpeedMps: number;
  readonly excessMps: number;
  readonly durationSeconds: number;
  readonly curvePower: number;
  readonly averageShipG: number;
  readonly peakShipG: number;
  readonly averageNominalCrewG: number;
  readonly peakNominalCrewG: number;
  readonly distanceM: number;
  constructor(profile: Readonly<CaptureProfile>, entrySpeedMps: number) {
    this.profile = validateCaptureProfile(profile);
    if (
      !Number.isFinite(entrySpeedMps) ||
      entrySpeedMps < 0 ||
      entrySpeedMps > 1e8
    )
      throw new RangeError(
        'Entry speed must be finite and between 0 and 1e8 m/s',
      );
    this.entrySpeedMps = entrySpeedMps;
    const p = this.profile;
    this.targetSpeedMps = Math.min(entrySpeedMps, p.assistedSpeedMps);
    this.excessMps = entrySpeedMps - this.targetSpeedMps;
    const ratio = Math.max(1, this.excessMps / p.referenceExcessMps);
    this.durationSeconds =
      this.excessMps === 0
        ? 0
        : p.referenceDurationSeconds * ratio ** p.durationGrowthExponent;
    this.curvePower =
      p.baseCurvePower + p.curvePowerGrowthPerDoubling * Math.log2(ratio);
    this.averageShipG =
      this.durationSeconds === 0
        ? 0
        : this.excessMps / this.durationSeconds / standardGravity;
    this.peakShipG = this.averageShipG * this.curvePower;
    this.averageNominalCrewG = this.averageShipG * p.transmittedFraction;
    this.peakNominalCrewG = this.peakShipG * p.transmittedFraction;
    const meanSpeed =
      p.peakAt === 'end'
        ? entrySpeedMps - this.excessMps / (this.curvePower + 1)
        : this.targetSpeedMps + this.excessMps / (this.curvePower + 1);
    this.distanceM = meanSpeed * this.durationSeconds;
    Object.freeze(this);
  }
  at(elapsedSeconds: number): Readonly<CaptureSample> {
    if (
      !Number.isFinite(elapsedSeconds) ||
      elapsedSeconds < 0 ||
      elapsedSeconds > this.durationSeconds
    )
      throw new RangeError('Elapsed time must be within this capture');
    if (elapsedSeconds === this.durationSeconds)
      return Object.freeze({
        elapsedSeconds,
        speedMps: this.targetSpeedMps,
        distanceM: this.distanceM,
        requestedAccelerationMps2: 0,
        shipG: 0,
        nominalCrewG: 0,
        complete: true,
      });
    const u = elapsedSeconds / this.durationSeconds;
    const p = this.curvePower;
    const late = this.profile.peakAt === 'end';
    const remaining = 1 - u;
    const progress = late ? u ** p : -Math.expm1(p * Math.log1p(-u));
    const speedMps = this.entrySpeedMps - this.excessMps * progress;
    const distanceM = late
      ? this.entrySpeedMps * elapsedSeconds -
        (this.excessMps * this.durationSeconds * u ** (p + 1)) / (p + 1)
      : this.targetSpeedMps * elapsedSeconds +
        (this.excessMps *
          this.durationSeconds *
          -Math.expm1((p + 1) * Math.log1p(-u))) /
          (p + 1);
    const magnitude =
      (this.excessMps / this.durationSeconds) *
      p *
      (late ? u : remaining) ** (p - 1);
    const shipG = magnitude / standardGravity;
    return Object.freeze({
      elapsedSeconds,
      speedMps,
      distanceM,
      requestedAccelerationMps2: -magnitude,
      shipG,
      nominalCrewG: shipG * this.profile.transmittedFraction,
      complete: false,
    });
  }
}
