import { matrixPoint } from '../../../src/3d/index.js';
import type { Node3D, Vec3 } from '../../../src/3d/index.js';

/** Application-owned rigid-model bound. Compute once before the inspection rig moves. */
export function cockpitShadowFit(root: Node3D): {
  readonly center: Vec3;
  readonly radius: number;
} {
  const min = { x: Infinity, y: Infinity, z: Infinity },
    max = { x: -Infinity, y: -Infinity, z: -Infinity };
  root.traverse((node, world) => {
    for (const v of node.mesh?.geometry.vertices ?? []) {
      const p = matrixPoint(world, v);
      for (const axis of ['x', 'y', 'z'] as const) {
        min[axis] = Math.min(min[axis], p[axis]);
        max[axis] = Math.max(max[axis], p[axis]);
      }
    }
  });
  if (![...Object.values(min), ...Object.values(max)].every(Number.isFinite))
    throw new Error('Cannot fit shadow volume to an empty or nonfinite model');
  const center = Object.freeze({
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  });
  const radius = Math.max(
    0.1,
    Math.hypot(max.x - min.x, max.y - min.y, max.z - min.z) / 2,
  );
  return Object.freeze({ center, radius });
}

/** Smallest sphere containing two fitted spheres, without traversing moving geometry. */
export function mergeShadowFits(
  a: { readonly center: Vec3; readonly radius: number },
  b: { readonly center: Vec3; readonly radius: number },
) {
  const delta = {
    x: b.center.x - a.center.x,
    y: b.center.y - a.center.y,
    z: b.center.z - a.center.z,
  };
  const distance = Math.hypot(delta.x, delta.y, delta.z);
  if (a.radius >= distance + b.radius) return a;
  if (b.radius >= distance + a.radius) return b;
  const radius = (distance + a.radius + b.radius) / 2;
  const t = (radius - a.radius) / distance;
  return {
    center: {
      x: a.center.x + delta.x * t,
      y: a.center.y + delta.y * t,
      z: a.center.z + delta.z * t,
    },
    radius,
  };
}
