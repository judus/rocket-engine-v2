import { linearDeterminant } from './NormalMatrix.js';
import type { Matrix4 } from './Matrix4.js';
import type { Vec3 } from './PerspectiveCamera.js';
import type { Light3D } from './Lighting3D.js';

/** One directional light and one explicitly fitted, world-space orthographic shadow volume. */
export interface DirectionalShadow3D {
  readonly lightIndex: number;
  readonly matrix: Matrix4;
  readonly resolution?: number;
  /** Positive receiver depth offset in normalized shadow-depth units. */
  readonly bias?: number;
  readonly slopeBias?: number;
  readonly filter?: 'hard' | 'pcf';
  readonly enabled?: boolean;
}
export function validateDirectionalShadow(
  shadow: DirectionalShadow3D,
  lights: readonly Light3D[],
): void {
  const {
    matrix,
    lightIndex,
    resolution = 512,
    bias = 0.001,
    slopeBias = 0.002,
    filter = 'pcf',
  } = shadow;
  if (
    !Number.isInteger(lightIndex) ||
    lights[lightIndex]?.kind !== 'directional'
  )
    throw new Error('Shadow lightIndex must select a directional light');
  if (
    matrix.length !== 16 ||
    !Array.from(matrix).every(
      (v) => Number.isFinite(v) && Math.abs(v) <= 1e6,
    ) ||
    matrix[3] !== 0 ||
    matrix[7] !== 0 ||
    matrix[11] !== 0 ||
    matrix[15] !== 1 ||
    Math.abs(linearDeterminant(matrix)) < 1e-30
  )
    throw new Error(
      'Shadow matrix must be a finite orthographic affine projection',
    );
  if (
    !Number.isInteger(resolution) ||
    resolution < 64 ||
    resolution > 8192 ||
    resolution & (resolution - 1)
  )
    throw new Error('Shadow resolution must be power of two in 64..8192');
  if (
    ![bias, slopeBias].every(
      (v) => Number.isFinite(v) && v >= 0 && v <= 0.05,
    ) ||
    !['hard', 'pcf'].includes(filter)
  )
    throw new Error('Invalid shadow bias or filter');
}
/** Direction points FROM the surface TOWARD the light, matching DirectionalLight3D.
 * Volume is centered on center, spans ±extent horizontally/vertically, ±depth/2 along the light.
 * No automatic camera fitting, scene traversal, texel snapping or cascades.
 */
export function directionalShadowMatrix(
  direction: Vec3,
  center: Vec3,
  extent: number,
  depth: number,
): Matrix4 {
  if (
    ![
      direction.x,
      direction.y,
      direction.z,
      center.x,
      center.y,
      center.z,
      extent,
      depth,
    ].every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6) ||
    extent < 0.01 ||
    depth < 0.01
  )
    throw new Error('Invalid directional shadow volume');
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (length < 1e-6) throw new Error('Shadow light direction must be nonzero');
  const forward = {
    x: -direction.x / length,
    y: -direction.y / length,
    z: -direction.z / length,
  };
  const up =
    Math.abs(forward.y) > 0.99 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const cross = (a: Vec3, b: Vec3) => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  });
  const r = cross(up, forward),
    rl = Math.hypot(r.x, r.y, r.z),
    right = { x: r.x / rl, y: r.y / rl, z: r.z / rl },
    vertical = cross(forward, right);
  const dot = (v: Vec3) => v.x * center.x + v.y * center.y + v.z * center.z;
  return [
    right.x / extent,
    vertical.x / extent,
    (2 * forward.x) / depth,
    0,
    right.y / extent,
    vertical.y / extent,
    (2 * forward.y) / depth,
    0,
    right.z / extent,
    vertical.z / extent,
    (2 * forward.z) / depth,
    0,
    -dot(right) / extent,
    -dot(vertical) / extent,
    (-2 * dot(forward)) / depth,
    1,
  ];
}
