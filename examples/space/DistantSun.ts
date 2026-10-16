import {
  Mesh3D,
  MeshGeometry,
  Node3D,
  TextureImage,
} from '../../src/3d/index.js';
import type { Vec3 } from '../../src/3d/index.js';

/** Translation-free distant scenery; direction is shared with the actual sun light. */
export function distantSun() {
  const segments = 64,
    radius = 4,
    distance = 450;
  const vertices = [
    { x: 0, y: 0, z: 0 },
    ...Array.from({ length: segments }, (_, i) => {
      const angle = (i / segments) * Math.PI * 2;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: 0 };
    }),
  ];
  const size = 64,
    pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const r = Math.min(
        1,
        Math.hypot(((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1),
      );
      const brightness = 0.78 + 0.22 * Math.sqrt(1 - r * r);
      pixels.set(
        [255 * brightness, 247 * brightness, 220 * brightness, 255].map(
          Math.round,
        ),
        (y * size + x) * 4,
      );
    }
  const node = new Node3D('distant sun');
  node.mesh = new Mesh3D(
    new MeshGeometry(
      vertices,
      Array.from({ length: segments }, (_, i) => ({
        id: String(i),
        indices: [0, i + 1, ((i + 1) % segments) + 1],
        material: 0,
      })),
      [],
      {
        texCoords: vertices.map((p) => [
          p.x / radius / 2 + 0.5,
          p.y / radius / 2 + 0.5,
        ]),
      },
    ),
    [
      {
        color: '#ffffff',
        unlit: true,
        baseColorTexture: {
          image: new TextureImage(size, size, pixels),
          wrapS: 'clamp',
          wrapT: 'clamp',
        },
      },
    ],
  );
  node.castsShadow = node.receivesShadow = false;
  return {
    node,
    update(eye: Vec3, direction: Vec3) {
      const length = Math.hypot(direction.x, direction.y, direction.z);
      if (!Number.isFinite(length) || length <= 0)
        throw new RangeError('Sun direction must be finite and nonzero');
      const d = {
        x: direction.x / length,
        y: direction.y / length,
        z: direction.z / length,
      };
      node.transform = {
        position: {
          x: eye.x + d.x * distance,
          y: eye.y + d.y * distance,
          z: eye.z + d.z * distance,
        },
        rotation: { x: -Math.asin(d.y), y: Math.atan2(d.x, d.z), z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      };
    },
  };
}
