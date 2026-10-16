import { matrixPoint } from '../../src/3d/index.js';
import type { Node3D, Vec3 } from '../../src/3d/index.js';

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
