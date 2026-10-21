import test from 'node:test';
import assert from 'node:assert/strict';
import { TextureImage } from '../src/3d/index.js';
import type { TextureSource3D } from '../src/3d/index.js';
function pixelsOf(image: TextureSource3D) {
  assert.ok(image instanceof TextureImage);
  return image.copyPixels();
}
import { hi3dCockpitLamps } from '../examples/webgl/Hi3dCockpitLamps.js';

void test('six opaque lamp lenses switch independently without removing coverage or reallocating geometry', () => {
  const lamps = hi3dCockpitLamps();
  assert.equal(lamps.root.children.length, 6);
  const originals = lamps.root.children.map((node) => node.mesh!);
  for (let i = 0; i < 6; i++) {
    lamps.setPowered(i, false);
    const node = lamps.root.children[i]!,
      dark = node.mesh!;
    assert.notEqual(dark, originals[i]);
    assert.equal(dark.geometry, originals[i]!.geometry);
    assert.equal(node.visible, true);
    assert.equal(node.castsShadow, false);
    assert.equal(node.receivesShadow, false);
    const pixels = pixelsOf(dark.materials[0]!.baseColorTexture!.image);
    for (let p = 3; p < pixels.length; p += 4) assert.equal(pixels[p], 255);
    for (let j = i + 1; j < 6; j++)
      assert.equal(lamps.root.children[j]!.mesh, originals[j]);
    lamps.setPowered(i, true);
    assert.equal(node.mesh, originals[i]);
    lamps.setPowered(i, false);
    assert.equal(node.mesh, dark);
  }
  assert.throws(() => lamps.setPowered(6, true), /Unknown Hi3D lamp/);
});

void test('round alert colors change live while retaining power, geometry and textures', () => {
  const lamps = hi3dCockpitLamps();
  const r1 = lamps.root.children[4]!,
    r2 = lamps.root.children[5]!;
  const orange = r1.mesh!,
    red = r2.mesh!;
  assert.deepEqual(orange.materials[0]!.baseColorFactor, [
    1,
    ((205 / 255 + 0.055) / 1.055) ** 2.4,
    ((85 / 255 + 0.055) / 1.055) ** 2.4,
    1,
  ]);
  assert.deepEqual(red.materials[0]!.baseColorFactor, [
    ((230 / 255 + 0.055) / 1.055) ** 2.4,
    ((92 / 255 + 0.055) / 1.055) ** 2.4,
    ((61 / 255 + 0.055) / 1.055) ** 2.4,
    1,
  ]);
  lamps.setPowered(4, false);
  const offImage = r1.mesh!.materials[0]!.baseColorTexture!.image;
  lamps.setColor(4, '#00ff00');
  assert.equal(r1.mesh!.materials[0]!.baseColorTexture!.image, offImage);
  assert.deepEqual(r1.mesh!.materials[0]!.baseColorFactor, [0, 1, 0, 1]);
  assert.equal(r1.mesh!.geometry, orange.geometry);
  assert.equal(r2.mesh, red);
  lamps.setPowered(4, true);
  assert.equal(
    r1.mesh!.materials[0]!.baseColorTexture!.image,
    orange.materials[0]!.baseColorTexture!.image,
  );
  assert.throws(() => lamps.setColor(4, 'orange'), /#rrggbb/);
  assert.throws(() => lamps.setColor(6, '#ffffff'), /Unknown/);
});

void test('round lenses cancel unequal cockpit scaling without moving their centers or stretching other lamps', () => {
  const lamps = hi3dCockpitLamps();
  const positions = lamps.root.children.map((node) => ({
    ...node.transform.position,
  }));
  const meshes = lamps.root.children.map((node) => node.mesh);
  for (const [width, height] of [
    [0.81, 0.93],
    [1.2, 0.8],
    [1, 1],
  ]) {
    lamps.setCockpitScale(width!, height!);
    lamps.root.children.forEach((node, i) => {
      assert.deepEqual(node.transform.position, positions[i]);
      assert.equal(node.mesh, meshes[i]);
      if (i < 4) assert.deepEqual(node.transform.scale, { x: 1, y: 1, z: 1 });
      else
        assert.ok(
          Math.abs(
            node.transform.scale.x * width! - node.transform.scale.y * height!,
          ) < 1e-12,
        );
    });
  }
  assert.throws(() => lamps.setCockpitScale(0, 1), /positive/);
});

void test('disc sizing preserves roundness, fitted centers and independent lamp state', () => {
  const lamps = hi3dCockpitLamps();
  const r1 = lamps.root.children[4]!,
    r2 = lamps.root.children[5]!;
  const position = { ...r1.transform.position },
    mesh = r1.mesh;
  lamps.setCockpitScale(0.81, 0.93);
  lamps.setSize(4, 0.7);
  assert.equal(r1.transform.scale.y, 0.7);
  assert.ok(Math.abs(r1.transform.scale.x * 0.81 - 0.7 * 0.93) < 1e-12);
  assert.equal(r2.transform.scale.y, 1);
  lamps.setCockpitScale(1.2, 0.8);
  assert.equal(r1.transform.scale.y, 0.7);
  assert.ok(Math.abs(r1.transform.scale.x * 1.2 - 0.7 * 0.8) < 1e-12);
  assert.deepEqual(r1.transform.position, position);
  assert.equal(r1.mesh, mesh);
  assert.throws(() => lamps.setSize(4, 0), /positive/);
});

void test('rectangular button spill follows fit and power independently of round alerts', () => {
  const lamps = hi3dCockpitLamps();
  const initial = lamps.buttonLights();
  assert.equal(initial.length, 4);
  assert.ok(
    initial.every(
      (light) =>
        light.color[0] > light.color[1] && light.color[1] > light.color[2],
    ),
  );
  lamps.setPowered(4, false);
  lamps.setPowered(5, false);
  assert.deepEqual(lamps.buttonLights(), initial);
  lamps.setPowered(0, false);
  assert.deepEqual(lamps.buttonLights(), initial.slice(1));
  lamps.setPowered(0, true);
  const node = lamps.root.children[0]!;
  node.transform = { ...node.transform, position: { x: 1, y: 2, z: 3 } };
  const moved = lamps.buttonLights();
  assert.deepEqual(moved[0]!.position, { x: 1, y: 2, z: 3.18 });
  assert.deepEqual(moved.slice(1), initial.slice(1));
  for (let i = 0; i < 4; i++) lamps.setPowered(i, false);
  assert.deepEqual(lamps.buttonLights(), []);
});

void test('round alert rim glow and spill track individual power, color and fitted size', () => {
  const lamps = hi3dCockpitLamps();
  const initial = lamps.alertLights();
  assert.equal(initial.length, 2);
  assert.notDeepEqual(initial[0]!.color, initial[1]!.color);
  for (const node of lamps.root.children.slice(4)) {
    const pixels = pixelsOf(node.mesh!.materials[0]!.baseColorTexture!.image);
    const value = (x: number, y: number) => pixels[(y * 64 + x) * 4]!;
    assert.ok(
      value(60, 32) > value(48, 32),
      'near-border annulus is brighter than inner glass',
    );
  }
  lamps.setSize(4, 0.5);
  assert.equal(lamps.alertLights()[0]!.intensity, initial[0]!.intensity * 0.25);
  lamps.setColor(4, '#00ff00');
  assert.deepEqual(lamps.alertLights()[0]!.color, [0, 1, 0]);
  lamps.setPowered(4, false);
  assert.equal(
    lamps.alertLights()[0]!.intensity,
    initial[0]!.intensity * 0.25 * 0.02,
  );
  assert.deepEqual(lamps.alertLights()[1], initial[1]);
  const off = lamps.root.children[4]!.mesh;
  const standbyPixel =
    pixelsOf(off!.materials[0]!.baseColorTexture!.image)[(32 * 64 + 60) * 4]! /
    255;
  const decode = (v: number) =>
    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  lamps.setPowered(4, true);
  const activePixel =
    pixelsOf(
      lamps.root.children[4]!.mesh!.materials[0]!.baseColorTexture!.image,
    )[(32 * 64 + 60) * 4]! / 255;
  assert.ok(
    Math.abs(decode(standbyPixel) / decode(activePixel) - 0.02) < 0.002,
  );
  lamps.setPowered(4, true);
  lamps.setPowered(4, false);
  assert.equal(lamps.root.children[4]!.mesh, off);
  lamps.setPowered(5, false);
  assert.equal(lamps.alertLights()[1]!.intensity, initial[1]!.intensity * 0.02);
});
