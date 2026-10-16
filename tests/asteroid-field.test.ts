import test from 'node:test';
import assert from 'node:assert/strict';
import { asteroidField } from '../examples/space/AsteroidField.js';

void test('seeded field reproduces geometry and placements, with stable count prefixes', () => {
  const a = asteroidField(2126, 32).children;
  const b = asteroidField(2126, 96).children;
  for (let i = 0; i < a.length; i++) {
    assert.deepEqual(a[i]!.transform, b[i]!.transform);
    assert.deepEqual(a[i]!.mesh!.geometry, b[i]!.mesh!.geometry);
  }
  const other = asteroidField(2127, 32).children;
  assert.notDeepEqual(a[0]!.transform, other[0]!.transform);
  assert.notDeepEqual(
    a[0]!.mesh!.geometry.vertices,
    other[0]!.mesh!.geometry.vertices,
  );
  assert.equal(new Set(b.map((node) => node.mesh)).size, 8);
  assert.equal(b[0]!.mesh, b[8]!.mesh);
});

void test('rock meshes are closed, nondegenerate and outward wound after displacement', () => {
  for (const seed of [0, 2126, 0xffffffff]) {
    const field = asteroidField(seed, 256);
    for (const mesh of new Set(field.children.map((n) => n.mesh!))) {
      const geometry = mesh.geometry;
      assert.equal(geometry.vertices.length, 66);
      assert.equal(geometry.faces.length, 128);
      const edges = new Map<string, number>();
      for (const face of geometry.faces) {
        const [ai, bi, ci] = face.indices;
        const a = geometry.vertices[ai!]!,
          b = geometry.vertices[bi!]!,
          c = geometry.vertices[ci!]!;
        const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
        const ac = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
        const normal = {
          x: ab.y * ac.z - ab.z * ac.y,
          y: ab.z * ac.x - ab.x * ac.z,
          z: ab.x * ac.y - ab.y * ac.x,
        };
        assert.ok(normal.x * a.x + normal.y * a.y + normal.z * a.z > 0);
        for (const [from, to] of [
          [ai!, bi!],
          [bi!, ci!],
          [ci!, ai!],
        ]) {
          const key = `${Math.min(from!, to!)}/${Math.max(from!, to!)}`;
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      assert.ok([...edges.values()].every((n) => n === 2));
    }
    for (const { transform: t } of field.children) {
      assert.ok(Math.abs(t.position.x) <= 50 && Math.abs(t.position.y) <= 25);
      assert.ok(t.position.z >= 8 && t.position.z <= 158);
      assert.ok(
        Object.values(t.scale).every((v) => v > 0 && Number.isFinite(v)),
      );
    }
  }
});

void test('invalid generation parameters reject before creating a field', () => {
  for (const seed of [-1, 0.1, NaN, Infinity, 4294967296])
    assert.throws(() => asteroidField(seed));
  for (const count of [0, 257, 1.5, NaN])
    assert.throws(() => asteroidField(0, count));
});
