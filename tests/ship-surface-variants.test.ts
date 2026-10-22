import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh3D, MeshGeometry, Node3D, TextureImage } from '../src/3d/index.js';
import {
  surfaceMesh,
  surfaceVariantSwitcher,
} from '../games/farwake/SurfaceVariants.js';
import { meshColorVertices } from '../src/webgl/MeshRenderer3D.js';

function fixture() {
  const geometry = new MeshGeometry(
    [
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
      { x: 0, y: 1, z: 1 },
    ],
    [{ id: 'face', indices: [0, 1, 2], material: 0 }],
    [],
    {
      normals: [
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: 1 },
        { x: 0, y: 0, z: 1 },
      ],
      tangents: [
        [1, 0, 0, 1],
        [1, 0, 0, 1],
        [1, 0, 0, 1],
      ],
      texCoords: [
        [0, 0],
        [1, 0],
        [0, 1],
      ],
    },
  );
  const baseColorTexture = {
    image: new TextureImage(1, 1, new Uint8Array([255, 255, 255, 255])),
  };
  const data = {
    image: new TextureImage(1, 1, new Uint8Array([128, 128, 64, 255]), {
      colorSpace: 'linear',
    }),
  };
  return new Mesh3D(geometry, [
    {
      color: '#ffffff',
      baseColorTexture,
      normalTexture: data,
      normalScale: 0.7,
      metallicRoughnessTexture: data,
      occlusionTexture: data,
      occlusionStrength: 0.8,
      metallicFactor: 0.6,
      roughnessFactor: 0.4,
      emissiveFactor: [0.2, 0.3, 0.4],
      opacity: 0.5,
      unlit: true,
    },
  ]);
}
void test('Lower renderer variants remove unsupported material bindings while preserving source geometry and appearance factors', () => {
  const source = fixture();
  assert.equal(surfaceMesh(source, 'full'), source);
  const noNormal = surfaceMesh(source, 'no-normal');
  assert.equal(noNormal.geometry, source.geometry);
  assert.equal(noNormal.materials[0]!.normalTexture, undefined);
  assert.ok(noNormal.materials[0]!.metallicRoughnessTexture);
  for (const variant of ['scalar-pbr', 'diffuse'] as const) {
    const mesh = surfaceMesh(source, variant),
      material = mesh.materials[0]!;
    assert.equal(mesh.geometry, source.geometry);
    assert.equal(material.normalTexture, undefined);
    assert.equal(material.metallicRoughnessTexture, undefined);
    assert.equal(material.occlusionTexture, undefined);
    assert.equal(
      material.baseColorTexture!.image,
      source.materials[0]!.baseColorTexture!.image,
    );
    assert.deepEqual(material.emissiveFactor, [0.2, 0.3, 0.4]);
    assert.equal(material.opacity, 0.5);
    assert.equal(material.unlit, true);
    assert.equal(material.metallicFactor, 0.6 * (64 / 255));
    assert.equal(material.roughnessFactor, (0.4 * 128) / 255);
  }
  assert.ok(source.materials[0]!.normalTexture);
  assert.ok(source.materials[0]!.occlusionTexture);
  assert.equal(
    meshColorVertices(noNormal, true, true, false)[0]!.tangent,
    undefined,
  );
  assert.ok(meshColorVertices(source, true, true, true)[0]!.tangent);
});
void test('Variant switching preserves shared mesh identity, transforms, alpha flags and exact original restoration', () => {
  const root = new Node3D(),
    left = new Node3D(),
    right = new Node3D(),
    mesh = fixture();
  root.add(left).add(right);
  left.mesh = right.mesh = mesh;
  left.transform = { ...left.transform, position: { x: 3, y: 0, z: 0 } };
  right.castsShadow = false;
  const select = surfaceVariantSwitcher(root);
  select('no-normal');
  const adapted = left.mesh;
  assert.equal(right.mesh, adapted);
  assert.notEqual(adapted, mesh);
  select('diffuse');
  select('no-normal');
  assert.equal(left.mesh, adapted);
  select('full');
  assert.equal(left.mesh, mesh);
  assert.equal(right.mesh, mesh);
  assert.equal(left.transform.position.x, 3);
  assert.equal(right.castsShadow, false);
  assert.throws(() => select('invalid' as 'full'), /Unknown/);
  assert.equal(left.mesh, mesh);
});

void test('Scalar PBR factors represent both packed map channels rather than treating factor one as metal', () => {
  const source = fixture();
  const image = new TextureImage(
    2,
    1,
    new Uint8Array([0, 0, 0, 255, 0, 255, 255, 255]),
    { colorSpace: 'linear' },
  );
  const mapped = new Mesh3D(source.geometry, [
    {
      ...source.materials[0]!,
      metallicFactor: 0.6,
      roughnessFactor: 0.4,
      metallicRoughnessTexture: { image },
    },
  ]);
  const scalar = surfaceMesh(mapped, 'scalar-pbr');
  assert.equal(scalar.materials[0]!.metallicFactor, 0.3);
  assert.equal(scalar.materials[0]!.roughnessFactor, 0.2);
  assert.equal(mapped.materials[0]!.metallicFactor, 0.6);
  assert.equal(mapped.materials[0]!.metallicRoughnessTexture!.image, image);
});
