import { Mesh3D, MeshGeometry, Node3D } from '../../src/3d/index.js';
import type { Vec3 } from '../../src/3d/index.js';

/** Example-owned seeded content. No clock, GPU handles or engine registration. */
export function asteroidField(seed: number, count = 96): Node3D {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
    throw new Error('Seed must be an unsigned 32-bit integer');
  if (!Number.isInteger(count) || count < 1 || count > 256)
    throw new Error('Asteroid count must be between 1 and 256');
  const random = (initial: number) => {
    let state = initial >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), state | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const shapeRandom = random(seed ^ 0x51f15e);
  const colors = ['#a49b8b', '#858f9b', '#a38b7b', '#8d9290'];
  const shapes = Array.from({ length: 8 }, (_, variant) => {
    const vertices: Vec3[] = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
    ];
    let triangles = [
      [2, 4, 0],
      [2, 1, 4],
      [2, 5, 1],
      [2, 0, 5],
      [3, 0, 4],
      [3, 4, 1],
      [3, 1, 5],
      [3, 5, 0],
    ];
    // Two midpoint subdivisions of an octahedron: 66 vertices, 128 facets.
    for (let level = 0; level < 2; level++) {
      const midpoints = new Map<string, number>();
      const midpoint = (a: number, b: number) => {
        const key = `${Math.min(a, b)}/${Math.max(a, b)}`;
        const cached = midpoints.get(key);
        if (cached !== undefined) return cached;
        const p = vertices[a]!,
          q = vertices[b]!;
        const x = p.x + q.x,
          y = p.y + q.y,
          z = p.z + q.z;
        const length = Math.hypot(x, y, z);
        const index =
          vertices.push({ x: x / length, y: y / length, z: z / length }) - 1;
        midpoints.set(key, index);
        return index;
      };
      triangles = triangles.flatMap(([a, b, c]) => {
        const ab = midpoint(a!, b!),
          bc = midpoint(b!, c!),
          ca = midpoint(c!, a!);
        return [
          [a!, ab, ca],
          [ab, b!, bc],
          [ca, bc, c!],
          [ab, bc, ca],
        ];
      });
    }
    const irregular = vertices.map((p) => {
      const radius = 0.8 + shapeRandom() * 0.4;
      return { x: p.x * radius, y: p.y * radius, z: p.z * radius };
    });
    return new Mesh3D(
      new MeshGeometry(
        irregular,
        triangles.map((indices, i) => ({
          id: String(i),
          indices,
          material: 0,
        })),
      ),
      [{ color: colors[variant % colors.length]! }],
    );
  });
  // Separate sequence: changing count preserves the existing placements/shapes.
  const place = random(seed);
  const root = new Node3D(`Asteroid field · seed ${seed}`);
  for (let i = 0; i < count; i++) {
    const node = new Node3D(`asteroid-${i}`);
    node.mesh = shapes[i % shapes.length]!;
    const radius = 0.7 + place() ** 2 * 3.3;
    node.transform = {
      position: {
        x: (place() - 0.5) * 100,
        y: (place() - 0.5) * 50,
        z: 8 + place() * 150,
      },
      rotation: {
        x: place() * Math.PI * 2,
        y: place() * Math.PI * 2,
        z: place() * Math.PI * 2,
      },
      scale: {
        x: radius * (0.7 + place() * 0.6),
        y: radius * (0.7 + place() * 0.6),
        z: radius * (0.7 + place() * 0.6),
      },
    };
    root.add(node);
  }
  return root;
}
