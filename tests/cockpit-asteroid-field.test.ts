import test from 'node:test';
import assert from 'node:assert/strict';
import { Node3D, matrixPoint } from '../src/3d/index.js';
import {
  cockpitShadowFit,
  mergeShadowFits,
} from '../examples/webgl/CockpitShadowFit.js';
import { cockpitAsteroidField } from '../games/farwake/visuals/CockpitAsteroidField.js';

void test('outside field stays in world space while the pilot rig moves and turns', () => {
  const root = new Node3D('scene'),
    rig = new Node3D('pilot');
  const field = cockpitAsteroidField(2126, 96);
  root.add(rig).add(field);
  const position = () =>
    matrixPoint(field.children[0]!.worldMatrix(), { x: 0, y: 0, z: 0 });
  const before = position();
  rig.transform = {
    position: { x: 30, y: 12, z: 120 },
    rotation: { x: 0.2, y: 1.5, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  };
  assert.deepEqual(position(), before);
  assert.equal(field.parent, root);
  // New content can replace the field independently without moving the rig.
  const replacement = cockpitAsteroidField(42, 32);
  root.remove(field).add(replacement);
  assert.equal(field.parent, null);
  assert.equal(rig.transform.position.z, 120);
  assert.notDeepEqual(
    matrixPoint(replacement.children[0]!.worldMatrix(), { x: 0, y: 0, z: 0 }),
    before,
  );
});

void test('cockpit field retains eight shared rock meshes with diffuse material and no cabin shadow participation', () => {
  const field = cockpitAsteroidField(2126, 256);
  assert.equal(field.children.length, 256);
  assert.equal(new Set(field.children.map((n) => n.mesh)).size, 8);
  for (const node of field.children) {
    assert.equal(node.castsShadow, false);
    assert.equal(node.receivesShadow, false);
    assert.equal(node.mesh!.materials[0]!.metallicFactor, 0);
    assert.equal(node.mesh!.materials[0]!.roughnessFactor, 1);
    assert.equal(node.mesh!.geometry.faces.length, 128);
    assert.ok(node.transform.position.z + field.transform.position.z >= 26);
  }
});

void test('world shadow opt-in covers every asteroid and conservatively includes a moving cockpit', () => {
  const field = cockpitAsteroidField(2126, 96, true);
  for (const node of field.children) {
    assert.equal(node.castsShadow, true);
    assert.equal(node.receivesShadow, true);
  }
  const world = cockpitShadowFit(field);
  for (const cabin of [
    { center: { x: 0, y: 1.5, z: 0 }, radius: 5 },
    { center: { x: 500, y: -20, z: -200 }, radius: 5 },
    { center: world.center, radius: 500 },
  ]) {
    const fit = mergeShadowFits(cabin, world);
    for (const bound of [cabin, world]) {
      const d = Math.hypot(
        bound.center.x - fit.center.x,
        bound.center.y - fit.center.y,
        bound.center.z - fit.center.z,
      );
      assert.ok(d + bound.radius <= fit.radius + 1e-9);
    }
  }
});
