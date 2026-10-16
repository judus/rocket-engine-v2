import { Mesh3D, MeshGeometry, Node3D } from '../../src/3d/index.js';
import type { TextureBinding3D } from '../../src/3d/index.js';

/** Hand-fitted glass inserts for the flattened Hi3D v3 facade, in preview units
 * before Julien's fit. Add beneath asset placement with its uniform scale undone.
 * Separate surfaces preserve the generated mesh, its texture and bezel artwork.
 */
export function hi3dCockpitDisplays(
  radar: TextureBinding3D,
  flight: TextureBinding3D,
  overhead: readonly [TextureBinding3D, TextureBinding3D, TextureBinding3D],
): Node3D {
  const root = new Node3D('Hi3D fitted instruments');
  const screen = (
    name: string,
    left: number,
    right: number,
    bottom: number,
    top: number,
    z: number,
    binding: TextureBinding3D,
  ) => {
    const node = new Node3D(name);
    node.mesh = new Mesh3D(
      new MeshGeometry(
        [
          { x: left, y: bottom, z },
          { x: right, y: bottom, z },
          { x: right, y: top, z },
          { x: left, y: top, z },
        ],
        [{ id: name, indices: [0, 1, 2, 3], material: 0 }],
        [],
        {
          texCoords: [
            [0, 1],
            [1, 1],
            [1, 0],
            [0, 0],
          ],
        },
      ),
      [
        {
          color: '#ffffff',
          baseColorFactor: [1, 1, 1, 1],
          baseColorTexture: binding,
          unlit: true,
          metallicFactor: 0,
          roughnessFactor: 1,
        },
      ],
    );
    node.castsShadow = node.receivesShadow = false;
    root.add(node);
  };
  // Roughly six extra CSS pixels across/vertically at the tuned pilot view.
  screen('Hi3D radar', -1.955, -0.415, -0.577, 0.507, -0.525, radar);
  screen('Hi3D flight', 0.51, 2.05, -0.577, 0.507, -0.525, flight);
  // Medium / small / large: attitude, speed, then the longer XYZ readout.
  screen('Hi3D attitude', -2.47, -1.69, 3.3, 3.46, -0.465, overhead[0]);
  screen('Hi3D speed', -1.4, -0.72, 3.3, 3.46, -0.465, overhead[1]);
  screen('Hi3D position', -0.43, 0.46, 3.3, 3.46, -0.465, overhead[2]);
  return root;
}
