import test from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera } from '../src/3d/index.js';

const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
void test('perspective uses vertical FOV, preserves aspect, and shrinks distant segments', () => {
  const c = new PerspectiveCamera();
  c.verticalFov = Math.PI / 2;
  const a = c.segment({ x: 0, y: 0, z: 2 }, { x: 1, y: 1, z: 2 }, 800, 400)!;
  close(a[0].x, 400);
  close(a[0].y, 200);
  close(a[1].x, 500);
  close(a[1].y, 100);
  const b = c.segment({ x: 0, y: 0, z: 4 }, { x: 1, y: 1, z: 4 }, 800, 400)!;
  close(b[1].x, 450);
  close(b[1].y, 150);
});
void test('camera translation and yaw/pitch change the basis, not world geometry', () => {
  const c = new PerspectiveCamera();
  c.x = 5;
  c.y = 3;
  c.z = -4;
  c.yaw = Math.PI / 2;
  c.pitch = Math.PI / 6;
  const a = {
    x: 5 + 10 * Math.cos(c.pitch),
    y: 3 + 10 * Math.sin(c.pitch),
    z: -4,
  };
  const b = c.segment(a, a, 800, 400)!;
  close(b[0].x, 400);
  close(b[0].y, 200);
});
void test('crossing the eye/near plane clips before division; behind-camera lines vanish', () => {
  const c = new PerspectiveCamera();
  assert.equal(
    c.segment({ x: 0, y: 0, z: -4 }, { x: 1, y: 1, z: -1 }, 800, 400),
    null,
  );
  const s = c.segment({ x: 0, y: 0, z: -1 }, { x: 0.1, y: 0, z: 1 }, 800, 400)!;
  for (const p of s) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y));
    assert.ok(p.x >= -1e-8 && p.x <= 800 + 1e-8);
    assert.ok(p.y >= -1e-8 && p.y <= 400 + 1e-8);
  }
});
void test('side planes clip a crossing line even with both ends outside; far plane rejects distant lines', () => {
  const c = new PerspectiveCamera();
  const s = c.segment(
    { x: -100, y: 0, z: 5 },
    { x: 100, y: 0, z: 5 },
    800,
    400,
  )!;
  close(s[0].x, 0);
  close(s[1].x, 800);
  assert.equal(
    c.segment({ x: 0, y: 0, z: 200 }, { x: 1, y: 1, z: 201 }, 800, 400),
    null,
  );
  assert.equal(
    c.segment({ x: 0, y: 100, z: 2 }, { x: 1, y: 101, z: 2 }, 800, 400),
    null,
  );
});

void test('GPU clip matrix agrees with CPU perspective and maps near/far to WebGL depth', () => {
  const camera = new PerspectiveCamera();
  camera.x = 2;
  camera.y = 1;
  camera.z = -5;
  camera.yaw = 0.2;
  camera.pitch = -0.1;
  const m = camera.clipMatrix(800, 450);
  for (const p of [
    { x: 0, y: 0, z: 2 },
    { x: 2, y: 1, z: 5 },
    { x: -1, y: 2, z: 4 },
  ]) {
    const x = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12];
    const y = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13];
    const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
    const projected = camera.segment(p, p, 800, 450)!;
    assert.ok(projected);
    close((x / w + 1) * 400, projected[0].x);
    close((1 - y / w) * 225, projected[0].y);
  }
  const c = new PerspectiveCamera(),
    clip = c.clipMatrix(800, 450);
  close((clip[10] * c.near + clip[14]) / c.near, -1);
  close((clip[10] * c.far + clip[14]) / c.far, 1);
  assert.ok((clip[10] * 0.01 + clip[14]) / 0.01 < -1);
  assert.ok((clip[10] * 200 + clip[14]) / 200 > 1);
  assert.throws(() => c.clipMatrix(0, 450));
});
