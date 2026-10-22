import { cockpitScreenLights } from '../examples/webgl/CockpitScreenLights.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TextureImage, Node3D, matrixPoint } from '../src/3d/index.js';
import { hi3dRadarContacts } from '../examples/webgl/Hi3dCockpitInstruments.js';
import { hi3dCockpitDisplays } from '../games/farwake/visuals/Hi3dCockpitDisplays.js';

void test('Hi3D radar projects real centers relative to position and heading and enforces spherical range', () => {
  const navigation = { x: 5, y: 2, z: 10, yaw: 0, pitch: 0, speed: 0 };
  const contacts = [
    { x: 5, y: 2, z: 20 },
    { x: 15, y: 2, z: 10 },
    { x: 5, y: 123, z: 10 },
    { x: 5, y: 2, z: -111 },
  ];
  assert.deepEqual(hi3dRadarContacts(navigation, contacts), [
    { right: 0, forward: 10, distance: 10 },
    { right: 10, forward: 0, distance: 10 },
  ]);
  const turned = hi3dRadarContacts({ ...navigation, yaw: 90 }, contacts);
  assert.ok(Math.abs(turned[0]!.right + 10) < 1e-12);
  assert.ok(Math.abs(turned[0]!.forward) < 1e-12);
  assert.ok(Math.abs(turned[1]!.right) < 1e-12);
  assert.ok(Math.abs(turned[1]!.forward - 10) < 1e-12);
  assert.deepEqual(hi3dRadarContacts(navigation, []), []);
});

void test('Hi3D inserts retain unequal overhead sizes and follow the same model fit and motion', () => {
  const binding = {
    image: new TextureImage(1, 1, new Uint8Array([0, 128, 128, 255])),
  };
  const displays = hi3dCockpitDisplays(binding, binding, [
    binding,
    binding,
    binding,
  ]);
  assert.equal(displays.children.length, 5);
  const widths = displays.children.slice(2).map((node) => {
    const vertices = node.mesh!.geometry.vertices;
    return vertices[1]!.x - vertices[0]!.x;
  });
  assert.ok(widths[1]! < widths[0]! && widths[0]! < widths[2]!);
  const fit = new Node3D('fit');
  fit.transform = {
    position: { x: 0.15, y: 1.53, z: -0.44 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 0.81, y: 0.93, z: 1 },
  };
  fit.add(displays);
  for (const node of displays.children) {
    assert.equal(node.castsShadow, false);
    assert.equal(node.receivesShadow, false);
    const mesh = node.mesh!;
    assert.equal(mesh.materials[0]!.baseColorTexture!.image, binding.image);
    assert.equal(mesh.materials[0]!.unlit, true);
    assert.equal(mesh.geometry.texCoords.length, 4);
    const vertex = mesh.geometry.vertices[0]!;
    const world = matrixPoint(node.worldMatrix(), vertex);
    assert.ok(Math.abs(world.x - (vertex.x * 0.81 + 0.15)) < 1e-6);
    assert.ok(Math.abs(world.y - (vertex.y * 0.93 + 1.53)) < 1e-6);
    assert.ok(Math.abs(world.z - (vertex.z - 0.44)) < 1e-6);
  }
});

void test('Hi3D light spill follows fitted display centers and shared power', () => {
  const binding = {
    image: new TextureImage(1, 1, new Uint8Array([0, 128, 128, 255])),
  };
  const displays = hi3dCockpitDisplays(binding, binding, [
    binding,
    binding,
    binding,
  ]);
  const lights = cockpitScreenLights(
    displays,
    [
      'Hi3D radar',
      'Hi3D flight',
      'Hi3D attitude',
      'Hi3D speed',
      'Hi3D position',
    ],
    'soft-cyan',
  );
  const before = lights(1.5, true);
  assert.equal(before.length, 5);
  assert.deepEqual(before[0]!.color, before[2]!.color);
  assert.equal(before[2]!.minimumDistance, 0.65);
  assert.ok(before[2]!.color[1] > before[2]!.color[0]);
  assert.ok(lights(0.4, true)[2]!.intensity < before[2]!.intensity / 3);
  assert.deepEqual(lights(1.5, false), []);
  const node = displays.children[0]!;
  node.transform = { ...node.transform, position: { x: 0.25, y: -0.1, z: 0 } };
  const after = lights(1.5, true);
  assert.ok(
    Math.abs(after[0]!.position.x - before[0]!.position.x - 0.25) < 1e-12,
  );
  assert.ok(
    Math.abs(after[0]!.position.y - before[0]!.position.y + 0.1) < 1e-12,
  );
  assert.deepEqual(after[1], before[1]);
});
