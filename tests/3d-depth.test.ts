import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PerspectiveCamera,
  SoftwareDepthRenderer3D,
  collectFaces,
  projectFaces,
} from '../src/3d/index.js';
import type { Face } from '../src/3d/index.js';
import { createVisibilityModel } from '../examples/3d/VisibilityModel.js';

const pixel = (renderer: SoftwareDepthRenderer3D, x: number, y: number) =>
  Array.from(
    renderer.pixels.slice(
      (y * renderer.width + x) * 4,
      (y * renderer.width + x) * 4 + 4,
    ),
  );
const quad = (z: number, color = '#ffffff'): Face => ({
  id: String(z),
  color,
  vertices: [
    { x: -100, y: -100, z },
    { x: -100, y: 100, z },
    { x: 100, y: 100, z },
    { x: 100, y: -100, z },
  ],
});

void test('crossing panels match independent ray-plane depths and visibility, regardless of submission order', () => {
  const camera = new PerspectiveCamera();
  camera.z = -7;
  const faces = collectFaces(createVisibilityModel());
  const renderer = new SoftwareDepthRenderer3D();
  renderer.drawFaces(faces, camera, 64, 64);
  const focal = 64 / (2 * Math.tan(camera.verticalFov / 2));
  for (const x of [20, 22, 40, 42]) {
    // Ray: (x,y,z) = camera + t * (screenX/focal, screenY/focal,1).
    // Intersect z_world = slope * x_world: t = 7 / (1 - slope * rayX).
    const rayX = (x + 0.5 - 32) / focal;
    const coral = 7 / (1 - 0.7 * rayX),
      teal = 7 / (1 + 0.7 * rayX);
    assert.ok(
      Math.abs(renderer.depthAt(x, 32) - Math.min(coral, teal)) < 1e-10,
    );
    assert.deepEqual(
      pixel(renderer, x, 32),
      coral < teal ? [238, 148, 124, 255] : [114, 207, 181, 255],
    );
  }
  const first = renderer.pixels.slice();
  renderer.drawFaces([...faces].reverse(), camera, 64, 64);
  assert.deepEqual(renderer.pixels, first);
  // Whole-face sorting must pick one panel as the last face; that cannot be right on both sides.
  const sorted = projectFaces(faces, camera, 64, 64).visible;
  const reversed = projectFaces([...faces].reverse(), camera, 64, 64).visible;
  assert.notEqual(sorted.at(-1)!.color, reversed.at(-1)!.color);
});

void test('a near/eye-plane crossing polygon retains perspective depth after clipping and fan triangulation', () => {
  const camera = new PerspectiveCamera();
  camera.verticalFov = Math.PI / 2;
  // Plane z = 0.2 + x: two original corners are behind the eye.
  const face: Face = {
    id: 'crossing',
    color: '#123456',
    vertices: [
      { x: -2, y: -1, z: -1.8 },
      { x: -2, y: 1, z: -1.8 },
      { x: 2, y: 1, z: 2.2 },
      { x: 2, y: -1, z: 2.2 },
    ],
  };
  const renderer = new SoftwareDepthRenderer3D();
  const stats = renderer.drawFaces([face], camera, 64, 64);
  assert.equal(stats.visible, 1);
  assert.ok(stats.triangles >= 2);
  for (const x of [4, 16, 32, 48, 60]) {
    const expected = 0.2 / (1 - (x + 0.5 - 32) / 32);
    assert.ok(Math.abs(renderer.depthAt(x, 32) - expected) < 1e-10);
    assert.deepEqual(pixel(renderer, x, 32), [18, 52, 86, 255]);
  }
});

void test('viewport-spanning clipped quad has no fan seam or holes, and nearest depth wins on every sample', () => {
  const camera = new PerspectiveCamera(),
    renderer = new SoftwareDepthRenderer3D();
  const stats = renderer.drawFaces(
    [quad(2, '#ff0000'), quad(5, '#0000ff')],
    camera,
    32,
    32,
  );
  assert.equal(stats.testedSamples, 2 * 32 * 32);
  assert.equal(stats.depthPasses, 32 * 32);
  for (let y = 0; y < 32; y++)
    for (let x = 0; x < 32; x++) {
      assert.deepEqual(pixel(renderer, x, y), [255, 0, 0, 255]);
      assert.ok(Math.abs(renderer.depthAt(x, y) - 2) < 1e-12);
    }
});

void test('buffers reuse storage, resize replaces it, and empty/culled frames clear stale color and depth', () => {
  const camera = new PerspectiveCamera(),
    renderer = new SoftwareDepthRenderer3D();
  renderer.drawFaces([quad(2)], camera, 8, 8);
  const storage = renderer.pixels;
  renderer.drawFaces(
    [
      quad(-2),
      quad(200),
      { ...quad(2), vertices: [...quad(2).vertices].reverse() },
    ],
    camera,
    8,
    8,
  );
  assert.equal(renderer.pixels, storage);
  assert.ok(renderer.pixels.every((value) => value === 0));
  assert.equal(renderer.depthAt(4, 4), Infinity);
  const stats = renderer.drawFaces([], camera, 16, 8);
  assert.notEqual(renderer.pixels, storage);
  assert.equal(stats.bufferBytes, 16 * 8 * 12);
  assert.equal(renderer.depthAt(15, 7), Infinity);
  assert.throws(() => renderer.depthAt(16, 7), /outside/);
  assert.throws(() => renderer.drawFaces([], camera, 0, 8), /dimensions/);
  assert.throws(() => renderer.drawFaces([], camera, 4096, 4096), /dimensions/);
  assert.throws(
    () => renderer.drawFaces([quad(2, 'rgba(1,2,3,0.5)')], camera, 8, 8),
    /opaque/,
  );
});
