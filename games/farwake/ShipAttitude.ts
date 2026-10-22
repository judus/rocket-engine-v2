import type { Vec3 } from '../../src/3d/index.js';
export interface ShipQuaternion {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}
/** Rotate a body-local vector by the unit body-to-world quaternion. */
export function rotateVector(q: ShipQuaternion, v: Readonly<Vec3>): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y),
    ty = 2 * (q.z * v.x - q.x * v.z),
    tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + q.y * tz - q.z * ty,
    y: v.y + q.w * ty + q.z * tx - q.x * tz,
    z: v.z + q.w * tz + q.x * ty - q.y * tx,
  };
}
/** Right-compose a body-axis rotation vector, keeping the quaternion normalized. */
export function integrateAttitude(
  q: ShipQuaternion,
  delta: Readonly<Vec3>,
): ShipQuaternion {
  const angle = Math.hypot(delta.x, delta.y, delta.z),
    scale = angle > 1e-12 ? Math.sin(angle / 2) / angle : 0.5;
  const x = delta.x * scale,
    y = delta.y * scale,
    z = delta.z * scale,
    w = Math.cos(angle / 2);
  const next = {
    x: q.w * x + q.x * w + q.y * z - q.z * y,
    y: q.w * y - q.x * z + q.y * w + q.z * x,
    z: q.w * z + q.x * y - q.y * x + q.z * w,
    w: q.w * w - q.x * x - q.y * y - q.z * z,
  };
  const norm = Math.hypot(next.x, next.y, next.z, next.w);
  return {
    x: next.x / norm,
    y: next.y / norm,
    z: next.z / norm,
    w: next.w / norm,
  };
}
