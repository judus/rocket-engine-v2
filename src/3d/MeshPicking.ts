import { matrixPoint } from './Matrix4.js';
import type { Node3D } from './Node3D.js';
import type { PerspectiveCamera, Vec3 } from './PerspectiveCamera.js';

export interface MeshHit3D {
  readonly node: Node3D;
  readonly faceId: string;
  readonly distance: number;
  readonly point: Vec3;
  readonly uv: readonly [number, number] | null;
}

/** Geometric picking, independent of material opacity. Nearest visible mesh wins,
 * including untextured occluders. Convex faces use the renderer's triangle fan.
 * The caller selects eligible nodes; alpha masks/visible-pixel picking are not implied.
 */
export function pickMesh3D(
  root: Node3D,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  x: number,
  y: number,
  eligible: (node: Node3D) => boolean = () => true,
): MeshHit3D | null {
  camera.clipMatrix(width, height);
  if (![x, y].every(Number.isFinite)) throw new Error('Invalid pick position');
  if (x < 0 || y < 0 || x > width || y > height) return null;
  for (let ancestor = root.parent; ancestor; ancestor = ancestor.parent)
    if (!ancestor.visible) return null;
  const focal = height / (2 * Math.tan(camera.verticalFov / 2));
  const dx = (x - width / 2) / focal,
    dy = (height / 2 - y) / focal;
  const cr = Math.cos(camera.roll),
    sr = Math.sin(camera.roll);
  const hx = cr * dx + sr * dy,
    vy = -sr * dx + cr * dy;
  const cy = Math.cos(camera.yaw),
    sy = Math.sin(camera.yaw);
  const cp = Math.cos(camera.pitch),
    sp = Math.sin(camera.pitch);
  const forward = { x: sy * cp, y: sp, z: cy * cp };
  const length = Math.hypot(hx, vy, 1);
  const direction = {
    x: (cy * hx - sy * sp * vy + forward.x) / length,
    y: (cp * vy + forward.y) / length,
    z: (-sy * hx - cy * sp * vy + forward.z) / length,
  };
  const origin = { x: camera.x, y: camera.y, z: camera.z };
  let nearest: MeshHit3D | null = null;
  root.traverse((node, world) => {
    const geometry = node.mesh?.geometry;
    if (!geometry || !eligible(node)) return;
    const points = geometry.vertices.map((v) => matrixPoint(world, v));
    for (const face of geometry.faces) {
      for (let i = 1; i < face.indices.length - 1; i++) {
        const ids = [
          face.indices[0]!,
          face.indices[i]!,
          face.indices[i + 1]!,
        ] as const;
        const a = points[ids[0]]!,
          b = points[ids[1]]!,
          c = points[ids[2]]!;
        const e1 = subtract(b, a),
          e2 = subtract(c, a);
        const p = cross(direction, e2),
          determinant = dot(e1, p);
        if (Math.abs(determinant) < 1e-12) continue;
        const t = subtract(origin, a),
          u = dot(t, p) / determinant;
        const q = cross(t, e1),
          v = dot(direction, q) / determinant;
        if (u < -1e-8 || v < -1e-8 || u + v > 1 + 1e-8) continue;
        const distance = dot(e2, q) / determinant;
        const depth = distance / length;
        if (
          depth < camera.near ||
          depth > camera.far ||
          (nearest && distance >= nearest.distance)
        )
          continue;
        const uv = geometry.texCoords.length
          ? ([0, 0] as [number, number])
          : null;
        if (uv) {
          const weights = [1 - u - v, u, v];
          ids.forEach((id, j) => {
            uv[0] += geometry.texCoords[id]![0] * weights[j]!;
            uv[1] += geometry.texCoords[id]![1] * weights[j]!;
          });
        }
        nearest = {
          node,
          faceId: face.id,
          distance,
          uv,
          point: {
            x: origin.x + direction.x * distance,
            y: origin.y + direction.y * distance,
            z: origin.z + direction.z * distance,
          },
        };
      }
    }
  });
  return nearest;
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
