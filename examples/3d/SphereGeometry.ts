import { MeshGeometry } from '../../src/3d/index.js';
import type { Vec3, GeometryFace } from '../../src/3d/index.js';
/** Example-owned UV sphere for material inspection; no renderer-specific geometry. */
export function sphereGeometry(repeats = 1): MeshGeometry {
  const rings = 24,
    segments = 48;
  const vertices: Vec3[] = [],
    texCoords: [number, number][] = [],
    tangents: [number, number, number, number][] = [],
    faces: GeometryFace[] = [];
  for (let y = 0; y <= rings; y++)
    for (let x = 0; x <= segments; x++) {
      const theta = (y / rings) * Math.PI,
        phi = (x / segments) * 2 * Math.PI;
      vertices.push({
        x: Math.sin(theta) * Math.sin(phi),
        y: Math.cos(theta),
        z: Math.sin(theta) * Math.cos(phi),
      });
      tangents.push([Math.cos(phi), 0, -Math.sin(phi), -1]);
      texCoords.push([(x / segments) * repeats, (y / rings) * repeats]);
    }
  for (let y = 0; y < rings; y++)
    for (let x = 0; x < segments; x++) {
      const a = y * (segments + 1) + x,
        b = a + segments + 1;
      if (y > 0)
        faces.push({ id: `${y}/${x}/a`, indices: [a, b, a + 1], material: 0 });
      if (y < rings - 1)
        faces.push({
          id: `${y}/${x}/b`,
          indices: [a + 1, b, b + 1],
          material: 0,
        });
    }
  return new MeshGeometry(vertices, faces, [], {
    normals: vertices,
    tangents,
    texCoords,
  });
}
