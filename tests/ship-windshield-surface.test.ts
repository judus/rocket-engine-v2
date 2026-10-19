import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Node3D,
  PerspectiveCamera,
  matrixPoint,
  pickMesh3D,
} from '../src/3d/index.js';
import {
  WindshieldSurface,
  cockpitPaneNames,
} from '../games/ship/WindshieldSurface.js';
import {
  WindshieldHud,
  hudGlyphGeometry,
} from '../games/ship/WindshieldHud.js';
import { surfaceVariantSwitcher } from '../games/ship/SurfaceVariants.js';
import { cockpitModel } from './helpers/cockpitModel.js';

const rasterize = () => hudGlyphGeometry(1, 1, new Uint8ClampedArray(4));
const eye = { x: 0, y: 1.48, z: -3.37 };

void test('Authored five-pane glass keeps full hierarchy and separate runtime materials across modes and quality switches', async () => {
  const { modelRoot, assembly } = await cockpitModel();
  const originals = new Map<
    string,
    {
      world: import('../src/3d/index.js').Matrix4;
      geometry: import('../src/3d/index.js').MeshGeometry;
    }
  >();
  modelRoot.traverse((n) => {
    if (cockpitPaneNames.includes(n.name as (typeof cockpitPaneNames)[number]))
      originals.set(n.name, {
        world: n.worldMatrix(),
        geometry: n.mesh!.geometry,
      });
  });
  const hud = new WindshieldHud(rasterize);
  const glass = new WindshieldSurface(modelRoot, hud, eye);
  assert.deepEqual(
    glass.panes.map((p) => p.name),
    cockpitPaneNames,
  );
  assert.equal(hud.root.parent, glass.pane);
  assert.equal(hud.root.transform.rotation.x, 0);
  assert.equal(hud.reticle.visible, true);
  for (const pane of glass.panes) {
    assert.deepEqual(pane.worldMatrix(), originals.get(pane.name)!.world);
    assert.equal(pane.mesh!.geometry, originals.get(pane.name)!.geometry);
    assert.equal(pane.mesh!.materials[0]!.opacity, 0.025);
    assert.equal(pane.castsShadow, false);
  }
  assert.equal(new Set(glass.panes.map((p) => p.mesh!.materials[0])).size, 5);
  const select = surfaceVariantSwitcher(assembly);
  glass.setMode('display');
  const meshes = glass.panes.map((p) => p.mesh);
  assert.equal(hud.reticle.visible, false);
  for (const pane of glass.panes)
    assert.equal(pane.mesh!.materials[0]!.opacity, 0.94);
  for (const variant of ['scalar-pbr', 'no-normal', 'full'] as const) {
    select(variant);
    assert.deepEqual(
      glass.panes.map((p) => p.mesh),
      meshes,
    );
  }
  glass.setMode('display');
  assert.deepEqual(
    glass.panes.map((p) => p.mesh),
    meshes,
  );
  assert.throws(() => glass.setMode('invalid' as 'clear'), /mode/);
  glass.setMode('clear');
  assert.equal(hud.reticle.visible, true);
  assert.throws(
    () => new WindshieldSurface(new Node3D(), hud, eye),
    /WindshieldSurface/,
  );
});

void test('Real GLB HUD sightline remains centered at 16:9 and 4:3, under full ship attitude', async () => {
  const { modelRoot, assembly } = await cockpitModel();
  const hud = new WindshieldHud(rasterize);
  new WindshieldSurface(modelRoot, hud, eye);
  const rig = new Node3D();
  rig.add(assembly);
  for (const [yaw, pitch, roll] of [
    [0, 0, 0],
    [0.4, 0.2, -0.3],
  ]) {
    const cy = Math.cos(yaw!),
      sy = Math.sin(yaw!),
      cp = Math.cos(pitch!),
      sp = Math.sin(pitch!),
      cr = Math.cos(roll!),
      sr = Math.sin(roll!);
    const right = { x: cy, y: 0, z: -sy },
      up = { x: -sy * sp, y: cp, z: -cy * sp },
      forward = { x: sy * cp, y: sp, z: cy * cp };
    const r = {
      x: right.x * cr - up.x * sr,
      y: -up.y * sr,
      z: right.z * cr - up.z * sr,
    };
    const u = {
      x: right.x * sr + up.x * cr,
      y: up.y * cr,
      z: right.z * sr + up.z * cr,
    };
    rig.matrix = [
      r.x,
      r.y,
      r.z,
      0,
      u.x,
      u.y,
      u.z,
      0,
      forward.x,
      forward.y,
      forward.z,
      0,
      100,
      -20,
      300,
      1,
    ];
    const worldEye = matrixPoint(rig.worldMatrix(), eye);
    const camera = new PerspectiveCamera();
    Object.assign(camera, worldEye, { yaw, pitch, roll, far: 100 });
    const center = matrixPoint(hud.reticle.worldMatrix(), { x: 0, y: 0, z: 0 });
    for (const [width, height] of [
      [1600, 900],
      [1200, 900],
    ]) {
      const p = camera.segment(center, center, width!, height!)![0];
      assert.ok(Math.abs(p.x - width! / 2) < 1e-8);
      assert.ok(Math.abs(p.y - height! / 2) < 1e-8);
    }
  }
});

void test('Real GLB panes support triangle UV picking after head turn, with nearer frame occluding buried borders', async () => {
  const { modelRoot, assembly } = await cockpitModel();
  const hud = new WindshieldHud(rasterize);
  const glass = new WindshieldSurface(modelRoot, hud, eye);
  for (const [index, pane] of glass.panes.entries()) {
    const camera = new PerspectiveCamera();
    Object.assign(camera, eye, { far: 100, near: 0.05 });
    const geometry = pane.mesh!.geometry;
    const positions = geometry.faces[0]!.indices.map(
      (i) => geometry.vertices[i]!,
    );
    const local = {
      x: positions.reduce((s, p) => s + p.x, 0) / 3,
      y: positions.reduce((s, p) => s + p.y, 0) / 3,
      z: 0,
    };
    const target = matrixPoint(pane.worldMatrix(), local);
    camera.yaw = Math.atan2(target.x - eye.x, target.z - eye.z);
    camera.pitch = Math.atan2(
      target.y - eye.y,
      Math.hypot(target.x - eye.x, target.z - eye.z),
    );
    camera.roll = 0.17;
    const hit = pickMesh3D(
      assembly,
      camera,
      1200,
      900,
      600,
      450,
      (n) => n === pane,
    );
    assert.equal(hit?.node, pane, `pane ${index} geometric hit`);
    assert.ok(hit!.uv!.every((v) => v >= 0 && v <= 1));
  }
  const camera = new PerspectiveCamera();
  Object.assign(camera, eye, { far: 100 });
  let buried = 0,
    open = 0;
  for (const p of glass.pane.mesh!.geometry.vertices) {
    const world = matrixPoint(glass.pane.worldMatrix(), p);
    const screen = camera.segment(world, world, 1600, 900)?.[0];
    if (!screen) continue;
    const hit = pickMesh3D(
      assembly,
      camera,
      1600,
      900,
      screen.x,
      screen.y,
      (n) =>
        n !== hud.root &&
        !n.name.startsWith('HUD') &&
        !n.name.includes('ring') &&
        !n.name.includes('cross') &&
        n !== hud.reticle,
    );
    if (hit && hit.node !== glass.pane) buried++;
    if (hit?.node === glass.pane) open++;
  }
  assert.ok(
    buried > 0,
    'at least one buried front border loses to frame geometry',
  );
  assert.ok(open > 0, 'front glass remains selectable in the opening');
});
