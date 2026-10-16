import type { Light3D } from '../3d/Lighting3D.js';
import { prepareLights } from '../3d/Lighting3D.js';

export const maxGpuLights = 14;
export interface LightUniforms {
  readonly count: number;
  readonly vectors: Float32Array;
  readonly colors: Float32Array;
  readonly minimums: Float32Array;
}
/** Explicit bounded GPU adapter for the existing independent light contracts. */
export function lightUniforms(lights: readonly Light3D[]): LightUniforms {
  if (lights.length > maxGpuLights)
    throw new RangeError(
      `GPU lighting supports at most ${maxGpuLights} lights`,
    );
  const prepared = prepareLights(lights);
  const vectors = new Float32Array(maxGpuLights * 4),
    colors = new Float32Array(maxGpuLights * 4),
    minimums = new Float32Array(maxGpuLights);
  prepared.forEach((light, index) => {
    if (light.intensity > 1e6)
      throw new RangeError('GPU light intensity must be at most 1000000');
    colors.set([...light.color, light.intensity], index * 4);
    const vector =
      light.kind === 'directional'
        ? light.direction
        : light.kind === 'point'
          ? light.position
          : { x: 0, y: 0, z: 0 };
    vectors.set(
      [
        vector.x,
        vector.y,
        vector.z,
        light.kind === 'ambient' ? 0 : light.kind === 'directional' ? 1 : 2,
      ],
      index * 4,
    );
    const minimum =
      light.kind === 'point' ? (light.minimumDistance ?? 0.1) : 0.1;
    if (minimum < 1e-4 || minimum > 1e6)
      throw new RangeError('GPU minimum distance must be in 0.0001..1000000');
    minimums[index] = minimum;
  });
  if (
    !Array.from(vectors).every((v) => Number.isFinite(v) && Math.abs(v) <= 1e6)
  )
    throw new RangeError('GPU light coordinates must be within +/-1000000');
  return { count: prepared.length, vectors, colors, minimums };
}
