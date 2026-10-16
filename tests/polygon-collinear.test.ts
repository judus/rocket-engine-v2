import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PerspectiveCamera,
  CanvasRenderer3D,
  SoftwareDepthRenderer3D,
  shadeFaces,
} from '../src/3d/index.js';
import { projectFaces } from '../src/3d/SolidFaces.js';
void test('collinear leading edge vertices preserve the whole polygon normal in both CPU paths', () => {
  const face = {
    id: 'panel',
    color: '#ffffff',
    vertices: [
      { x: -1, y: -1, z: 4 },
      { x: -1, y: 0, z: 4 },
      { x: -1, y: 1, z: 4 },
      { x: 1, y: 1, z: 4 },
      { x: 1, y: -1, z: 4 },
    ],
  };
  const camera = new PerspectiveCamera();
  assert.equal(projectFaces([face], camera, 64, 64).visible.length, 1);
  assert.equal(
    projectFaces(
      [{ ...face, vertices: [...face.vertices].reverse() }],
      camera,
      64,
      64,
    ).backFacing,
    1,
  );
  const depth = new SoftwareDepthRenderer3D();
  depth.drawFaces([face], camera, 64, 64);
  assert.ok(Math.abs(depth.depthAt(32, 32) - 4) < 1e-9);
  assert.equal(
    shadeFaces(
      [face],
      [
        {
          kind: 'directional',
          direction: { x: 0, y: 0, z: -1 },
          color: [1, 1, 1],
          intensity: 1,
        },
      ],
    )[0]!.color,
    '#ffffff',
  );
  let fills = 0;
  const context = {
    save() {},
    restore() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    fillStyle: '',
    fill() {
      fills++;
    },
  } as unknown as CanvasRenderingContext2D;
  const painted = new CanvasRenderer3D().drawFaces(
    context,
    [face],
    camera,
    64,
    64,
  );
  assert.equal(painted.visible.length, 1);
  assert.equal(fills, 1);
});
