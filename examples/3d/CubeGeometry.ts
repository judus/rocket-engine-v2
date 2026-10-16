import { MeshGeometry } from '../../src/3d/index.js';
import type { Vec3 } from '../../src/3d/index.js';

export const vertices: readonly Vec3[] = [
  { x: -1, y: -1, z: -1 },
  { x: 1, y: -1, z: -1 },
  { x: 1, y: 1, z: -1 },
  { x: -1, y: 1, z: -1 },
  { x: -1, y: -1, z: 1 },
  { x: 1, y: -1, z: 1 },
  { x: 1, y: 1, z: 1 },
  { x: -1, y: 1, z: 1 },
];
export const edges = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 0],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
] as const;

export const faces = [
  { id: 'front', indices: [0, 3, 2, 1], color: '#65a9b6' },
  { id: 'back', indices: [4, 5, 6, 7], color: '#9e87b5' },
  { id: 'left', indices: [0, 4, 7, 3], color: '#d8b882' },
  { id: 'right', indices: [1, 2, 6, 5], color: '#729bc7' },
  { id: 'bottom', indices: [0, 1, 5, 4], color: '#687d95' },
  { id: 'top', indices: [3, 7, 6, 2], color: '#8ccbb3' },
] as const;

/** One indexed asset shared by the wireframe and solid consumers. */
export const cubeGeometry = new MeshGeometry(
  vertices,
  faces.map((face, material) => ({
    id: face.id,
    indices: face.indices,
    material,
  })),
  edges,
);
export const cubeMaterials = faces.map((face) => ({ color: face.color }));
