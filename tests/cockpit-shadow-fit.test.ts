import test from 'node:test';
import assert from 'node:assert/strict';
import { cockpitShadowFit } from '../games/farwake/visuals/CockpitShadowFit.js';
import {
  Node3D,
  Mesh3D,
  MeshGeometry,
  matrixPoint,
  transformMatrix,
  multiplyMatrices,
  directionalShadowMatrix,
} from '../src/3d/index.js';
void test('cockpit bound includes nested transformed geometry, excludes meshless cameras, and is immutable', () => {
  const root = new Node3D(),
    part = new Node3D(),
    camera = new Node3D();
  root.transform = { ...root.transform, scale: { x: 1, y: 1, z: -1 } };
  part.transform = { ...part.transform, position: { x: 2, y: 1, z: 3 } };
  part.mesh = new Mesh3D(
    new MeshGeometry(
      [
        { x: -1, y: -1, z: -1 },
        { x: 1, y: 1, z: 1 },
        { x: 0, y: 0, z: 0 },
      ],
      [],
    ),
    [{ color: '#ffffff' }],
  );
  root.add(part);
  root.add(camera);
  camera.transform = {
    ...camera.transform,
    position: { x: 1000, y: 1000, z: 1000 },
  };
  const fit = cockpitShadowFit(root);
  assert.deepEqual(fit.center, { x: 2, y: 1, z: -3 });
  assert.ok(Math.abs(fit.radius - Math.sqrt(3)) < 1e-12);
  assert.ok(Object.isFrozen(fit));
  assert.ok(Object.isFrozen(fit.center));
  assert.throws(() => cockpitShadowFit(new Node3D()), /empty/);
});
void test('rigidly moving fitted volume encloses the model under independent world light directions', () => {
  const fit = { center: { x: 0, y: 1, z: 2 }, radius: 3 };
  const rig = transformMatrix({
    position: { x: 50, y: 8, z: -40 },
    rotation: { x: 0.5, y: 1.2, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  });
  const rotation = transformMatrix({
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0.8, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    }),
    pose = multiplyMatrices(rig, rotation);
  const center = matrixPoint(pose, fit.center);
  for (const direction of [
    { x: 0, y: 1, z: 0 },
    { x: 1, y: 0.3, z: -1 },
    { x: -1, y: -0.8, z: 1 },
  ]) {
    const clip = directionalShadowMatrix(
      direction,
      center,
      fit.radius * 1.05,
      fit.radius * 2.2,
    );
    for (const delta of [
      { x: 3, y: 0, z: 0 },
      { x: -3, y: 0, z: 0 },
      { x: 0, y: 3, z: 0 },
      { x: 0, y: 0, z: -3 },
    ]) {
      const world = matrixPoint(pose, {
        x: fit.center.x + delta.x,
        y: fit.center.y + delta.y,
        z: fit.center.z + delta.z,
      });
      const p = matrixPoint(clip, world);
      assert.ok(Math.max(Math.abs(p.x), Math.abs(p.y), Math.abs(p.z)) <= 1);
    }
  }
});
