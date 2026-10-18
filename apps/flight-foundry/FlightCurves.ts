/** Kinematic design tool: requested motion and required protection, not installed equipment. */
export interface CurveProfile {
  initialMps: number;
  cruiseMps: number;
  arrivalMps: number;
  accelerationSeconds: number;
  decelerationSeconds: number;
  coastSeconds: number;
  /** -1 = strongest early; 0 = constant; +1 = strongest late. */
  accelerationShape: number;
  decelerationShape: number;
  crewTargetG: number;
}
export const standardGravity = 9.80665;
export const defaultCurves: Readonly<CurveProfile> = Object.freeze({
  initialMps: 0,
  cruiseMps: 800,
  arrivalMps: 0,
  accelerationSeconds: 4,
  decelerationSeconds: 4,
  coastSeconds: 0,
  accelerationShape: 0,
  decelerationShape: 0,
  crewTargetG: 2,
});
export function validateCurves(value: unknown): Readonly<CurveProfile> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError('Expected a flight curve profile');
  const input = value as Record<string, unknown>;
  const limits: Record<keyof CurveProfile, readonly [number, number]> = {
    initialMps: [0, 1e8],
    cruiseMps: [0, 1e8],
    arrivalMps: [0, 1e8],
    accelerationSeconds: [0.1, 120],
    decelerationSeconds: [0.1, 120],
    coastSeconds: [0, 600],
    accelerationShape: [-1, 1],
    decelerationShape: [-1, 1],
    crewTargetG: [0, 20],
  };
  if (Object.keys(input).length !== Object.keys(limits).length)
    throw new TypeError('Curve profile has missing or unknown fields');
  for (const key of Object.keys(limits) as (keyof CurveProfile)[]) {
    const value = input[key];
    const [min, max] = limits[key];
    if (
      typeof value !== 'number' ||
      !Number.isFinite(value) ||
      value < min ||
      value > max
    )
      throw new RangeError(`${key} must be between ${min} and ${max}`);
  }
  return Object.freeze({ ...input }) as unknown as Readonly<CurveProfile>;
}
export interface CurvePoint {
  readonly time: number;
  readonly speedMps: number;
  readonly positionM: number;
  readonly accelerationMps2: number;
  readonly shipG: number;
  readonly idealCrewG: number;
  readonly cancelledG: number;
  readonly suppressionPercent: number;
}
interface Leg {
  start: number;
  duration: number;
  from: number;
  to: number;
  shape: number;
  position: number;
}
function evaluateLeg(leg: Leg, local: number) {
  const u = Math.max(0, Math.min(1, local / leg.duration));
  const dv = leg.to - leg.from;
  const k = leg.shape;
  return {
    speedMps: leg.from + dv * ((1 - k) * u + k * u * u),
    positionM:
      leg.position +
      leg.from * leg.duration * u +
      dv * leg.duration * (((1 - k) * u * u) / 2 + (k * u * u * u) / 3),
    accelerationMps2: (dv / leg.duration) * (1 + k * (2 * u - 1)),
  };
}
/** Validated, analytical curves; results do not depend on display rate or integration dt. */
export class FlightCurves {
  readonly profile: Readonly<CurveProfile>;
  readonly totalSeconds: number;
  readonly totalDistanceM: number;
  readonly peakShipG: number;
  readonly peakSuppressionPercent: number;
  readonly #departure: Leg;
  readonly #arrival: Leg;
  constructor(profile: Readonly<CurveProfile>) {
    this.profile = validateCurves(profile);
    const p = this.profile;
    this.#departure = {
      start: 0,
      duration: p.accelerationSeconds,
      from: p.initialMps,
      to: p.cruiseMps,
      shape: p.accelerationShape,
      position: 0,
    };
    const firstEnd = evaluateLeg(
      this.#departure,
      p.accelerationSeconds,
    ).positionM;
    this.#arrival = {
      start: p.accelerationSeconds + p.coastSeconds,
      duration: p.decelerationSeconds,
      from: p.cruiseMps,
      to: p.arrivalMps,
      shape: p.decelerationShape,
      position: firstEnd + p.cruiseMps * p.coastSeconds,
    };
    this.totalSeconds = this.#arrival.start + this.#arrival.duration;
    this.totalDistanceM = evaluateLeg(
      this.#arrival,
      this.#arrival.duration,
    ).positionM;
    this.peakShipG =
      Math.max(
        (Math.abs(p.cruiseMps - p.initialMps) / p.accelerationSeconds) *
          (1 + Math.abs(p.accelerationShape)),
        (Math.abs(p.arrivalMps - p.cruiseMps) / p.decelerationSeconds) *
          (1 + Math.abs(p.decelerationShape)),
      ) / standardGravity;
    this.peakSuppressionPercent = this.protect(
      this.peakShipG,
    ).suppressionPercent;
  }
  private protect(shipG: number) {
    const idealCrewG = Math.min(shipG, this.profile.crewTargetG);
    return {
      idealCrewG,
      cancelledG: shipG - idealCrewG,
      suppressionPercent: shipG === 0 ? 0 : 100 * (1 - idealCrewG / shipG),
    };
  }
  private point(
    time: number,
    motion: ReturnType<typeof evaluateLeg>,
  ): Readonly<CurvePoint> {
    const shipG = Math.abs(motion.accelerationMps2) / standardGravity;
    return Object.freeze({ time, ...motion, shipG, ...this.protect(shipG) });
  }
  at(time: number): Readonly<CurvePoint> {
    if (!Number.isFinite(time) || time < 0 || time > this.totalSeconds)
      throw new RangeError('Time must be within this journey');
    const p = this.profile;
    if (time < p.accelerationSeconds)
      return this.point(time, evaluateLeg(this.#departure, time));
    if (time < this.#arrival.start)
      return this.point(time, {
        speedMps: p.cruiseMps,
        positionM:
          this.#arrival.position - p.cruiseMps * (this.#arrival.start - time),
        accelerationMps2: 0,
      });
    if (time < this.totalSeconds)
      return this.point(
        time,
        evaluateLeg(this.#arrival, time - this.#arrival.start),
      );
    return this.point(time, {
      speedMps: p.arrivalMps,
      positionM: this.totalDistanceM,
      accelerationMps2: 0,
    });
  }
  /** Includes both sides of phase boundaries so jumps and endpoint peaks are visible. */
  samples(): readonly Readonly<CurvePoint>[] {
    const points: Readonly<CurvePoint>[] = [];
    const p = this.profile;
    for (let i = 0; i <= 120; i++) {
      const local = (p.accelerationSeconds * i) / 120;
      points.push(this.point(local, evaluateLeg(this.#departure, local)));
    }
    if (p.coastSeconds > 0) {
      points.push(this.at(p.accelerationSeconds));
      points.push(
        this.point(this.#arrival.start, {
          speedMps: p.cruiseMps,
          positionM: this.#arrival.position,
          accelerationMps2: 0,
        }),
      );
    }
    for (let i = 0; i <= 120; i++) {
      const local = (p.decelerationSeconds * i) / 120;
      points.push(
        this.point(
          this.#arrival.start + local,
          evaluateLeg(this.#arrival, local),
        ),
      );
    }
    points.push(this.at(this.totalSeconds));
    return Object.freeze(points);
  }
}
