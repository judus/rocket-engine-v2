import { Node3D } from '../../src/3d/index.js';
import type { Mesh3D } from '../../src/3d/index.js';
import { cockpitAsteroidField } from './CockpitAsteroidField.js';

/** Example-owned seeded choices, made once. Images and immutable geometry stay shared.
 * Scaling retains the supplied UVs: texture features grow with each scaled body.
 */
export function originalAsteroidField(
  seed: number,
  count: number,
  variants: readonly (readonly Mesh3D[])[],
  shadows: boolean,
): Node3D {
  const field = cockpitAsteroidField(seed, count, shadows);
  let state = (seed ^ 0x73af41) >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const extents = variants.map((row) => {
    const vertices = row[0]!.geometry.vertices;
    return Math.max(
      ...(['x', 'y', 'z'] as const).map((axis) => {
        let min = Infinity,
          max = -Infinity;
        for (const p of vertices) {
          min = Math.min(min, p[axis]);
          max = Math.max(max, p[axis]);
        }
        return max - min;
      }),
    );
  });
  const nodes = field.children;
  nodes.forEach((node) => {
    const shape = Math.floor(random() * variants.length);
    const material = Math.floor(random() * variants[shape]!.length);
    const size = 10 + random() * 990;
    const scale = size / extents[shape]!;
    node.mesh = variants[shape]![material]!;
    node.transform = {
      ...node.transform,
      position: {
        x: node.transform.position.x * 64,
        y: node.transform.position.y * 64,
        z: node.transform.position.z * 64,
      },
      scale: { x: scale, y: scale, z: scale },
    };
  });
  const root = new Node3D(
    `Original asteroid family · seed ${seed} · random 10–1,000 m`,
  );
  root.transform = field.transform;
  for (const node of nodes) root.add(node);
  return root;
}
