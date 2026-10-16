import { TextureImage } from './TextureImage.js';
import type { Vec3 } from './PerspectiveCamera.js';
import type { LinearColor } from './Lighting3D.js';

/** WebGL cube-face order: +X, -X, +Y, -Y, +Z, -Z. Rows follow cube t, without upload flipping. */
export type CubeFaces = readonly [
  TextureImage,
  TextureImage,
  TextureImage,
  TextureImage,
  TextureImage,
  TextureImage,
];
export class EnvironmentMap {
  readonly specular: readonly CubeFaces[];
  readonly diffuse: CubeFaces;
  readonly brdf: TextureImage;
  constructor(
    specular: readonly CubeFaces[],
    diffuse: CubeFaces,
    brdf: TextureImage,
  ) {
    const copy = (faces: CubeFaces, size: number): CubeFaces => {
      if (
        faces.length !== 6 ||
        faces.some(
          (f) =>
            !(f instanceof TextureImage) ||
            f.colorSpace !== 'linear' ||
            f.width !== size ||
            f.height !== size,
        )
      )
        throw new Error(
          'Environment faces must be six equally sized linear squares',
        );
      return Object.freeze([...faces]) as unknown as CubeFaces;
    };
    const size = specular[0]?.[0]?.width ?? 0;
    if (
      size < 2 ||
      size > 256 ||
      (size & (size - 1)) !== 0 ||
      specular.length !== Math.log2(size) + 1
    )
      throw new Error(
        'Environment requires a complete power-of-two GGX mip chain, size 2..256',
      );
    this.specular = Object.freeze(specular.map((f, i) => copy(f, size >> i)));
    this.diffuse = copy(diffuse, diffuse[0]?.width ?? 0);
    if (
      diffuse[0].width > 64 ||
      !(brdf instanceof TextureImage) ||
      brdf.colorSpace !== 'linear' ||
      brdf.width !== brdf.height ||
      brdf.width > 256
    )
      throw new Error('Invalid diffuse environment or BRDF lookup');
    this.brdf = brdf;
    Object.freeze(this);
  }
}
export interface EnvironmentLight3D {
  readonly map: EnvironmentMap;
  readonly intensity?: number;
  /** World-to-environment yaw, radians. Background rendering is independent. */
  readonly rotation?: number;
}
export function cubeDirection(face: number, u: number, v: number): Vec3 {
  if (
    !Number.isInteger(face) ||
    face < 0 ||
    face > 5 ||
    ![u, v].every(Number.isFinite)
  )
    throw new Error('Invalid cube direction');
  const xyz = [
    [1, -v, -u],
    [-1, -v, u],
    [u, 1, v],
    [u, -1, -v],
    [u, -v, 1],
    [-u, -v, -1],
  ][face]!;
  const d = Math.hypot(...xyz);
  return { x: xyz[0]! / d, y: xyz[1]! / d, z: xyz[2]! / d };
}
type Vector = readonly [number, number, number];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vector): Vector => {
  const d = Math.hypot(...a);
  return [a[0] / d, a[1] / d, a[2] / d];
};
const cross = (a: Vector, b: Vector): Vector => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
function radicalInverse(n: number): number {
  let result = 0,
    fraction = 0.5;
  while (n) {
    result += (n & 1) * fraction;
    n >>>= 1;
    fraction *= 0.5;
  }
  return result;
}
function halfVector(x: number, y: number, r: number): Vector {
  const a = Math.max(r, 0.045) ** 2,
    c = Math.sqrt((1 - y) / (1 + (a * a - 1) * y)),
    s = Math.sqrt(Math.max(0, 1 - c * c)),
    p = 2 * Math.PI * x;
  return [Math.cos(p) * s, Math.sin(p) * s, c];
}
function basis(n: Vector) {
  const t = unit(cross(Math.abs(n[2]) < 0.999 ? [0, 0, 1] : [1, 0, 0], n)),
    b = cross(n, t);
  return (h: Vector): Vector => [
    t[0] * h[0] + b[0] * h[1] + n[0] * h[2],
    t[1] * h[0] + b[1] * h[1] + n[1] * h[2],
    t[2] * h[0] + b[2] * h[1] + n[2] * h[2],
  ];
}
/** Offline-style bounded preprocessing. Hammersley/GGX split-sum, correlated Smith visibility.
 * No DOM, renderer, clock or workers. Radiance is linear RGB in 0..1; RGBA8 output.
 * Use a worker/offline bake for larger environments; never call per frame.
 */
export function bakeEnvironment(
  sample: (direction: Vec3) => LinearColor,
  options: {
    size?: number;
    samples?: number;
    diffuseSize?: number;
    lutSize?: number;
  } = {},
): EnvironmentMap {
  const { size = 32, samples = 128, diffuseSize = 8, lutSize = 32 } = options;
  if (
    !Number.isInteger(size) ||
    size < 2 ||
    size > 128 ||
    size & (size - 1) ||
    !Number.isInteger(samples) ||
    samples < 16 ||
    samples > 512 ||
    !Number.isInteger(diffuseSize) ||
    diffuseSize < 1 ||
    diffuseSize > 32 ||
    !Number.isInteger(lutSize) ||
    lutSize < 2 ||
    lutSize > 128
  )
    throw new Error('Environment bake exceeds supported budget');
  const read = (d: Vector): LinearColor => {
    const color = sample({ x: d[0], y: d[1], z: d[2] });
    if (
      color.length !== 3 ||
      !color.every((v) => Number.isFinite(v) && v >= 0 && v <= 1)
    )
      throw new Error('Environment radiance must be linear RGB in 0..1');
    return color;
  };
  const image = (width: number, write: (x: number, y: number) => Vector) => {
    const pixels = new Uint8Array(width * width * 4);
    for (let y = 0; y < width; y++)
      for (let x = 0; x < width; x++) {
        const c = write(x, y);
        pixels.set(
          [
            Math.round(Math.max(0, Math.min(1, c[0])) * 255),
            Math.round(Math.max(0, Math.min(1, c[1])) * 255),
            Math.round(Math.max(0, Math.min(1, c[2])) * 255),
            255,
          ],
          (y * width + x) * 4,
        );
      }
    return new TextureImage(width, width, pixels, { colorSpace: 'linear' });
  };
  const cube = (width: number, roughness: number, diffuse = false): CubeFaces =>
    Array.from({ length: 6 }, (_, face) =>
      image(width, (x, y) => {
        const d = cubeDirection(
            face,
            (2 * (x + 0.5)) / width - 1,
            (2 * (y + 0.5)) / width - 1,
          ),
          n: Vector = [d.x, d.y, d.z];
        if (!diffuse && roughness === 0) return read(n);
        const orient = basis(n);
        let total = 0;
        const sum = [0, 0, 0];
        for (let i = 0; i < samples; i++) {
          const xi = i / samples,
            yi = radicalInverse(i);
          let l: Vector;
          if (diffuse) {
            const p = 2 * Math.PI * xi,
              r = Math.sqrt(yi);
            l = orient([Math.cos(p) * r, Math.sin(p) * r, Math.sqrt(1 - yi)]);
          } else {
            const h = orient(halfVector(xi, yi, roughness)),
              nh = dot(n, h);
            l = [
              2 * nh * h[0] - n[0],
              2 * nh * h[1] - n[1],
              2 * nh * h[2] - n[2],
            ];
          }
          const weight = diffuse ? 1 : Math.max(dot(n, l), 0);
          if (weight > 0) {
            const c = read(l);
            for (let k = 0; k < 3; k++) sum[k] = sum[k]! + c[k]! * weight;
            total += weight;
          }
        }
        return sum.map((v) => v / (total || 1)) as unknown as Vector;
      }),
    ) as unknown as CubeFaces;
  const levels = Math.log2(size) + 1;
  const specular = Array.from({ length: levels }, (_, i) =>
    cube(size >> i, i / (levels - 1)),
  );
  const diffuse = cube(diffuseSize, 1, true); // cosine weighted mean = irradiance / pi
  const brdf = image(lutSize, (x, y) => {
    const nv = (x + 0.5) / lutSize,
      r = (y + 0.5) / lutSize,
      a = Math.max(r, 0.045) ** 2,
      a2 = a * a,
      v: Vector = [Math.sqrt(1 - nv * nv), 0, nv];
    let A = 0,
      B = 0;
    for (let i = 0; i < samples; i++) {
      const h = halfVector(i / samples, radicalInverse(i), r),
        vh = Math.max(dot(v, h), 0),
        l: Vector = [2 * vh * h[0] - v[0], 2 * vh * h[1], 2 * vh * h[2] - nv],
        nl = Math.max(l[2], 0),
        nh = h[2];
      if (nl <= 0 || nh <= 0) continue;
      const visibility =
        0.5 /
        (nl * Math.sqrt(nv * nv * (1 - a2) + a2) +
          nv * Math.sqrt(nl * nl * (1 - a2) + a2));
      const weight = (4 * visibility * nl * vh) / nh,
        f = (1 - vh) ** 5;
      A += (1 - f) * weight;
      B += f * weight;
    }
    return [A / samples, B / samples, 0];
  });
  return new EnvironmentMap(specular, diffuse, brdf);
}
