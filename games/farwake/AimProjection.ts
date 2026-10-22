import type { Matrix4, Vec3 } from '../../src/3d/index.js';
import { normalMatrix } from '../../src/3d/NormalMatrix.js';

/** Inverse affine point, shared by glass placement and calibrated aiming. */
function localConverter(world: Matrix4) {
  const inverse = normalMatrix(world);
  return (point: Readonly<Vec3>): Vec3 => {
    const p = {
      x: point.x - world[12],
      y: point.y - world[13],
      z: point.z - world[14],
    };
    const dot = (i: number) =>
      inverse[i]! * p.x + inverse[i + 1]! * p.y + inverse[i + 2]! * p.z;
    return { x: dot(0), y: dot(3), z: dot(6) };
  };
}
export function localPoint(world: Matrix4, point: Readonly<Vec3>): Vec3 {
  return localConverter(world)(point);
}
export interface AimPoint {
  readonly x: number;
  readonly y: number;
}
export type AimProjection = (shipLocalPoint: Readonly<Vec3>) => AimPoint | null;
/** Ray from pilot eye onto the actual stabilized, tilted HUD plane. */
export function aimProjection(
  plane: Matrix4,
  pilotEye: Readonly<Vec3>,
): AimProjection {
  const toLocal = localConverter(plane);
  const eye = toLocal(pilotEye);
  return (point) => {
    if (point.z <= pilotEye.z) return null;
    const p = toLocal(point);
    const dz = p.z - eye.z;
    if (Math.abs(dz) < 1e-9) return null;
    const t = -eye.z / dz;
    return t > 0
      ? { x: eye.x + (p.x - eye.x) * t, y: eye.y + (p.y - eye.y) * t }
      : null;
  };
}
export const acquisitionRadius = 1.15;
