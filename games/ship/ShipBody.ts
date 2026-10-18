import type { Behavior } from '../../src/index.js';
import type { Vec3 } from '../../src/3d/index.js';
import { numberIn, validateBodyProfile } from './ShipProfiles.js';
import type { BodyProfile } from './ShipProfiles.js';

export interface BodyReading {
  readonly positionM: Readonly<Vec3>;
  readonly velocityMps: Readonly<Vec3>;
  readonly accelerationMps2: Readonly<Vec3>;
  readonly yawRadians: number;
  readonly yawRateRadps: number;
}
export const zeroVector = () => ({ x: 0, y: 0, z: 0 });
export function copyVector(
  value: Readonly<Vec3>,
  name: string,
): ReturnType<typeof zeroVector> {
  for (const key of ['x', 'y', 'z'] as const)
    numberIn(`${name}.${key}`, value[key], -1e30);
  return { ...value };
}
/** Sole motion owner. Translational Newtonian integration + one yaw inertia axis. */
export class ShipBody implements Behavior {
  readonly profile: Readonly<BodyProfile>;
  get massKg() {
    return this.profile.massKg;
  }
  get yawInertiaKgM2() {
    return this.profile.yawInertiaKgM2;
  }
  #position = zeroVector();
  #velocity: ReturnType<typeof zeroVector>;
  #acceleration = zeroVector();
  #yaw = 0;
  #yawRate = 0;
  constructor(
    profile: BodyProfile,
    initialVelocity: Readonly<Vec3> = zeroVector(),
  ) {
    this.profile = validateBodyProfile(profile);
    this.#velocity = copyVector(initialVelocity, 'initialVelocity');
  }
  onAttach(): undefined {}
  localToWorld(force: Readonly<Vec3>): Vec3 {
    const c = Math.cos(this.#yaw),
      s = Math.sin(this.#yaw);
    return {
      x: force.x * c + force.z * s,
      y: force.y,
      z: -force.x * s + force.z * c,
    };
  }
  advance(worldForceN: Readonly<Vec3>, yawTorqueNm: number, dt: number): void {
    numberIn('dt', dt, 1e-6, 1);
    const force = copyVector(worldForceN, 'force');
    numberIn('yawTorqueNm', yawTorqueNm, -1e30);
    for (const key of ['x', 'y', 'z'] as const) {
      const a = force[key] / this.massKg;
      this.#position[key] += this.#velocity[key] * dt + 0.5 * a * dt * dt;
      this.#velocity[key] += a * dt;
      this.#acceleration[key] = a;
    }
    const alpha = yawTorqueNm / this.yawInertiaKgM2;
    this.#yaw += this.#yawRate * dt + 0.5 * alpha * dt * dt;
    this.#yaw = Math.atan2(Math.sin(this.#yaw), Math.cos(this.#yaw));
    this.#yawRate += alpha * dt;
  }
  get telemetry(): Readonly<BodyReading> {
    return Object.freeze({
      positionM: Object.freeze({ ...this.#position }),
      velocityMps: Object.freeze({ ...this.#velocity }),
      accelerationMps2: Object.freeze({ ...this.#acceleration }),
      yawRadians: this.#yaw,
      yawRateRadps: this.#yawRate,
    });
  }
}
