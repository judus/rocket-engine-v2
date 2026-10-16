import { Mesh3D, MeshGeometry, Node3D } from '../../src/3d/index.js';
import type { GeometryFace, Vec3 } from '../../src/3d/index.js';

/** Cockpit-forward reference mark, built from ordinary unlit geometry.
 * Source glTF axes (+Y up, forward -Z). Lives under the cockpit assembly,
 * so independent camera motion reveals its placement rather than moving it with the eye.
 * No targeting, lock-on, weapons or flight simulation.
 */
export function cockpitReticle(): Node3D {
  const vertices: Vec3[] = [],
    faces: GeometryFace[] = [];
  const strip = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    half = 0.005,
  ) => {
    const length = Math.hypot(x2 - x1, y2 - y1),
      dx = (-(y2 - y1) / length) * half,
      dy = ((x2 - x1) / length) * half;
    const offset = vertices.length;
    vertices.push(
      { x: x1 + dx, y: y1 + dy, z: 0 },
      { x: x2 + dx, y: y2 + dy, z: 0 },
      { x: x2 - dx, y: y2 - dy, z: 0 },
      { x: x1 - dx, y: y1 - dy, z: 0 },
    );
    faces.push({
      id: String(faces.length),
      indices: [offset, offset + 1, offset + 2, offset + 3],
      material: 0,
    });
  };
  // Four interrupted arcs and short cardinal ticks leave the view open.
  for (let quadrant = 0; quadrant < 4; quadrant++) {
    for (let segment = 0; segment < 8; segment++) {
      const a = (quadrant * Math.PI) / 2 + 0.22 + segment * 0.14,
        b = a + 0.14;
      strip(
        Math.cos(a) * 0.15,
        Math.sin(a) * 0.15,
        Math.cos(b) * 0.15,
        Math.sin(b) * 0.15,
        0.004,
      );
    }
    const angle = (quadrant * Math.PI) / 2;
    strip(
      Math.cos(angle) * 0.2,
      Math.sin(angle) * 0.2,
      Math.cos(angle) * 0.27,
      Math.sin(angle) * 0.27,
    );
  }
  strip(-0.009, 0, 0.009, 0, 0.009);
  const node = new Node3D('cockpit forward reticle');
  node.mesh = new Mesh3D(new MeshGeometry(vertices, faces), [
    { color: '#68bda9', unlit: true, metallicFactor: 0, roughnessFactor: 1 },
  ]);
  node.transform = { ...node.transform, position: { x: 0, y: 1.5, z: -8 } };
  node.castsShadow = false;
  node.receivesShadow = false;
  return node;
}
