import type { Node3D } from './Node3D.js';
import { matrixPoint } from './Matrix4.js';
import type { Face } from './SolidFaces.js';

/** Snapshot world-space faces without modifying scene or shared geometry. */
export function collectFaces(root: Node3D): Face[] {
  const faces: Face[] = [];
  root.traverse((node, matrix) => {
    if (!node.mesh) return;
    const { geometry, materials } = node.mesh;
    const world = geometry.vertices.map((p) => matrixPoint(matrix, p));
    const mirrored =
      matrix[0] * (matrix[5] * matrix[10] - matrix[9] * matrix[6]) -
        matrix[4] * (matrix[1] * matrix[10] - matrix[9] * matrix[2]) +
        matrix[8] * (matrix[1] * matrix[6] - matrix[5] * matrix[2]) <
      0;
    for (const face of geometry.faces) {
      const vertices = face.indices.map((i) => world[i]!);
      if (mirrored) vertices.reverse();
      faces.push({
        id: `${node.name}/${face.id}`,
        vertices,
        color: materials[face.material]!.color,
        material: materials[face.material]!,
      });
    }
  });
  return faces;
}
