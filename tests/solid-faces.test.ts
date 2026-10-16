import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from '../src/3d/index.js';
import { projectFaces } from '../src/3d/index.js';
import { vertices, faces } from '../examples/3d/CubeGeometry.js';

const cubeFaces = faces.map((face) => ({
  id: face.id,
  color: face.color,
  vertices: face.indices.map((index) => vertices[index]!),
}));
void test('cube winding selects front/right/top from an outside viewpoint and no faces from inside', () => {
  const camera = new PerspectiveCamera();
  camera.x = 8;
  camera.y = 6;
  camera.z = -12;
  camera.yaw = -0.5;
  camera.pitch = -0.32;
  const result = projectFaces(cubeFaces, camera, 800, 400);
  assert.deepEqual(result.visible.map((f) => f.id).sort(), [
    'front',
    'right',
    'top',
  ]);
  assert.equal(result.backFacing, 3);
  camera.x = camera.y = camera.z = 0;
  const inside = projectFaces(cubeFaces, camera, 800, 400);
  assert.equal(inside.visible.length, 0);
  assert.equal(inside.backFacing, 6);
});
void test('opposite viewpoints select the opposite faces, independent of camera orientation', () => {
  const camera = new PerspectiveCamera();
  camera.z = -10;
  assert.deepEqual(
    projectFaces(cubeFaces, camera, 800, 400).visible.map((f) => f.id),
    ['front'],
  );
  camera.z = 10;
  camera.yaw = Math.PI;
  assert.deepEqual(
    projectFaces(cubeFaces, camera, 800, 400).visible.map((f) => f.id),
    ['back'],
  );
  camera.x = 10;
  camera.z = 0;
  camera.yaw = -Math.PI / 2;
  assert.deepEqual(
    projectFaces(cubeFaces, camera, 800, 400).visible.map((f) => f.id),
    ['right'],
  );
});
void test('a face crossing the eye plane produces finite viewport-clipped points', () => {
  const camera = new PerspectiveCamera();
  camera.verticalFov = Math.PI / 2;
  const polygon = [
    { x: -1, y: -1, z: -1 },
    { x: 1, y: -1, z: 1 },
    { x: 1, y: 1, z: 1 },
    { x: -1, y: 1, z: -1 },
  ];
  const clipped = camera.polygon(polygon, 800, 400)!;
  assert.ok(clipped && clipped.points.length >= 3);
  for (const p of clipped.points) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    assert.ok(p.x >= -1e-8 && p.x <= 800 + 1e-8);
    assert.ok(p.y >= -1e-8 && p.y <= 400 + 1e-8);
  }
  assert.equal(
    camera.polygon(
      polygon.map((p) => ({ ...p, z: -2 })),
      800,
      400,
    ),
    null,
  );
});
void test('side planes retain a face spanning the viewport even when its vertices are all outside', () => {
  const camera = new PerspectiveCamera();
  camera.verticalFov = Math.PI / 2;
  const clipped = camera.polygon(
    [
      { x: -100, y: -100, z: 5 },
      { x: 100, y: -100, z: 5 },
      { x: 100, y: 100, z: 5 },
      { x: -100, y: 100, z: 5 },
    ],
    800,
    400,
  )!;
  assert.equal(clipped.points.length, 4);
  const area =
    Math.abs(
      clipped.points.reduce((sum, p, i, points) => {
        const next = points[(i + 1) % points.length]!;
        return sum + p.x * next.y - next.x * p.y;
      }, 0),
    ) / 2;
  assert.ok(Math.abs(area - 800 * 400) < 1e-6);
});
void test('far clipping rejects distant faces and surviving faces are ordered far to near', () => {
  const camera = new PerspectiveCamera();
  const face = (z: number) => ({
    id: String(z),
    color: '#fff',
    vertices: [
      { x: -1, y: -1, z },
      { x: -1, y: 1, z },
      { x: 1, y: 1, z },
      { x: 1, y: -1, z },
    ],
  });
  const result = projectFaces([face(2), face(200), face(4)], camera, 800, 400);
  assert.deepEqual(
    result.visible.map((f) => f.id),
    ['4', '2'],
  );
  assert.equal(result.outside, 1);
});
