import type { Vec3 } from './PerspectiveCamera.js';

export interface Transform3D {
  readonly position: Vec3;
  readonly rotation: Vec3;
  readonly scale: Vec3;
}

/** Local scale, then X/Y/Z rotations in radians, then world translation. */
export function transformPoint(point: Vec3, transform: Transform3D): Vec3 {
  const x = point.x * transform.scale.x,
    y = point.y * transform.scale.y,
    z = point.z * transform.scale.z;
  const cx = Math.cos(transform.rotation.x),
    sx = Math.sin(transform.rotation.x),
    cy = Math.cos(transform.rotation.y),
    sy = Math.sin(transform.rotation.y),
    cz = Math.cos(transform.rotation.z),
    sz = Math.sin(transform.rotation.z);
  const ry = y * cx - z * sx,
    rz = y * sx + z * cx,
    rx = x * cy + rz * sy,
    depth = -x * sy + rz * cy;
  return {
    x: rx * cz - ry * sz + transform.position.x,
    y: rx * sz + ry * cz + transform.position.y,
    z: depth + transform.position.z,
  };
}
