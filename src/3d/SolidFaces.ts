import type { Material3D } from './Mesh3D.js';
import type {
  PerspectiveCamera,
  Vec3,
  ProjectedPoint,
} from './PerspectiveCamera.js';

export interface Face {
  /** Optional source surface data for independent shading passes. */
  readonly material?: Material3D;
  readonly id: string;
  /** Ordered counterclockwise when viewed from outside the solid. */
  readonly vertices: readonly Vec3[];
  readonly color: string;
}
export interface ProjectedFace {
  readonly id: string;
  readonly points: readonly ProjectedPoint[];
  readonly color: string;
  readonly depth: number;
}

/** Convex-face painter pipeline; not a general intersection/occlusion solver. */
export function projectFaces(
  faces: readonly Face[],
  camera: PerspectiveCamera,
  width: number,
  height: number,
  sortByDepth = true,
) {
  const visible: ProjectedFace[] = [];
  let backFacing = 0,
    outside = 0;
  for (const face of faces) {
    const [a, b, c] = face.vertices;
    if (!a || !b || !c) throw new Error('A face needs at least three vertices');
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const normal = {
      x: ab.y * ac.z - ab.z * ac.y,
      y: ab.z * ac.x - ab.x * ac.z,
      z: ab.x * ac.y - ab.y * ac.x,
    };
    if (
      normal.x * (camera.x - a.x) +
        normal.y * (camera.y - a.y) +
        normal.z * (camera.z - a.z) <=
      0
    ) {
      backFacing++;
      continue;
    }
    const projection = camera.polygon(face.vertices, width, height);
    if (!projection) {
      outside++;
      continue;
    }
    visible.push({ id: face.id, color: face.color, ...projection });
  }
  if (sortByDepth) visible.sort((a, b) => b.depth - a.depth);
  return { visible, backFacing, outside, submitted: faces.length };
}
