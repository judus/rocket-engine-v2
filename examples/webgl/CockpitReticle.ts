import { Mesh3D, MeshGeometry, Node3D } from '../../src/3d/index.js';
import type { GeometryFace, Vec3 } from '../../src/3d/index.js';

/** Cockpit-forward reference mark, built from ordinary unlit geometry.
 * Default placement uses source glTF axes (+Y up, forward -Z). The Hi3D host
 * places its sketch variant on the rigid pilot rig, outside model stretch/sway.
 * Independent camera inspection reveals placement rather than following the eye.
 * No targeting, lock-on, weapons or flight simulation.
 */
export function cockpitReticle(style: 'classic' | 'hi3d' = 'classic'): Node3D {
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
  const arc = (
    radius: number,
    start: number,
    end: number,
    segments: number,
    half: number,
  ) => {
    for (let i = 0; i < segments; i++) {
      const a = start + ((end - start) * i) / segments;
      const b = start + ((end - start) * (i + 1)) / segments;
      strip(
        Math.cos(a) * radius,
        Math.sin(a) * radius,
        Math.cos(b) * radius,
        Math.sin(b) * radius,
        half,
      );
    }
  };
  if (style === 'hi3d') {
    // Julien's sketch: large fine circle, quarter arcs, paired radial ticks,
    // small centre ring and dot. No lock-on or implied target state.
    const outer = 1.15,
      inner = 0.36,
      centre = 0.07,
      half = 0.0025;
    arc(outer, 0, Math.PI * 2, 192, half);
    for (let q = 0; q < 4; q++) {
      const angle = (q * Math.PI) / 2;
      arc(inner, angle + 0.18, angle + Math.PI / 2 - 0.18, 24, half);
      for (const offset of [-0.14, 0.14]) {
        const a = angle + offset;
        strip(
          Math.cos(a) * 0.34,
          Math.sin(a) * 0.34,
          Math.cos(a) * 0.42,
          Math.sin(a) * 0.42,
          half,
        );
      }
      strip(
        Math.cos(angle) * 0.065,
        Math.sin(angle) * 0.065,
        Math.cos(angle) * 0.115,
        Math.sin(angle) * 0.115,
        half,
      );
    }
    arc(centre, 0, Math.PI * 2, 40, half);
    strip(-0.004, 0, 0.004, 0, 0.004);
  } else {
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
  }
  const node = new Node3D('cockpit forward reticle');
  node.mesh = new Mesh3D(new MeshGeometry(vertices, faces), [
    {
      color: style === 'hi3d' ? '#86ead6' : '#68bda9',
      unlit: true,
      metallicFactor: 0,
      roughnessFactor: 1,
    },
  ]);
  node.transform = { ...node.transform, position: { x: 0, y: 1.5, z: -8 } };
  node.castsShadow = false;
  node.receivesShadow = false;
  return node;
}
