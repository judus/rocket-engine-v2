import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Mesh3D,
  MeshGeometry,
  Node3D,
  PerspectiveCamera,
  matrixPoint,
  pickMesh3D,
} from '../src/3d/index.js';

function pane() {
  const node = new Node3D('clipped pane');
  const vertices = [
    [-1, -1],
    [1, -1],
    [1, 0.5],
    [0.5, 1],
    [-0.5, 1],
    [-1, 0.5],
  ].map(([x, y]) => ({ x: x!, y: y!, z: 0 }));
  node.mesh = new Mesh3D(
    new MeshGeometry(
      vertices,
      [{ id: 'glass', indices: [0, 1, 2, 3, 4, 5], material: 0 }],
      [],
      { texCoords: vertices.map((p) => [(p.x + 1) / 2, (p.y + 1) / 2]) },
    ),
    [{ color: '#ffffff', opacity: 0 }],
  );
  return node;
}

void test('Picking uses actual clipped triangles, full parent transforms, UVs and depth after yaw/pitch/roll', () => {
  const root = new Node3D(),
    glass = pane();
  root.add(glass);
  root.transform = {
    position: { x: 2, y: -0.4, z: 9 },
    rotation: { x: 0.2, y: 0.5, z: -0.1 },
    scale: { x: -1.4, y: 0.7, z: 1 },
  };
  const camera = new PerspectiveCamera();
  Object.assign(camera, { yaw: 0.2, pitch: -0.04, roll: 0.3 });
  for (const [width, height] of [
    [1600, 900],
    [1200, 900],
  ]) {
    for (const [u, v] of [
      [0.3, 0.4],
      [0.7, 0.7],
      [0.5, 0.5],
    ]) {
      const world = matrixPoint(glass.worldMatrix(), {
        x: 2 * u! - 1,
        y: 2 * v! - 1,
        z: 0,
      });
      const pixel = camera.segment(world, world, width!, height!)![0];
      const hit = pickMesh3D(root, camera, width!, height!, pixel.x, pixel.y)!;
      assert.equal(hit.node, glass);
      assert.ok(Math.abs(hit.uv![0] - u!) < 1e-8);
      assert.ok(Math.abs(hit.uv![1] - v!) < 1e-8);
    }
    const corner = matrixPoint(glass.worldMatrix(), { x: 0.95, y: 0.95, z: 0 });
    const pixel = camera.segment(corner, corner, width!, height!)![0];
    assert.equal(
      pickMesh3D(root, camera, width!, height!, pixel.x, pixel.y),
      null,
    );
  }
});

void test('Nearest frame rejects glass selection regardless of traversal order; hidden nodes and clipping are respected', () => {
  const root = new Node3D(),
    glass = pane(),
    frame = pane();
  glass.transform = { ...glass.transform, position: { x: 0, y: 0, z: 8 } };
  frame.transform = { ...frame.transform, position: { x: 0, y: 0, z: 4 } };
  frame.mesh = new Mesh3D(
    new MeshGeometry(frame.mesh!.geometry.vertices, frame.mesh!.geometry.faces),
    [{ color: '#222222' }],
  );
  const camera = new PerspectiveCamera();
  for (const nodes of [
    [glass, frame],
    [frame, glass],
  ]) {
    nodes.forEach((n) => root.add(n));
    assert.equal(pickMesh3D(root, camera, 800, 600, 400, 300)!.node, frame);
  }
  frame.visible = false;
  assert.equal(
    pickMesh3D(root, camera, 800, 600, 400, 300)!.node,
    glass,
    'alpha-zero glass remains geometrically selectable',
  );
  root.visible = false;
  assert.equal(
    pickMesh3D(glass, camera, 800, 600, 400, 300),
    null,
    'a direct subtree query respects its hidden ancestors',
  );
  assert.equal(pickMesh3D(root, camera, 800, 600, 400, 300), null);
  root.visible = true;
  camera.near = 9;
  assert.equal(pickMesh3D(root, camera, 800, 600, 400, 300), null);
  camera.near = 0.1;
  camera.far = 7;
  assert.equal(pickMesh3D(root, camera, 800, 600, 400, 300), null);
  assert.equal(pickMesh3D(root, camera, 800, 600, -1, 300), null);
  assert.throws(() => pickMesh3D(root, camera, 0, 600, 400, 300), /viewport/);
  assert.throws(() => pickMesh3D(root, camera, 800, 600, NaN, 300), /position/);
});

void test('An edge-on surface does not capture a ray parallel to its plane', () => {
  const glass = pane();
  glass.transform = {
    ...glass.transform,
    position: { x: 0, y: 0, z: 8 },
    rotation: { x: 0, y: Math.PI / 2, z: 0 },
  };
  assert.equal(
    pickMesh3D(glass, new PerspectiveCamera(), 800, 600, 400, 300),
    null,
  );
});
