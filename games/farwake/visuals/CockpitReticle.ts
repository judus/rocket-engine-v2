import { acquisitionRadius } from '../AimProjection.js';
import { instrumentPalette } from '../InstrumentPalette.js';
import { Mesh3D, MeshGeometry, Node3D } from '../../../src/3d/index.js';
import type { GeometryFace, Vec3 } from '../../../src/3d/index.js';

/** Shared core stroke for the Hi3D rings and steering line. */
export const cockpitReticleHalfStroke = 0.00514;

/** Cockpit-forward reference mark, built from ordinary unlit geometry.
 * Default placement uses source glTF axes (+Y up, forward -Z). The Hi3D host
 * places its sketch variant on the rigid pilot rig, outside model stretch/sway.
 * Independent camera inspection reveals placement rather than following the eye.
 * Targeting state is applied by the game HUD, independently of geometry.
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
  const parts: Node3D[] = [];
  const takePart = (name: string, opacity = 0.25) => {
    const part = new Node3D(name);
    part.mesh = new Mesh3D(new MeshGeometry(vertices, faces), [
      {
        color: instrumentPalette.primary,
        unlit: true,
        opacity,
        metallicFactor: 0,
        roughnessFactor: 1,
      },
    ]);
    part.castsShadow = part.receivesShadow = false;
    parts.push(part);

    vertices.length = 0;
    faces.length = 0;
    return part;
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
      // Radial edges meet exactly, including the closing seam of a full ring.
      const offset = vertices.length;
      for (const [angle, r] of [
        [a, radius + half],
        [b, radius + half],
        [b, radius - half],
        [a, radius - half],
      ] as const)
        vertices.push({
          x: Math.cos(angle) * r,
          y: Math.sin(angle) * r,
          z: 0,
        });
      faces.push({
        id: String(faces.length),
        indices: [offset, offset + 1, offset + 2, offset + 3],
        material: 0,
      });
    }
  };
  if (style === 'hi3d') {
    // Around 1.5 CSS pixels at the default 60-degree FOV / 750px canvas height.
    const half = cockpitReticleHalfStroke;
    const shapes: [string, (width: number) => void][] = [
      [
        'outer reference ring',
        (width) => arc(acquisitionRadius, 0, Math.PI * 2, 192, width),
      ],
      [
        'projectile direction ring',
        (width) => {
          for (let q = 0; q < 4; q++) {
            const angle = (q * Math.PI) / 2;
            arc(0.36, angle + 0.18, angle + Math.PI / 2 - 0.18, 24, width);
          }
        },
      ],
      ['closed target ring', (width) => arc(0.36, 0, Math.PI * 2, 96, width)],
      ['context range ring', (width) => arc(0.07, 0, Math.PI * 2, 48, width)],
      [
        'fixed cross and dot',
        (width) => {
          for (let q = 0; q < 4; q++) {
            const angle = (q * Math.PI) / 2;
            strip(
              Math.cos(angle) * 0.12,
              Math.sin(angle) * 0.12,
              Math.cos(angle) * 0.17,
              Math.sin(angle) * 0.17,
              width,
            );
          }
          const centre = vertices.length;
          vertices.push({ x: 0, y: 0, z: 0 });
          for (let i = 0; i <= 32; i++) {
            const angle = (i * Math.PI * 2) / 32;
            vertices.push({
              x: Math.cos(angle) * width,
              y: Math.sin(angle) * width,
              z: 0,
            });
            if (i)
              faces.push({
                id: String(faces.length),
                indices: [centre, centre + i, centre + i + 1],
                material: 0,
              });
          }
        },
      ],
    ];
    for (const [name, draw] of shapes) {
      draw(half);
      const core = takePart(name);
      if (name === 'closed target ring') core.visible = false;
      // Broad low-alpha fringes keep the glow visible even below bloom's
      // luminance threshold, without increasing spill from the instruments.
      for (const [spread, opacity] of [
        [4, 0.012],
        [2.5, 0.022],
        [1.6, 0.035],
      ] as const) {
        draw(half * spread);
        const halo = takePart(`${name} glow`, opacity);
        parts.pop();
        core.add(halo);
      }
    }
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
  if (style === 'hi3d') {
    for (const part of parts) node.add(part);
    node.transform = {
      ...node.transform,
      scale: { x: 0.9, y: 0.9, z: 0.9 },
    };
  } else
    node.mesh = new Mesh3D(new MeshGeometry(vertices, faces), [
      {
        color: instrumentPalette.classicReticle,
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
