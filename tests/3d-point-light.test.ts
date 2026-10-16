import test from 'node:test';
import assert from 'node:assert/strict';
import {
  shadeFaces,
  Node3D,
  Mesh3D,
  MeshGeometry,
  collectFaces,
  SoftwareDepthRenderer3D,
  PerspectiveCamera,
} from '../src/3d/index.js';
import type { Face, PointLight3D } from '../src/3d/index.js';
import { createLightingModel } from '../examples/3d/LightingModel.js';
const face: Face = {
  id: 'plane',
  color: '#ffffff',
  vertices: [
    { x: -1, y: -1, z: 3 },
    { x: -1, y: 1, z: 3 },
    { x: 1, y: 1, z: 3 },
    { x: 1, y: -1, z: 3 },
  ],
};
const point = (
  x: number,
  y: number,
  z: number,
  intensity = 0.5,
): PointLight3D => ({
  kind: 'point',
  position: { x, y, z },
  color: [1, 1, 1],
  intensity,
});
const redLinear = (f: Face) => {
  const s = parseInt(f.color.slice(1, 3), 16) / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
void test('point light follows inverse-square falloff at unchanged incidence angle', () => {
  const near = redLinear(shadeFaces([face], [point(0, 0, 2)])[0]!);
  const far = redLinear(shadeFaces([face], [point(0, 0, 1)])[0]!);
  assert.ok(Math.abs(far / near - 0.25) < 0.005);
  const twice = shadeFaces([face], [point(0, 0, 1, 2)])[0]!;
  assert.equal(twice.color, shadeFaces([face], [point(0, 0, 2)])[0]!.color);
});
void test('point incidence is per-face: front/back, grazing and oblique samples', () => {
  assert.equal(shadeFaces([face], [point(0, 0, 4)])[0]!.color, '#000000');
  assert.equal(shadeFaces([face], [point(2, 0, 3)])[0]!.color, '#000000');
  // distance sqrt(2), cosine 1/sqrt(2): 0.5/(2*sqrt(2)).
  const oblique = redLinear(shadeFaces([face], [point(1, 0, 2)])[0]!);
  assert.ok(Math.abs(oblique - 0.5 / (2 * Math.sqrt(2))) < 0.003);
});
void test('coincident and near-surface lights stay finite and minimum distance is explicit', () => {
  assert.equal(shadeFaces([face], [point(0, 0, 3)])[0]!.color, '#000000');
  const light = { ...point(0, 0, 2.99, 0.001), minimumDistance: 0.1 };
  const sample = redLinear(shadeFaces([face], [light])[0]!);
  assert.ok(Math.abs(sample - 0.1) < 0.003);
  assert.equal(
    shadeFaces([face], [{ ...light, position: { x: 0, y: 0, z: 2.999 } }])[0]!
      .color,
    shadeFaces([face], [light])[0]!.color,
  );
});
void test('point lights compose with ambient, tint and emission without editing shared state', () => {
  const light = { ...point(0, 0, 2), color: [1, 0, 0] as const },
    snapshot = structuredClone(light),
    source = structuredClone(face);
  assert.equal(shadeFaces([face], [light])[0]!.color, '#bc0000');
  const lit = shadeFaces(
    [face],
    [
      point(0, 0, 2, 0.25),
      { kind: 'ambient', color: [1, 1, 1], intensity: 0.25 },
    ],
  )[0]!;
  assert.equal(lit.color, '#bcbcbc');
  assert.deepEqual(light, snapshot);
  assert.deepEqual(face, source);
  assert.equal(
    shadeFaces(
      [
        {
          ...face,
          material: { color: '#ffffff', emissiveFactor: [0, 0.5, 0] },
        },
      ],
      [point(0, 0, 3)],
    )[0]!.color,
    '#00bc00',
  );
});
void test('invalid point positions and distance clamps reject', () => {
  for (const light of [
    { ...point(0, 0, 1), minimumDistance: 0 },
    { ...point(0, 0, 1), minimumDistance: -1 },
    { ...point(0, 0, 1), minimumDistance: Infinity },
    point(NaN, 0, 1),
    point(0, Infinity, 1),
  ])
    assert.throws(() => shadeFaces([face], [light]), /point light/);
});
void test('point samples follow transformed world geometry and feed the existing depth renderer', () => {
  const node = new Node3D('test');
  node.mesh = new Mesh3D(
    new MeshGeometry(face.vertices, [
      { id: 'face', indices: [0, 1, 2, 3], material: 0 },
    ]),
    [{ color: '#ffffff' }],
  );
  node.transform = {
    ...node.transform,
    position: { x: 3, y: 2, z: 1 },
    scale: { x: 2, y: 3, z: 1 },
  };
  const lit = shadeFaces(collectFaces(node), [point(3, 2, 3)]);
  assert.equal(lit[0]!.color, shadeFaces([face], [point(0, 0, 2)])[0]!.color);
  const camera = new PerspectiveCamera();
  camera.x = 3;
  camera.y = 2;
  const depth = new SoftwareDepthRenderer3D();
  assert.ok(depth.drawFaces(lit, camera, 64, 64).depthPasses > 0);
});
void test('shared reference models preserve 09 geometry and explicitly increase floor sampling for 10', () => {
  const old = collectFaces(createLightingModel()),
    tiled = collectFaces(createLightingModel(16));
  assert.equal(old.length, 15);
  assert.equal(tiled.length, 270);
  assert.deepEqual(old.slice(0, 14), tiled.slice(0, 14));
  const colors = shadeFaces(
    tiled.filter((f) => f.id.startsWith('floor/')),
    [point(-2, 3, -1, 8)],
  ).map((f) => f.color);
  assert.ok(new Set(colors).size > 20);
});

void test('extreme finite point-light settings never produce NaN color components', () => {
  const originFace = {
    ...face,
    vertices: face.vertices.map((p) => ({ ...p, z: 0 })),
  };
  const light = {
    ...point(0, 0, -Number.MIN_VALUE, 0),
    minimumDistance: Number.MIN_VALUE,
  };
  assert.equal(shadeFaces([originFace], [light])[0]!.color, '#000000');
  const black = {
    ...originFace,
    material: { color: '#000000', baseColorFactor: [0, 0, 0, 1] },
  };
  assert.equal(
    shadeFaces([black], [{ ...light, intensity: Number.MAX_VALUE }])[0]!.color,
    '#000000',
  );
});
