import { rotateVector, integrateAttitude } from './ShipAttitude.js';
import type { ShipQuaternion } from './ShipAttitude.js';
import type { Behavior } from '../../src/index.js';
import type { Vec3 } from '../../src/3d/index.js';
import { numberIn, validateBodyProfile } from './ShipProfiles.js';
import type { BodyProfile } from './ShipProfiles.js';

export interface BodyReading {
  readonly positionM: Readonly<Vec3>;
  readonly velocityMps: Readonly<Vec3>;
  readonly accelerationMps2: Readonly<Vec3>;
  readonly orientation: Readonly<ShipQuaternion>;
  readonly angularVelocityRadps: Readonly<Vec3>;
  readonly pitchRadians: number;
  readonly rollRadians: number;
  readonly pitchRateRadps: number;
  readonly rollRateRadps: number;
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
/** Sole motion owner. Newtonian translation and principal-axis rigid-body rotation. */
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
  #orientation: ShipQuaternion = { x: 0, y: 0, z: 0, w: 1 };
  #omega = zeroVector();
  constructor(
    profile: BodyProfile,
    initialVelocity: Readonly<Vec3> = zeroVector(),
  ) {
    this.profile = validateBodyProfile(profile);
    this.#velocity = copyVector(initialVelocity, 'initialVelocity');
  }
  onAttach(): undefined {}
  localToWorld(value: Readonly<Vec3>): Vec3 {
    return rotateVector(this.#orientation, value);
  }
  worldToLocal(value: Readonly<Vec3>): Vec3 {
    const q = this.#orientation;
    return rotateVector({ x: -q.x, y: -q.y, z: -q.z, w: q.w }, value);
  }
  gyroscopicTorqueNm(): Vec3 {
    const w = this.#omega,
      p = this.profile;
    return {
      x: (p.rollInertiaKgM2 - p.yawInertiaKgM2) * w.y * w.z,
      y: (p.pitchInertiaKgM2 - p.rollInertiaKgM2) * w.z * w.x,
      z: (p.yawInertiaKgM2 - p.pitchInertiaKgM2) * w.x * w.y,
    };
  }
  advance(
    worldForceN: Readonly<Vec3>,
    bodyTorqueNm: Readonly<Vec3>,
    dt: number,
  ): void {
    numberIn('dt', dt, 1e-6, 1);
    const force = copyVector(worldForceN, 'force');
    const torque = copyVector(bodyTorqueNm, 'body torque');
    for (const key of ['x', 'y', 'z'] as const) {
      const a = force[key] / this.massKg;
      this.#position[key] += this.#velocity[key] * dt + 0.5 * a * dt * dt;
      this.#velocity[key] += a * dt;
      this.#acceleration[key] = a;
    }
    const inertia = {
      x: this.profile.pitchInertiaKgM2,
      y: this.profile.yawInertiaKgM2,
      z: this.profile.rollInertiaKgM2,
    };
    const acceleration = (w: Readonly<Vec3>): Vec3 => ({
      x: (torque.x - (inertia.z - inertia.y) * w.y * w.z) / inertia.x,
      y: (torque.y - (inertia.x - inertia.z) * w.z * w.x) / inertia.y,
      z: (torque.z - (inertia.y - inertia.x) * w.x * w.y) / inertia.z,
    });
    const a = acceleration(this.#omega);
    const mid = {
      x: this.#omega.x + (a.x * dt) / 2,
      y: this.#omega.y + (a.y * dt) / 2,
      z: this.#omega.z + (a.z * dt) / 2,
    };
    const am = acceleration(mid);
    this.#orientation = integrateAttitude(this.#orientation, {
      x: mid.x * dt,
      y: mid.y * dt,
      z: mid.z * dt,
    });
    this.#omega = {
      x: this.#omega.x + am.x * dt,
      y: this.#omega.y + am.y * dt,
      z: this.#omega.z + am.z * dt,
    };
  }
  get telemetry(): Readonly<BodyReading> {
    const forward = this.localToWorld({ x: 0, y: 0, z: 1 }),
      right = this.localToWorld({ x: 1, y: 0, z: 0 }),
      up = this.localToWorld({ x: 0, y: 1, z: 0 });
    return Object.freeze({
      orientation: Object.freeze({ ...this.#orientation }),
      angularVelocityRadps: Object.freeze({ ...this.#omega }),
      pitchRadians: Math.asin(Math.max(-1, Math.min(1, forward.y))),
      rollRadians: Math.atan2(-right.y, up.y),
      pitchRateRadps: -this.#omega.x,
      rollRateRadps: -this.#omega.z,
      positionM: Object.freeze({ ...this.#position }),
      velocityMps: Object.freeze({ ...this.#velocity }),
      accelerationMps2: Object.freeze({ ...this.#acceleration }),
      yawRadians: Math.atan2(forward.x, forward.z),
      yawRateRadps: this.#omega.y,
    });
  }
}
