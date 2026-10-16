import type { Vec3 } from './PerspectiveCamera.js';
/** Newell's polygon normal, including redundant collinear edge vertices. */
export function polygonNormal(vertices: readonly Vec3[]): Vec3 {
  let x = 0,
    y = 0,
    z = 0;
  for (let i = 0; i < vertices.length; i++) {
    const p = vertices[i]!,
      q = vertices[(i + 1) % vertices.length]!;
    x += (p.y - q.y) * (p.z + q.z);
    y += (p.z - q.z) * (p.x + q.x);
    z += (p.x - q.x) * (p.y + q.y);
  }
  return { x, y, z };
}
