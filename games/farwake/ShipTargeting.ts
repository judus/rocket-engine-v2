import type { Vec3 } from '../../src/3d/index.js';
import type { Ship } from './Ship.js';
import type { GunWorld, GunTarget } from './AsteroidHits.js';
import { acquisitionRadius } from './AimProjection.js';
import type { AimPoint, AimProjection } from './AimProjection.js';

export interface TargetingReading {
  readonly targetId: string | null;
  readonly targetPoint: AimPoint | null;
  readonly aimPoint: AimPoint | null;
  readonly tracking: boolean;
  readonly inRange: boolean;
  readonly distanceM: number;
  readonly aimWorld: Readonly<Vec3>;
}
/** One fixed-clock lock and aim solution, consumed by both guns and HUD. */
export class ShipTargeting {
  #locked: string | null = null;
  #cycle = false;
  #aim: Vec3 | null = null;
  constructor(
    private readonly ship: Ship,
    private readonly world: GunWorld,
    private readonly project: AimProjection,
  ) {}
  next(): void {
    this.#cycle = true;
  }
  update(
    dt: number,
    speedMps: number,
    lifetime: number,
    convergenceM: number,
  ): TargetingReading {
    const body = this.ship.telemetry.body;
    const eyeOffset = this.ship.body.localToWorld({ x: 0, y: 1.48, z: -3.37 });
    const eye = {
      x: body.positionM.x + eyeOffset.x,
      y: body.positionM.y + eyeOffset.y,
      z: body.positionM.z + eyeOffset.z,
    };
    const local = (p: Readonly<Vec3>) =>
      this.ship.body.worldToLocal({
        x: p.x - body.positionM.x,
        y: p.y - body.positionM.y,
        z: p.z - body.positionM.z,
      });
    const targets = this.world.targets();
    const visible = (t: GunTarget) => {
      const p = this.project(local(t.position));
      return p && Math.hypot(p.x, p.y) <= acquisitionRadius;
    };
    if (!targets.some((t) => t.id === this.#locked)) this.#locked = null;
    if (this.#cycle || !this.#locked) {
      const eligible = targets
        .filter(visible)
        .sort((a, b) => {
          const pa = this.project(local(a.position))!,
            pb = this.project(local(b.position))!;
          return (
            Math.hypot(pa.x, pa.y) - Math.hypot(pb.x, pb.y) ||
            a.id.localeCompare(b.id)
          );
        })
        .filter((t) => this.world.trace(eye, t.position)?.targetId === t.id);
      const index = this.#cycle
        ? eligible.findIndex((t) => t.id === this.#locked) + 1
        : 0;
      this.#locked = eligible.length
        ? eligible[index % eligible.length]!.id
        : this.#locked;
      this.#cycle = false;
    }
    const target = targets.find((t) => t.id === this.#locked);
    const targetPoint = target ? this.project(local(target.position)) : null;
    const distanceM = target
      ? Math.hypot(
          target.position.x - eye.x,
          target.position.y - eye.y,
          target.position.z - eye.z,
        )
      : 0;
    const inside =
      targetPoint !== null &&
      Math.hypot(targetPoint.x, targetPoint.y) <= acquisitionRadius;
    const inRange = !!target && distanceM <= speedMps * lifetime;
    const tracking =
      !!target &&
      inside &&
      inRange &&
      this.world.trace(eye, target.position)?.targetId === target.id;
    const forward = this.ship.body.localToWorld({
      x: 0,
      y: 1.48,
      z: convergenceM,
    });
    const origin = {
      x: body.positionM.x,
      y: body.positionM.y,
      z: body.positionM.z,
    };
    const desired = { x: forward.x, y: forward.y, z: forward.z };
    if (tracking && target) {
      // Static asteroid intercept with inherited ship velocity; no target-motion prediction.
      const r = {
        x: target.position.x - origin.x,
        y: target.position.y - origin.y,
        z: target.position.z - origin.z,
      };
      const v = body.velocityMps;
      const a = v.x * v.x + v.y * v.y + v.z * v.z - speedMps * speedMps;
      const b = -2 * (r.x * v.x + r.y * v.y + r.z * v.z),
        c = r.x * r.x + r.y * r.y + r.z * r.z;
      const discriminant = b * b - 4 * a * c;
      const roots =
        Math.abs(a) < 1e-9
          ? Math.abs(b) > 1e-9
            ? [-c / b]
            : []
          : discriminant >= 0
            ? [
                (-b - Math.sqrt(discriminant)) / (2 * a),
                (-b + Math.sqrt(discriminant)) / (2 * a),
              ]
            : [];
      const time = roots
        .filter((t) => t > 0 && t <= lifetime)
        .sort((x, y) => x - y)[0];
      if (time !== undefined) {
        desired.x = r.x - v.x * time;
        desired.y = r.y - v.y * time;
        desired.z = r.z - v.z * time;
      } else
        return this.commit(
          dt,
          forward,
          origin,
          target,
          targetPoint,
          inRange,
          false,
          distanceM,
          local,
        );
    }
    return this.commit(
      dt,
      desired,
      origin,
      target,
      targetPoint,
      inRange,
      tracking,
      distanceM,
      local,
    );
  }
  private commit(
    dt: number,
    desired: Vec3,
    origin: Vec3,
    target: GunTarget | undefined,
    targetPoint: AimPoint | null,
    inRange: boolean,
    tracking: boolean,
    distanceM: number,
    local: (point: Readonly<Vec3>) => Vec3,
  ): TargetingReading {
    const length = Math.hypot(desired.x, desired.y, desired.z);
    const direction = this.ship.body.worldToLocal({
      x: desired.x / length,
      y: desired.y / length,
      z: desired.z / length,
    });
    const blend = 1 - Math.exp(-dt / 0.06);
    this.#aim = this.#aim
      ? {
          x: this.#aim.x + (direction.x - this.#aim.x) * blend,
          y: this.#aim.y + (direction.y - this.#aim.y) * blend,
          z: this.#aim.z + (direction.z - this.#aim.z) * blend,
        }
      : direction;
    const scale =
      Math.hypot(desired.x, desired.y, desired.z) /
      Math.hypot(this.#aim.x, this.#aim.y, this.#aim.z);
    const offset = this.ship.body.localToWorld(this.#aim);
    const aimWorld = Object.freeze({
      x: origin.x + offset.x * scale,
      y: origin.y + offset.y * scale,
      z: origin.z + offset.z * scale,
    });
    return Object.freeze({
      targetId: target?.id ?? null,
      targetPoint: targetPoint ? Object.freeze(targetPoint) : null,
      aimPoint: this.project(local(aimWorld)),
      tracking,
      inRange,
      distanceM,
      aimWorld,
    });
  }
}
