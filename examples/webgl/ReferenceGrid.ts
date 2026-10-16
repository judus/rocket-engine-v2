import { Mesh3D, MeshGeometry, Node3D } from '../../src/3d/index.js';
import type { GeometryFace, Vec3 } from '../../src/3d/index.js';

/** Finite, world-owned reference geometry, independent of the cockpit rig. */
export function referenceGrid(): Node3D {
  const vertices: Vec3[] = [],
    faces: GeometryFace[] = [];
  const strip = (x: number, z: number, alongX: boolean, material: number) => {
    const n = vertices.length,
      half = material > 1 ? 0.025 : 0.012;
    vertices.push(
      ...(alongX
        ? [
            { x: -30, y: 0, z: z - half },
            { x: 30, y: 0, z: z - half },
            { x: 30, y: 0, z: z + half },
            { x: -30, y: 0, z: z + half },
          ]
        : [
            { x: x - half, y: 0, z: -30 },
            { x: x + half, y: 0, z: -30 },
            { x: x + half, y: 0, z: 30 },
            { x: x - half, y: 0, z: 30 },
          ]),
    );
    faces.push({
      id: String(faces.length),
      indices: [n, n + 1, n + 2, n + 3],
      material,
    });
  };
  for (let i = -30; i <= 30; i++) {
    strip(0, i, true, i === 0 ? 2 : i % 5 === 0 ? 1 : 0);
    strip(i, 0, false, i === 0 ? 3 : i % 5 === 0 ? 1 : 0);
  }
  const node = new Node3D('60 × 60 world reference grid');
  node.mesh = new Mesh3D(
    new MeshGeometry(vertices, faces),
    ['#344b60', '#66819b', '#e88065', '#68a7ee'].map((color) => ({
      color,
      metallicFactor: 0,
      roughnessFactor: 1,
      emissiveFactor:
        color === '#344b60' ? [0.025, 0.045, 0.07] : [0.1, 0.15, 0.2],
    })),
  );
  return node;
}
