import { cubeGeometry } from './CubeGeometry.js';
import { Node3D, Mesh3D, MeshGeometry } from '../../src/3d/index.js';

/** Same reference shapes for the isolated lighting milestones. */
export function createLightingModel(floorDivisions = 1): Node3D {
  const root = new Node3D('shapes'),
    cube = new Node3D('cube'),
    gem = new Node3D('octahedron');
  cube.mesh = new Mesh3D(
    cubeGeometry,
    Array.from({ length: 6 }, () => ({ color: '#c7d3dc' })),
  );
  cube.transform = {
    position: { x: -1.8, y: 1.1, z: 0 },
    rotation: { x: 0.16, y: 0.25, z: 0 },
    scale: { x: 0.85, y: 1.1, z: 0.85 },
  };
  const points = [
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: -1 },
    { x: 0, y: -1, z: 0 },
  ];
  const triangles = [
    [0, 2, 1],
    [0, 3, 2],
    [0, 4, 3],
    [0, 1, 4],
    [5, 1, 2],
    [5, 2, 3],
    [5, 3, 4],
    [5, 4, 1],
  ];
  gem.mesh = new Mesh3D(
    new MeshGeometry(
      points,
      triangles.map((indices, i) => ({
        id: String(i),
        indices,
        material: 0,
      })),
    ),
    [{ color: '#d6a66e' }],
  );
  gem.transform = {
    position: { x: 1.7, y: 1.4, z: 0.2 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1.1, y: 1.4, z: 1.1 },
  };
  const floor = new Node3D('floor');
  const vertices = [],
    faces = [];
  for (let z = 0; z < floorDivisions; z++)
    for (let x = 0; x < floorDivisions; x++) {
      const x0 = -5 + (10 * x) / floorDivisions,
        x1 = -5 + (10 * (x + 1)) / floorDivisions;
      const z0 = -3 + (7 * z) / floorDivisions,
        z1 = -3 + (7 * (z + 1)) / floorDivisions;
      const first = vertices.length;
      vertices.push(
        { x: x0, y: 0, z: z0 },
        { x: x0, y: 0, z: z1 },
        { x: x1, y: 0, z: z1 },
        { x: x1, y: 0, z: z0 },
      );
      faces.push({
        id: `tile-${x}-${z}`,
        indices: [first, first + 1, first + 2, first + 3],
        material: 0,
      });
    }
  floor.mesh = new Mesh3D(new MeshGeometry(vertices, faces), [
    { color: '#647583' },
  ]);
  root.add(cube).add(gem).add(floor);
  return root;
}
