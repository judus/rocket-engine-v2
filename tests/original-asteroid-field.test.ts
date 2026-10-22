import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Mesh3D, parseGlb } from '../src/3d/index.js';
import { originalAsteroidField } from '../games/farwake/visuals/OriginalAsteroidField.js';

void test('original field retains supplied geometry, stable random materials and 10–1,000 m sizes across regeneration', () => {
  const base = './examples/assets/asteroid-family-v1/';
  const catalog = JSON.parse(readFileSync(base + 'catalog.json', 'utf8')) as {
    asteroids: { geometryFile: string; triangles: number }[];
  };
  const variants = catalog.asteroids.map((entry) => {
    const bytes = readFileSync(base + entry.geometryFile);
    const model = parseGlb(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    );
    assert.equal(model.triangles, 4800);
    const geometry = model.instantiate().nodes.find((n) => n.mesh)!.mesh!
      .geometry;
    return ['#555555', '#777777', '#997766'].map(
      (color) => new Mesh3D(geometry, [{ color }]),
    );
  });
  const field = originalAsteroidField(2126, 96, variants, true);
  const again = originalAsteroidField(2126, 256, variants, true);
  assert.equal(field.children.length, 96);
  assert.ok(new Set(field.children.map((n) => n.mesh)).size > 20);
  field.children.forEach((node, i) => {
    const vertices = node.mesh!.geometry.vertices;
    const extent = Math.max(
      ...(['x', 'y', 'z'] as const).map(
        (axis) =>
          Math.max(...vertices.map((p) => p[axis])) -
          Math.min(...vertices.map((p) => p[axis])),
      ),
    );
    const size = extent * node.transform.scale.x;
    assert.ok(size >= 10 && size <= 1000);
    assert.equal(node.transform.scale.x, node.transform.scale.y);
    assert.equal(node.transform.scale.x, node.transform.scale.z);
    assert.equal(node.mesh, again.children[i]!.mesh);
    assert.deepEqual(node.transform, again.children[i]!.transform);
    assert.ok(variants.some((row) => row.some((mesh) => mesh === node.mesh)));
    assert.equal(node.castsShadow, true);
    assert.equal(node.receivesShadow, true);
    assert.equal(node.parent, field);
  });
  const changed = originalAsteroidField(42, 32, variants, false);
  assert.notDeepEqual(
    changed.children[0]!.transform,
    field.children[0]!.transform,
  );
  assert.equal(changed.children[0]!.castsShadow, false);
});
