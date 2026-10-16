import { transformPoint } from './Transform3D.js';
import type { Transform3D } from './Transform3D.js';
import type { Vec3 } from './PerspectiveCamera.js';

/** Column-major matrix, applied to column vectors. */
export type Matrix4 = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export const identityMatrix: Matrix4 = Object.freeze([
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
]);

/** Affine point transform; perspective matrices require a homogeneous divide. */
export function matrixPoint(m: Matrix4, p: Vec3): Vec3 {
  return {
    x: m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
    y: m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
    z: m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
  };
}

/** Parent * local. Affine matrices preserve nested nonuniform scale/shear. */
export function multiplyMatrices(a: Matrix4, b: Matrix4): Matrix4 {
  const values = Array.from({ length: 16 }, (_, i) => {
    const row = i % 4,
      column = Math.floor(i / 4) * 4;
    return (
      a[row]! * b[column]! +
      a[row + 4]! * b[column + 1]! +
      a[row + 8]! * b[column + 2]! +
      a[row + 12]! * b[column + 3]!
    );
  });
  return values as unknown as Matrix4;
}

export function transformMatrix(transform: Transform3D): Matrix4 {
  for (const vector of [
    transform.position,
    transform.rotation,
    transform.scale,
  ])
    if (![vector.x, vector.y, vector.z].every(Number.isFinite))
      throw new Error('Transform components must be finite');
  const linear = { ...transform, position: { x: 0, y: 0, z: 0 } };
  const x = transformPoint({ x: 1, y: 0, z: 0 }, linear);
  const y = transformPoint({ x: 0, y: 1, z: 0 }, linear);
  const z = transformPoint({ x: 0, y: 0, z: 1 }, linear);
  const p = transform.position;
  return [
    x.x,
    x.y,
    x.z,
    0,
    y.x,
    y.y,
    y.z,
    0,
    z.x,
    z.y,
    z.z,
    0,
    p.x,
    p.y,
    p.z,
    1,
  ];
}
