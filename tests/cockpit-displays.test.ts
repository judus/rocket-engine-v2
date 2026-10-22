import { cockpitScreenLights } from '../examples/webgl/CockpitScreenLights.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { attachCockpitDisplays } from '../examples/webgl/CockpitDisplays.js';
import { parseGlb, TextureImage, Node3D } from '../src/3d/index.js';

for (const asset of [
  'cockpit-forward-v4-materials.glb',
  'cockpit-forward-v5-wear.glb',
])
  void test(`${asset}: display adapter preserves original and all 2072 triangles, replacing only front glass`, async () => {
    const bytes = await readFile(
      new URL(`../../examples/3d/assets/${asset}`, import.meta.url),
    );
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    const model = parseGlb(buffer, {
      resolveImage(_index, colorSpace) {
        return new TextureImage(1, 1, new Uint8Array([128, 128, 128, 255]), {
          colorSpace,
        });
      },
    });
    const instance = model.instantiate(),
      original = model.instantiate();
    const radar = {
      image: new TextureImage(1, 1, new Uint8Array([0, 255, 0, 255])),
    };
    const telemetry = {
      image: new TextureImage(1, 1, new Uint8Array([255, 128, 0, 255])),
    };
    const overhead = [0, 1, 2].map((i) => ({
      image: new TextureImage(1, 1, new Uint8Array([128, i * 100, 0, 255])),
    })) as [typeof radar, typeof radar, typeof radar];
    attachCockpitDisplays(instance.root, radar, telemetry, overhead);
    let triangles = 0,
      screens = 0;
    instance.root.traverse((node) => {
      if (!node.mesh) return;
      triangles += node.mesh.geometry.faces.reduce(
        (n, f) => n + f.indices.length - 2,
        0,
      );
      if (!node.name.endsWith('/instrument')) return;
      screens++;
      assert.equal(node.mesh.geometry.faces.length, 2);
      assert.equal(node.mesh.materials[0]!.unlit, true);
      assert.equal(
        node.mesh.materials[0]!.baseColorTexture!.image,
        node.name.includes('overhead-display-')
          ? overhead[Number(node.name.match(/display-(\d)/)![1]) - 1]!.image
          : node.name.includes('left')
            ? radar.image
            : telemetry.image,
      );
      assert.equal(node.castsShadow, false);
      assert.equal(node.receivesShadow, false);
      original.root.traverse((source) => {
        if (`${source.name}/instrument` === node.name) {
          assert.equal(source.mesh!.geometry.faces.length, 20);
          assert.equal(source.children.length, 0);
          assert.equal(source.mesh!.materials[0]!.unlit, undefined);
        }
      });
    });
    const screenLights = cockpitScreenLights(instance.root);
    const before = screenLights(1.5, true);
    assert.equal(before.length, 5);
    assert.ok(
      before.every(
        (light) => light.intensity > 0 && light.minimumDistance === 0.12,
      ),
    );
    assert.ok(before[0]!.color[1] > before[0]!.color[0]);
    assert.ok(before[2]!.color[0] > before[2]!.color[2]);
    assert.ok(before[0]!.intensity > before[2]!.intensity * 10);
    assert.deepEqual(screenLights(1.5, false), []);
    assert.deepEqual(screenLights(0, true), []);
    assert.throws(() => screenLights(NaN, true), /strength/);
    const { matrixPoint } = await import('../src/3d/index.js');
    const rig = new Node3D();
    rig.transform = {
      position: { x: 4, y: 2, z: 5 },
      rotation: { x: 0, y: Math.PI / 2, z: 0 },
      scale: { x: 1, y: 1, z: -1 },
    };
    rig.add(instance.root);
    const moved = screenLights(3, true);
    before.forEach((light, i) => {
      const expected = matrixPoint(rig.worldMatrix(), light.position);
      for (const key of ['x', 'y', 'z'] as const)
        assert.ok(Math.abs(moved[i]!.position[key] - expected[key]) < 1e-6);
      assert.equal(moved[i]!.intensity, light.intensity * 2);
    });
    assert.throws(() => cockpitScreenLights(new Node3D()), /five/);
    assert.equal(screens, 5);
    assert.equal(triangles, model.triangles);
    assert.throws(
      () => attachCockpitDisplays(new Node3D(), radar, telemetry),
      /exactly one/,
    );
  });

void test('reticle uses cockpit coordinates and ordinary depth-tested unlit geometry, excluding shadows', async () => {
  const { cockpitReticle } =
    await import('../games/farwake/visuals/CockpitReticle.js');
  const { matrixPoint, transformMatrix } = await import('../src/3d/index.js');
  const assembly = new Node3D();
  assembly.matrix = transformMatrix({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: -1 },
  });
  const reticle = cockpitReticle();
  assembly.add(reticle);
  assert.deepEqual(matrixPoint(reticle.worldMatrix(), { x: 0, y: 0, z: 0 }), {
    x: 0,
    y: 1.5,
    z: 8,
  });
  assert.equal(reticle.mesh!.materials[0]!.unlit, true);
  assert.equal(reticle.castsShadow, false);
  assert.equal(reticle.receivesShadow, false);
  const mesh = reticle.mesh;
  assembly.transform = {
    ...assembly.transform,
    position: { x: 4, y: 0, z: 0 },
  };
  assembly.matrix = null;
  assert.deepEqual(matrixPoint(reticle.worldMatrix(), { x: 0, y: 0, z: 0 }), {
    x: 4,
    y: 1.5,
    z: -8,
  });
  assert.equal(reticle.mesh, mesh);
});
