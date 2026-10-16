import { vertices, faces } from './CubeGeometry.js';
import {
  MeshGeometry,
  Mesh3D,
  Node3D,
  collectFaces,
} from '../../src/3d/index.js';
import type { Transform3D, Face } from '../../src/3d/index.js';

export interface BoxPart {
  readonly id: string;
  readonly transform: Transform3D;
  readonly color: string;
}
const boxGeometry = new MeshGeometry(
  vertices,
  faces.map((face, material) => ({
    id: face.id,
    indices: face.indices,
    material,
  })),
);

/** Demo-owned layout and fixed face tints; hierarchy/rendering belong to Rocket. */
export function createBoxAssembly(parts: readonly BoxPart[]): Node3D {
  const root = new Node3D('cockpit');
  for (const part of parts) {
    const node = new Node3D(part.id);
    node.transform = part.transform;
    const rgb = Number.parseInt(part.color.slice(1), 16);
    node.mesh = new Mesh3D(
      boxGeometry,
      [0.8, 0.65, 0.7, 0.9, 0.5, 1].map((tint) => ({
        color:
          '#' +
          [rgb >> 16, (rgb >> 8) & 255, rgb & 255]
            .map((channel) =>
              Math.round(channel * tint)
                .toString(16)
                .padStart(2, '0'),
            )
            .join(''),
      })),
    );
    root.add(node);
  }
  return root;
}

/** Static snapshot convenience for the assembly proof. */
export function boxAssembly(
  parts: readonly BoxPart[],
  parent: Transform3D,
): Face[] {
  const root = createBoxAssembly(parts);
  root.transform = parent;
  return collectFaces(root);
}
