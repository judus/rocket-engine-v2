import test from 'node:test';
import assert from 'node:assert/strict';
import { hi3dCockpitLamps } from '../examples/webgl/Hi3dCockpitLamps.js';

void test('four opaque lamp lenses switch independently without removing coverage or reallocating geometry', () => {
  const lamps = hi3dCockpitLamps();
  assert.equal(lamps.root.children.length, 4);
  const originals = lamps.root.children.map((node) => node.mesh!);
  for (let i = 0; i < 4; i++) {
    lamps.setPowered(i, false);
    const node = lamps.root.children[i]!,
      dark = node.mesh!;
    assert.notEqual(dark, originals[i]);
    assert.equal(dark.geometry, originals[i]!.geometry);
    assert.equal(node.visible, true);
    assert.equal(node.castsShadow, false);
    assert.equal(node.receivesShadow, false);
    const pixels = dark.materials[0]!.baseColorTexture!.image.copyPixels();
    for (let p = 3; p < pixels.length; p += 4) assert.equal(pixels[p], 255);
    for (let j = i + 1; j < 4; j++)
      assert.equal(lamps.root.children[j]!.mesh, originals[j]);
    lamps.setPowered(i, true);
    assert.equal(node.mesh, originals[i]);
    lamps.setPowered(i, false);
    assert.equal(node.mesh, dark);
  }
  assert.throws(() => lamps.setPowered(4, true), /Unknown Hi3D lamp/);
});
