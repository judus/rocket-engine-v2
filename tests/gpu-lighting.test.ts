import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalMatrix,
  Mesh3D,
  MeshGeometry,
  identityMatrix,
} from '../src/3d/index.js';
import type { Matrix4 } from '../src/3d/index.js';
import { lightUniforms } from '../src/webgl/LightUniforms.js';
import { meshColorVertices } from '../src/webgl/MeshRenderer3D.js';

void test('inverse-transpose normals remain perpendicular under scale, shear and reflection', () => {
  for (const m of [
    [2, 0, 0, 0, 1, 3, 0, 0, 0, 1, 0.5, 0, 4, 5, 6, 1],
    [-2, 0, 0, 0, 1, 3, 0, 0, 0, 1, 0.5, 0, 4, 5, 6, 1],
  ] as Matrix4[]) {
    const n = normalMatrix(m);
    const normal = [
      n[0]! + n[3]! + n[6]!,
      n[1]! + n[4]! + n[7]!,
      n[2]! + n[5]! + n[8]!,
    ];
    for (const t of [
      [1, -1, 0],
      [1, 0, -1],
    ]) {
      const world = [
        m[0] * t[0]! + m[4] * t[1]! + m[8] * t[2]!,
        m[1] * t[0]! + m[5] * t[1]! + m[9] * t[2]!,
        m[2] * t[0]! + m[6] * t[1]! + m[10] * t[2]!,
      ];
      const dot = world.reduce((sum, v, i) => sum + v * normal[i]!, 0);
      assert.ok(Math.abs(dot) < 1e-10);
    }
  }
  assert.throws(
    () =>
      normalMatrix([
        ...identityMatrix.slice(0, 10),
        0,
        ...identityMatrix.slice(11),
      ] as unknown as Matrix4),
    /invertible/,
  );
});

void test('GPU light packing normalizes directions, preserves world positions and rejects unsupported values', () => {
  const packed = lightUniforms([
    { kind: 'ambient', color: [0.5, 0.2, 1], intensity: 0.2 },
    {
      kind: 'directional',
      direction: { x: 0, y: 3, z: 4 },
      color: [1, 1, 1],
      intensity: 2,
    },
    {
      kind: 'point',
      position: { x: 1, y: 2, z: 3 },
      color: [1, 0, 0],
      intensity: 4,
      minimumDistance: 0.5,
    },
  ]);
  assert.equal(packed.count, 3);
  assert.deepEqual(Array.from(packed.vectors.slice(8, 12)), [1, 2, 3, 2]);
  assert.ok(Math.abs(packed.vectors[5]! - 0.6) < 1e-6);
  assert.equal(packed.minimums[2], 0.5);
  assert.equal(lightUniforms([]).count, 0);
  const full = lightUniforms(
    Array.from({ length: 12 }, (_, i) => ({
      kind: 'point' as const,
      position: { x: i, y: 0, z: 0 },
      color: [1, 0.5, 0.1] as const,
      intensity: i + 1,
    })),
  );
  assert.equal(full.count, 12);
  assert.equal(full.vectors[44], 11);
  assert.equal(full.colors[47], 12);
  assert.throws(
    () =>
      lightUniforms(
        Array.from({ length: 13 }, () => ({
          kind: 'ambient',
          color: [1, 1, 1],
          intensity: 1,
        })),
      ),
    /at most 12/,
  );
  assert.throws(
    () =>
      lightUniforms([
        {
          kind: 'directional',
          direction: { x: 0, y: 0, z: 0 },
          color: [1, 1, 1],
          intensity: 1,
        },
      ]),
    /nonzero/,
  );
  assert.throws(
    () =>
      lightUniforms([
        { kind: 'ambient', color: [1, 1, 1], intensity: Infinity },
      ]),
    /intensity/,
  );
  assert.throws(
    () =>
      lightUniforms([
        {
          kind: 'point',
          position: { x: 0, y: 0, z: 0 },
          color: [1, 1, 1],
          intensity: 1,
          minimumDistance: 1e-9,
        },
      ]),
    /minimum distance/,
  );
});

void test('lit mesh preparation preserves imported normals and linear factors, derives flat normals when absent', () => {
  const positions = [
    { x: -1, y: -1, z: 0 },
    { x: 1, y: -1, z: 0 },
    { x: 1, y: 1, z: 0 },
    { x: -1, y: 1, z: 0 },
  ];
  const faces = [{ id: 'face', indices: [0, 1, 2, 3], material: 0 }];
  const material = {
    color: '#ffffff',
    baseColorFactor: [0.2, 0.3, 0.4, 1],
    emissiveFactor: [0.1, 0, 0],
  };
  const flat = meshColorVertices(
    new Mesh3D(new MeshGeometry(positions, faces), [material]),
    true,
  );
  assert.equal(flat.length, 6);
  assert.deepEqual(flat[0]!.normal, { x: 0, y: 0, z: 1 });
  assert.deepEqual(flat[0]!.color, [0.2, 0.3, 0.4]);
  assert.deepEqual(flat[0]!.emission, [0.1, 0, 0]);
  const smooth = new MeshGeometry(positions, faces, [], {
    normals: positions.map(() => ({ x: 0, y: 3, z: 4 })),
  });
  assert.deepEqual(
    meshColorVertices(new Mesh3D(smooth, [material]), true)[0]!.normal,
    { x: 0, y: 0.6, z: 0.8 },
  );
  assert.throws(
    () =>
      meshColorVertices(
        new Mesh3D(smooth, [{ ...material, baseColorFactor: [1, 1, 1, 0.5] }]),
        true,
      ),
    /opaque/,
  );
  assert.throws(
    () =>
      meshColorVertices(
        new Mesh3D(smooth, [{ ...material, emissiveFactor: [NaN, 0, 0] }]),
        true,
      ),
    /emissive/,
  );
});
