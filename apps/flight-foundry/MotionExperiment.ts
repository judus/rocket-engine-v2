import { Node2D } from '../../src/index.js';
import type { Behavior } from '../../src/index.js';

export interface ExperimentProfile {
  massKg: number;
  thrustN: number;
  initialVelocityMps: number;
  burnSeconds: number;
  coastSeconds: number;
  brakeSeconds: number;
  stepSeconds: number;
}
export const baseline: Readonly<ExperimentProfile> = Object.freeze({
  massKg: 100_000,
  thrustN: 1_000_000,
  initialVelocityMps: 0,
  burnSeconds: 10,
  coastSeconds: 5,
  brakeSeconds: 10,
  stepSeconds: 1 / 120,
});
const limits = {
  massKg: [1e-6, 1e15],
  thrustN: [0, 1e20],
  initialVelocityMps: [-1e8, 1e8],
  burnSeconds: [0, 120],
  coastSeconds: [0, 120],
  brakeSeconds: [0, 120],
  stepSeconds: [0.001, 1 / 15],
} as const;
/** Validate profiles at the file/form boundary; slider bounds are not model limits. */
export function validateProfile(value: unknown): Readonly<ExperimentProfile> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError('Experiment profile must be an object');
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== Object.keys(limits).length)
    throw new TypeError('Experiment profile has missing or unknown fields');
  for (const key of Object.keys(limits) as (keyof ExperimentProfile)[]) {
    const n = record[key];
    const [min, max] = limits[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)
      throw new RangeError(
        `${key} must be finite and between ${min} and ${max}`,
      );
  }
  const profile = record as unknown as ExperimentProfile;
  if (duration(profile) <= 0)
    throw new RangeError('Give at least one phase a positive duration');
  return Object.freeze({ ...profile });
}
export function duration(p: Readonly<ExperimentProfile>): number {
  return p.burnSeconds + p.coastSeconds + p.brakeSeconds;
}
export type Phase = 'burn' | 'coast' | 'counter-thrust' | 'complete';
export interface MotionSample {
  readonly tick: number;
  readonly timeSeconds: number;
  readonly phase: Phase;
  readonly positionM: number;
  readonly distanceM: number;
  readonly velocityMps: number;
  /** Time-weighted applied force/acceleration for the completed step. */
  readonly forceN: number;
  readonly accelerationMps2: number;
  readonly g: number;
  readonly kineticJ: number;
}
export class ShipControl implements Behavior {
  onAttach(): undefined {}
  constructor(private readonly profile: Readonly<ExperimentProfile>) {}
  command(time: number): { phase: Phase; throttle: number; until: number } {
    const p = this.profile;
    if (time < p.burnSeconds)
      return { phase: 'burn', throttle: 1, until: p.burnSeconds };
    const coastEnd = p.burnSeconds + p.coastSeconds;
    if (time < coastEnd)
      return { phase: 'coast', throttle: 0, until: coastEnd };
    if (time < duration(p))
      return { phase: 'counter-thrust', throttle: -1, until: duration(p) };
    return { phase: 'complete', throttle: 0, until: duration(p) };
  }
}
export class ShipEngine implements Behavior {
  onAttach(): undefined {}
  constructor(private readonly maxThrustN: number) {}
  force(throttle: number): number {
    return this.maxThrustN * throttle;
  }
}
/** Sole physical state owner. Node2D transforms are deliberately unused. */
export class ShipBody implements Behavior {
  onAttach(): undefined {}
  #position = 0;
  #distance = 0;
  #velocity: number;
  constructor(
    readonly massKg: number,
    initialVelocityMps: number,
  ) {
    this.#velocity = initialVelocityMps;
  }
  get positionM() {
    return this.#position;
  }
  get distanceM() {
    return this.#distance;
  }
  get velocityMps() {
    return this.#velocity;
  }
  integrate(forceN: number, dt: number): void {
    const a = forceN / this.massKg;
    const v = this.#velocity;
    const displacement = v * dt + 0.5 * a * dt * dt;
    const next = v + a * dt;
    // Exact path length, including a velocity sign crossing inside this interval.
    this.#distance +=
      v * next < 0
        ? (v * v + next * next) / (2 * Math.abs(a))
        : Math.abs(displacement);
    this.#position += displacement;
    this.#velocity = next;
  }
}
const motionWriter = Symbol('foundryMotionWriter');
/** One explicit command → force → integration → publication pass. */
class MotionStep implements Behavior {
  readonly writes = [motionWriter];
  readonly requires: readonly Behavior[];
  #time = 0;
  #tick = 0;
  #scheduledTime = 0;
  #timeCompensation = 0;
  #sample: Readonly<MotionSample>;
  constructor(
    private readonly profile: Readonly<ExperimentProfile>,
    private readonly control: ShipControl,
    private readonly engine: ShipEngine,
    private readonly body: ShipBody,
  ) {
    this.requires = [control, engine, body];
    this.#sample = this.publish(0);
  }
  get sample() {
    return this.#sample;
  }
  fixedUpdate(dt: number): undefined {
    // Compensated accumulation avoids an extra near-zero tick at exact durations.
    const adjusted = dt - this.#timeCompensation;
    const scheduled = this.#scheduledTime + adjusted;
    this.#timeCompensation = scheduled - this.#scheduledTime - adjusted;
    this.#scheduledTime = scheduled;
    const end = Math.min(duration(this.profile), scheduled);
    if (end <= this.#time) return;
    const start = this.#time;
    let impulse = 0;
    // Split at scenario boundaries, even when they fall between fixed ticks.
    while (this.#time < end) {
      const command = this.control.command(this.#time);
      const next = Math.min(command.until, end);
      const interval = next - this.#time;
      const force = this.engine.force(command.throttle);
      this.body.integrate(force, interval);
      impulse += force * interval;
      this.#time = next;
    }
    this.#tick++;
    this.#sample = this.publish(impulse / (end - start));
  }
  private publish(forceN: number): Readonly<MotionSample> {
    const accelerationMps2 = forceN / this.body.massKg;
    return Object.freeze({
      tick: this.#tick,
      timeSeconds: this.#time,
      phase: this.control.command(this.#time).phase,
      positionM: this.body.positionM,
      distanceM: this.body.distanceM,
      velocityMps: this.body.velocityMps,
      forceN,
      accelerationMps2,
      g: Math.abs(accelerationMps2) / 9.80665,
      kineticJ: 0.5 * this.body.massKg * this.body.velocityMps ** 2,
    });
  }
}
/** Ordinary typed attachments, using the established engine lifetime contract. */
export class FoundryShip extends Node2D {
  readonly control: ShipControl;
  readonly engine: ShipEngine;
  readonly body: ShipBody;
  readonly #motion: MotionStep;
  constructor(profile: Readonly<ExperimentProfile>) {
    super();
    const p = validateProfile(profile);
    this.control = this.attach(new ShipControl(p));
    this.engine = this.attach(new ShipEngine(p.thrustN));
    this.body = this.attach(new ShipBody(p.massKg, p.initialVelocityMps));
    this.#motion = this.attach(
      new MotionStep(p, this.control, this.engine, this.body),
    );
  }
  get telemetry(): Readonly<MotionSample> {
    return this.#motion.sample;
  }
}
export function serializeExperiment(
  profile: Readonly<ExperimentProfile>,
): string {
  return JSON.stringify(
    { version: 1, profile: validateProfile(profile) },
    null,
    2,
  );
}
export function parseExperiment(text: string): Readonly<ExperimentProfile> {
  const value: unknown = JSON.parse(text);
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError('Expected an experiment document');
  const record = value as Record<string, unknown>;
  if (
    record.version !== 1 ||
    Object.keys(record).sort().join(',') !== 'profile,version'
  )
    throw new TypeError(
      'Expected experiment version 1 with only version and profile',
    );
  return validateProfile(record.profile);
}
