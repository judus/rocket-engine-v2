import { Node3D, Mesh3D, MeshGeometry } from '../../src/3d/index.js';

/** Two crossing opaque panels: coral is nearer on the left, teal on the right. */
export function createVisibilityModel(): Node3D {
  const root = new Node3D('crossing-panels');
  for (const [name, slope, color] of [
    ['coral', 0.7, '#ee947c'],
    ['teal', -0.7, '#72cfb5'],
  ] as const) {
    const node = new Node3D(name);
    const geometry = new MeshGeometry(
      [
        { x: -2, y: -1.5, z: -2 * slope },
        { x: -2, y: 1.5, z: -2 * slope },
        { x: 2, y: 1.5, z: 2 * slope },
        { x: 2, y: -1.5, z: 2 * slope },
      ],
      [{ id: 'panel', indices: [0, 1, 2, 3], material: 0 }],
    );
    node.mesh = new Mesh3D(geometry, [{ color }]);
    root.add(node);
  }
  return root;
}
