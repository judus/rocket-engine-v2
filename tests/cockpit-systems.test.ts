import test from 'node:test';
import assert from 'node:assert/strict';
import { CockpitSystemsPanel } from '../examples/webgl/CockpitSystemsPanel.js';
import { cockpitScreenPoint } from '../examples/webgl/CockpitScreenPoint.js';
import {
  Node3D,
  Mesh3D,
  MeshGeometry,
  PerspectiveCamera,
  matrixPoint,
} from '../src/3d/index.js';

void test('system requests survive page changes; only defined buttons change state', () => {
  const panel = new CockpitSystemsPanel();
  assert.equal(panel.requested('dampers'), true);
  assert.equal(panel.click(430, 122 + 2 * 36 + 15), true);
  assert.equal(panel.requested('dampers'), false);
  assert.equal(panel.click(100, 230), false);
  assert.equal(panel.click(430, 345), false);
  assert.equal(panel.toggleRow(-1), false);
  assert.equal(panel.toggleRow(6), false);
  assert.equal(panel.click(260, 375), true);
  panel.toggleRow(2);
  assert.equal(panel.requested('lifeSupport'), false);
  panel.turnPage();
  assert.equal(panel.page, 0);
  assert.equal(panel.requested('dampers'), false);
  assert.equal(panel.requested('reactor'), true);
});

void test('screen UV picking follows perspective, roll, nonuniform parent fit and rejects misses', () => {
  const parent = new Node3D(),
    screen = new Node3D();
  parent.add(screen);
  parent.transform = {
    position: { x: 0.3, y: -0.2, z: 8 },
    rotation: { x: 0.15, y: 0.4, z: -0.1 },
    scale: { x: 1.2, y: 0.8, z: 1 },
  };
  screen.mesh = new Mesh3D(
    new MeshGeometry(
      [
        { x: -1, y: -1, z: 0 },
        { x: 1, y: -1, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: -1, y: 1, z: 0 },
      ],
      [{ id: 'screen', indices: [0, 1, 2, 3], material: 0 }],
      [],
      {
        texCoords: [
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      },
    ),
    [{ color: '#fff' }],
  );
  const camera = new PerspectiveCamera();
  camera.roll = 0.4;
  camera.yaw = 0.07;
  camera.pitch = -0.03;
  for (const [u, v] of [
    [0.85, 0.4],
    [0.2, 0.8],
    [0.5, 0.5],
  ]) {
    const world = matrixPoint(screen.worldMatrix(), {
      x: u! * 2 - 1,
      y: 1 - v! * 2,
      z: 0,
    });
    const pixel = camera.segment(world, world, 1000, 600)![0];
    const hit = cockpitScreenPoint(
      screen,
      camera,
      1000,
      600,
      pixel.x,
      pixel.y,
    )!;
    assert.ok(Math.abs(hit.x - u! * 512) < 1e-7);
    assert.ok(Math.abs(hit.y - v! * 400) < 1e-7);
  }
  assert.equal(cockpitScreenPoint(screen, camera, 1000, 600, 0, 0), null);
  screen.visible = false;
  assert.equal(cockpitScreenPoint(screen, camera, 1000, 600, 500, 300), null);
  screen.visible = true;
  parent.transform = { ...parent.transform, position: { x: 0, y: 0, z: -8 } };
  assert.equal(cockpitScreenPoint(screen, camera, 1000, 600, 500, 300), null);
});
