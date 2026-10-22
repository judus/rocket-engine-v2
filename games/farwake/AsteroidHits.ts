import { matrixPoint } from '../../src/3d/index.js';
import type { Node3D, Vec3 } from '../../src/3d/index.js';

export interface GunHit {
  readonly targetId: string;
  readonly fraction: number;
  readonly point: Readonly<Vec3>;
}
export type GunTrace = (
  from: Readonly<Vec3>,
  to: Readonly<Vec3>,
) => GunHit | null;
export interface AsteroidDestruction {
  readonly targetId: string;
  readonly position: Readonly<Vec3>;
  readonly radiusM: number;
}
export interface GunTarget {
  readonly id: string;
  readonly position: Readonly<Vec3>;
}
export interface GunWorld {
  targets(): readonly GunTarget[];
  readonly trace: GunTrace;
  damage(targetId: string, energyJ: number): AsteroidDestruction | null;
}
/** Gameplay integrity budget, not a physical rock-fracture model. */
export const asteroidIntegrity = Object.freeze({
  minimumJ: 25000000,
  joulesPerSquareMetre: 25000,
});
const subtract = (a: Readonly<Vec3>, b: Readonly<Vec3>) => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
const dot = (a: Readonly<Vec3>, b: Readonly<Vec3>) =>
  a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Readonly<Vec3>, b: Readonly<Vec3>) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** Static scene-owned collision cache. Bake once, outside the render loop.
 * Broad-phase bounds select candidates; actual triangles decide the first hit.
 * No ship/cockpit collision or moving-target prediction is implied. */
export function asteroidCombatWorld(
  field: Node3D,
  onDestroyed: (targetId: string) => void,
) {
  const targets = field.children.map((node, index) => {
    if (!node.mesh) throw new Error('Asteroid collision requires a mesh');
    const world = node.worldMatrix();
    const points = node.mesh.geometry.vertices.map((p) =>
      matrixPoint(world, p),
    );
    const min = { x: Infinity, y: Infinity, z: Infinity },
      max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const p of points)
      for (const axis of ['x', 'y', 'z'] as const) {
        if (!Number.isFinite(p[axis]))
          throw new Error('Asteroid collision geometry must be finite');
        min[axis] = Math.min(min[axis], p[axis]);
        max[axis] = Math.max(max[axis], p[axis]);
      }
    const triangles: (readonly [Vec3, Vec3, Vec3])[] = [];
    for (const face of node.mesh.geometry.faces)
      for (let i = 1; i < face.indices.length - 1; i++)
        triangles.push([
          points[face.indices[0]!]!,
          points[face.indices[i]!]!,
          points[face.indices[i + 1]!]!,
        ]);
    if (!triangles.length) throw new Error('Asteroid collision requires faces');
    const radiusM = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) / 2;
    const position = Object.freeze({
      x: (min.x + max.x) / 2,
      y: (min.y + max.y) / 2,
      z: (min.z + max.z) / 2,
    });
    return {
      id: `rock-${index + 1}`,
      min,
      max,
      triangles,
      radiusM,
      position,
      integrityJ: Math.max(
        asteroidIntegrity.minimumJ,
        radiusM * radiusM * asteroidIntegrity.joulesPerSquareMetre,
      ),
    };
  });
  const trace: GunTrace = (from, to) => {
    if (![from.x, from.y, from.z, to.x, to.y, to.z].every(Number.isFinite))
      throw new RangeError('Invalid shot segment');
    const direction = subtract(to, from);
    let nearest: GunHit | null = null;
    for (const target of targets) {
      if (target.integrityJ === 0) continue;
      let enter = 0,
        exit = nearest?.fraction ?? 1;
      for (const axis of ['x', 'y', 'z'] as const) {
        const delta = direction[axis];
        if (delta === 0) {
          if (from[axis] < target.min[axis] || from[axis] > target.max[axis]) {
            enter = 1;
            exit = 0;
            break;
          }
        } else {
          const a = (target.min[axis] - from[axis]) / delta,
            b = (target.max[axis] - from[axis]) / delta;
          enter = Math.max(enter, Math.min(a, b));
          exit = Math.min(exit, Math.max(a, b));
        }
      }
      if (enter > exit) continue;
      for (const [a, b, c] of target.triangles) {
        const e1 = subtract(b, a),
          e2 = subtract(c, a),
          p = cross(direction, e2),
          determinant = dot(e1, p);
        if (Math.abs(determinant) < 1e-12) continue;
        const offset = subtract(from, a),
          u = dot(offset, p) / determinant,
          q = cross(offset, e1),
          v = dot(direction, q) / determinant;
        if (u < -1e-8 || v < -1e-8 || u + v > 1 + 1e-8) continue;
        const fraction = dot(e2, q) / determinant;
        if (
          fraction < 0 ||
          fraction > 1 ||
          (nearest && fraction >= nearest.fraction)
        )
          continue;
        nearest = {
          targetId: target.id,
          fraction,
          point: {
            x: from.x + direction.x * fraction,
            y: from.y + direction.y * fraction,
            z: from.z + direction.z * fraction,
          },
        };
      }
    }
    return nearest;
  };
  return {
    trace,
    targets: () =>
      targets
        .filter((t) => t.integrityJ > 0)
        .map((t) => ({ id: t.id, position: t.position })),
    isAlive(targetId: string): boolean {
      const target = targets.find((t) => t.id === targetId);
      if (!target) throw new Error(`Unknown asteroid ${targetId}`);
      return target.integrityJ > 0;
    },
    damage(targetId: string, energyJ: number): AsteroidDestruction | null {
      if (!Number.isFinite(energyJ) || energyJ <= 0)
        throw new RangeError('Invalid asteroid hit energy');
      const target = targets.find((t) => t.id === targetId);
      if (!target) throw new Error(`Unknown asteroid ${targetId}`);
      if (target.integrityJ === 0)
        throw new Error(`Asteroid ${targetId} is already destroyed`);
      target.integrityJ = Math.max(0, target.integrityJ - energyJ);
      if (target.integrityJ > 0) return null;
      onDestroyed(targetId);
      return Object.freeze({
        targetId,
        position: target.position,
        radiusM: target.radiusM,
      });
    },
  };
}
