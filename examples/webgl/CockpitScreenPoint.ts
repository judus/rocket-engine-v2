import { pickMesh3D } from '../../src/3d/index.js';
import type { Node3D, PerspectiveCamera } from '../../src/3d/index.js';

/** The diagnostic cockpit's 512×400 display adapter. Geometry picking belongs to Rocket. */
export function cockpitScreenPoint(
  node: Node3D,
  camera: PerspectiveCamera,
  width: number,
  height: number,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const uv = pickMesh3D(node, camera, width, height, x, y)?.uv;
  return uv ? { x: uv[0] * 512, y: uv[1] * 400 } : null;
}
