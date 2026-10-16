import { matrixPoint } from '../../src/3d/index.js';
import type { Node3D, PointLight3D, Vec3 } from '../../src/3d/index.js';

/** Asset-owned approximation: one existing point light just in front of each LCD.
 * Representative display colors and authored face area approximate backlight output.
 * No radiance sampling, area lights, occlusion or new lighting/domain system.
 */
export function cockpitScreenLights(
  root: Node3D,
): (strength: number, powered: boolean) => readonly PointLight3D[] {
  const names = [
    'display-left__screen-black',
    'display-right__screen-black',
    ...[1, 2, 3].map((i) => `overhead-display-${i}__screen-black`),
  ];
  const sources: { node: Node3D; center: Vec3; area: number; warm: boolean }[] =
    [];
  root.traverse((node) => {
    if (!names.some((name) => node.name === `${name}/instrument`)) return;
    const g = node.mesh?.geometry;
    if (!g)
      throw new Error('Screen illumination requires attached display geometry');
    const indices = [...new Set(g.faces.flatMap((f) => [...f.indices]))];
    const points = indices.map((i) => g.vertices[i]!);
    const xs = points.map((p) => p.x),
      ys = points.map((p) => p.y),
      zs = points.map((p) => p.z);
    const low = { x: Math.min(...xs), y: Math.min(...ys), z: Math.min(...zs) };
    const high = { x: Math.max(...xs), y: Math.max(...ys), z: Math.max(...zs) };
    const area = (high.x - low.x) * (high.y - low.y);
    if (!Number.isFinite(area) || area <= 0 || Math.abs(high.z - low.z) > 1e-5)
      throw new Error(
        'Screen illumination expects planar source display fronts',
      );
    sources.push({
      node,
      area,
      center: {
        x: (low.x + high.x) / 2,
        y: (low.y + high.y) / 2,
        z: high.z + 0.075,
      },
      warm: node.name.startsWith('overhead'),
    });
  });
  if (
    sources.length !== names.length ||
    new Set(sources.map((s) => s.node.name)).size !== names.length
  )
    throw new Error(
      'Screen illumination requires all five authored display fronts',
    );
  const decode = (value: number) => {
    value /= 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const cool = [113, 229, 195].map(decode) as [number, number, number];
  const warm = [233, 189, 112].map(decode) as [number, number, number];
  return (strength, powered) => {
    if (!Number.isFinite(strength) || strength < 0 || strength > 8)
      throw new RangeError('Invalid screen light strength');
    if (!powered || strength === 0) return [];
    return sources.map((source) => ({
      kind: 'point',
      position: matrixPoint(source.node.worldMatrix(), source.center),
      color: source.warm ? warm : cool,
      intensity: source.area * strength,
      minimumDistance: 0.12,
    }));
  };
}
