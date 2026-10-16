import test from 'node:test';
import assert from 'node:assert/strict';
import { distantSun } from '../examples/space/DistantSun.js';
import { matrixPoint } from '../src/3d/index.js';

void test('distant sun shares light direction without translation parallax and never casts shadows', () => {
  const sun = distantSun(),
    direction = { x: -0.6, y: 0.35, z: -0.72 };
  const eye = { x: 20, y: -10, z: 80 };
  sun.update(eye, direction);
  const p = sun.node.transform.position,
    length = Math.hypot(direction.x, direction.y, direction.z);
  assert.ok(Math.abs((p.x - eye.x) / 450 - direction.x / length) < 1e-12);
  const forward = matrixPoint(sun.node.worldMatrix(), { x: 0, y: 0, z: 1 });
  assert.ok(Math.abs(forward.y - p.y - direction.y / length) < 1e-12);
  sun.update({ x: 120, y: -5, z: 280 }, direction);
  assert.ok(Math.abs(sun.node.transform.position.x - p.x - 100) < 1e-12);
  assert.equal(sun.node.castsShadow, false);
  assert.equal(sun.node.receivesShadow, false);
  assert.equal(sun.node.mesh!.materials[0]!.unlit, true);
  assert.equal(sun.node.mesh!.geometry.faces.length, 64);
  assert.throws(() => sun.update(eye, { x: 0, y: 0, z: 0 }), /nonzero/);
});
