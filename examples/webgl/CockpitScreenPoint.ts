import { matrixPoint } from '../../src/3d/index.js';
import type { Node3D, PerspectiveCamera } from '../../src/3d/index.js';

/** Perspective-correct UV picking on a fitted four-corner display, including roll and sway. */
export function cockpitScreenPoint(
  node: Node3D,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const geometry = node.mesh?.geometry;
  if (!node.visible || !geometry || geometry.vertices.length !== 4) return null;
  const world = node.worldMatrix(),
    clip = camera.clipMatrix(width, height);
  const points = geometry.vertices.map((vertex) => {
    const p = matrixPoint(world, vertex);
    const w = clip[3] * p.x + clip[7] * p.y + clip[11] * p.z + clip[15];
    if (w <= camera.near || w >= camera.far) return null;
    return {
      x:
        ((1 + (clip[0] * p.x + clip[4] * p.y + clip[8] * p.z + clip[12]) / w) *
          width) /
        2,
      y:
        ((1 - (clip[1] * p.x + clip[5] * p.y + clip[9] * p.z + clip[13]) / w) *
          height) /
        2,
      w,
    };
  });
  for (const indices of [
    [0, 1, 2],
    [0, 2, 3],
  ] as const) {
    const [a, b, c] = indices.map((i) => points[i]);
    if (!a || !b || !c) continue;
    const denominator = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
    if (Math.abs(denominator) < 1e-9) continue;
    const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / denominator;
    const v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / denominator;
    const t = 1 - u - v;
    if (Math.min(u, v, t) < -1e-8) continue;
    const weights = [u / a.w, v / b.w, t / c.w],
      total = weights.reduce((a, b) => a + b, 0);
    let tx = 0,
      ty = 0;
    indices.forEach((index, i) => {
      const uv = geometry.texCoords[index]!;
      tx += (uv[0] * weights[i]!) / total;
      ty += (uv[1] * weights[i]!) / total;
    });
    return { x: tx * 512, y: ty * 400 };
  }
  return null;
}
