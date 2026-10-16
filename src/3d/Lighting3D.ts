import type { Face } from './SolidFaces.js';
import type { Vec3 } from './PerspectiveCamera.js';

/** Linear RGB. Light intensity is a nonnegative, unitless preview multiplier. */
export type LinearColor = readonly [number, number, number];
export interface AmbientLight3D {
  readonly kind: 'ambient';
  readonly color: LinearColor;
  readonly intensity: number;
}
export interface DirectionalLight3D {
  readonly kind: 'directional';
  /** World-space direction FROM a surface TOWARD the light; normalized when evaluated. */
  readonly direction: Vec3;
  readonly color: LinearColor;
  readonly intensity: number;
}
export interface PointLight3D {
  readonly kind: 'point';
  readonly position: Vec3;
  readonly color: LinearColor;
  /** Preview strength at one world unit, before the surface-angle factor. */
  readonly intensity: number;
  /** Positive inverse-square denominator clamp; defaults to 0.1 world units. */
  readonly minimumDistance?: number;
}
export type Light3D = AmbientLight3D | DirectionalLight3D | PointLight3D;

function color(values: readonly number[], count: number): void {
  if (
    values.length !== count ||
    !Array.from(values).every((v) => Number.isFinite(v) && v >= 0 && v <= 1)
  )
    throw new Error('Lighting colors must be finite linear components in 0..1');
}
function decode(n: number): number {
  return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}
function encode(n: number): string {
  n = Math.min(1, Math.max(0, n));
  return Math.round(
    255 * (n <= 0.0031308 ? 12.92 * n : 1.055 * n ** (1 / 2.4) - 0.055),
  )
    .toString(16)
    .padStart(2, '0');
}
/** Validate light data and normalize directional vectors, independently of rendering backend. */
export function prepareLights(lights: readonly Light3D[]): readonly Light3D[] {
  return Array.from(lights, (light) => {
    if (!light || !Number.isFinite(light.intensity) || light.intensity < 0)
      throw new Error('Invalid light intensity');
    color(light.color, 3);
    if (light.kind === 'ambient') return light;
    if (light.kind === 'point') {
      const p = light.position,
        minimum = light.minimumDistance ?? 0.1;
      if (
        !p ||
        ![p.x, p.y, p.z, minimum].every(Number.isFinite) ||
        minimum <= 0
      )
        throw new Error('Invalid point light position or minimum distance');
      return light;
    }
    if (light.kind !== 'directional') throw new Error('Unknown light kind');
    const d = light.direction;
    if (!d || ![d.x, d.y, d.z].every(Number.isFinite))
      throw new Error('Invalid light direction');
    const length = Math.hypot(d.x, d.y, d.z);
    if (!Number.isFinite(length) || !length)
      throw new Error('Light direction must be nonzero');
    return {
      ...light,
      direction: { x: d.x / length, y: d.y / length, z: d.z / length },
    };
  });
}

/** Optional flat Lambert diffuse pass. Pure, camera/backend independent; never edits input faces/materials.
 * No shadows, specular/PBR, smooth normals, light transport or tone mapping.
 */
export function shadeFaces(
  faces: readonly Face[],
  lights: readonly Light3D[],
): Face[] {
  const prepared = prepareLights(lights);
  return Array.from(faces, (face) => {
    let base: readonly number[];
    if (face.material?.baseColorFactor) {
      color(face.material.baseColorFactor, 4);
      base = face.material.baseColorFactor;
    } else {
      if (!/^#[\da-f]{6}$/i.test(face.color))
        throw new Error('Lighting requires #rrggbb or linear baseColorFactor');
      base = [1, 3, 5].map((i) =>
        decode(parseInt(face.color.slice(i, i + 2), 16) / 255),
      );
    }
    const emission = face.material?.emissiveFactor ?? [0, 0, 0];
    color(emission, 3);
    const a = face.vertices[0];
    let cx = 0,
      cy = 0,
      cz = 0;
    let nx = 0,
      ny = 0,
      nz = 0;
    // Newell normal handles planar convex polygons even with collinear leading vertices.
    for (let i = 0; i < face.vertices.length; i++) {
      const p = face.vertices[i]!,
        q = face.vertices[(i + 1) % face.vertices.length]!;
      if (![p.x, p.y, p.z].every(Number.isFinite))
        throw new Error('Lighting vertices must be finite');
      cx += p.x / face.vertices.length;
      cy += p.y / face.vertices.length;
      cz += p.z / face.vertices.length;
      nx += (p.y - q.y) * (p.z + q.z);
      ny += (p.z - q.z) * (p.x + q.x);
      nz += (p.x - q.x) * (p.y + q.y);
    }
    const length = Math.hypot(nx, ny, nz);
    if (!a || !Number.isFinite(length))
      throw new Error('Invalid lighting face');
    if (length) {
      nx /= length;
      ny /= length;
      nz /= length;
    }
    const illumination = [0, 0, 0];
    for (const light of prepared) {
      let diffuse = 1,
        attenuation = 1;
      if (light.kind === 'directional') {
        diffuse = Math.max(
          0,
          nx * light.direction.x +
            ny * light.direction.y +
            nz * light.direction.z,
        );
      } else if (light.kind === 'point') {
        const dx = light.position.x - cx,
          dy = light.position.y - cy,
          dz = light.position.z - cz;
        const distance = Math.hypot(dx, dy, dz);
        // At the sample itself the direction is undefined; contribute zero, never NaN.
        if (!distance || !Number.isFinite(distance)) continue;
        diffuse = Math.max(
          0,
          nx * (dx / distance) + ny * (dy / distance) + nz * (dz / distance),
        );
        const denominator = Math.max(distance, light.minimumDistance ?? 0.1);
        attenuation = Math.min(Number.MAX_VALUE, 1 / denominator / denominator);
      }
      for (let channel = 0; channel < 3; channel++)
        illumination[channel]! +=
          light.color[channel]! * light.intensity * diffuse * attenuation;
    }
    const shaded = [0, 1, 2].map((i) =>
      encode((base[i] === 0 ? 0 : base[i]! * illumination[i]!) + emission[i]!),
    );
    return { ...face, color: `#${shaded.join('')}` };
  });
}
