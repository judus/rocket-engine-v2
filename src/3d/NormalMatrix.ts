import type { Matrix4 } from './Matrix4.js';
/** Column-major inverse-transpose of an affine transform's linear part.
 * Normals use this instead of the model matrix under nonuniform scale/shear.
 */
export function normalMatrix(m: Matrix4): readonly number[] {
  if (
    m.length !== 16 ||
    !Array.from(m).every(
      (v) => Number.isFinite(v) && Math.abs(v) <= 3.4028234663852886e38,
    ) ||
    m[3] !== 0 ||
    m[7] !== 0 ||
    m[11] !== 0 ||
    m[15] !== 1
  )
    throw new Error('World transform must be Float32-finite and affine');
  const [a, d, g, , b, e, h, , c, f, i] = m;
  const determinant =
    a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (!Number.isFinite(determinant) || determinant === 0)
    throw new Error('Lighting requires an invertible world transform');
  const values = [
    e * i - f * h,
    c * h - b * i,
    b * f - c * e,
    f * g - d * i,
    a * i - c * g,
    c * d - a * f,
    d * h - e * g,
    b * g - a * h,
    a * e - b * d,
  ].map((v) => v / determinant);
  if (
    !values.every(
      (v) => Number.isFinite(v) && Math.abs(v) <= 3.4028234663852886e38,
    )
  )
    throw new Error('Normal matrix exceeds Float32 range');
  return values;
}

/** Sign is evaluated in CPU double precision, avoiding GPU determinant underflow. */
export function linearDeterminant(m: Matrix4): number {
  const [a, d, g, , b, e, h, , c, f, i] = m;
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}
