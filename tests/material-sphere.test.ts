import test from 'node:test';
import assert from 'node:assert/strict';
import { sphereGeometry } from '../examples/3d/SphereGeometry.js';
void test('material-inspection sphere has outward winding, smooth unit normals and a complete UV seam', () => {
  const geometry = sphereGeometry(2);
  assert.equal(geometry.faces.length, 2208);
  assert.equal(geometry.normals.length, geometry.vertices.length);
  for (const [i, n] of geometry.normals.entries()) {
    assert.ok(Math.abs(Math.hypot(n.x, n.y, n.z) - 1) < 1e-12);
    assert.equal(geometry.texCoords[i]!.length, 2);
  }
  for (const face of geometry.faces) {
    const [a, b, c] = face.indices.map((i) => geometry.vertices[i]!);
    const u = { x: b!.x - a!.x, y: b!.y - a!.y, z: b!.z - a!.z },
      v = { x: c!.x - a!.x, y: c!.y - a!.y, z: c!.z - a!.z };
    const cross = {
      x: u.y * v.z - u.z * v.y,
      y: u.z * v.x - u.x * v.z,
      z: u.x * v.y - u.y * v.x,
    };
    assert.ok(cross.x * a!.x + cross.y * a!.y + cross.z * a!.z > 0);
  }
  assert.deepEqual(geometry.texCoords[0], [0, 0]);
  assert.deepEqual(geometry.texCoords[48], [2, 0]);
});
