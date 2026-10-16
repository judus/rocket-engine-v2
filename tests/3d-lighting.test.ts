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
import type { Face, Light3D } from '../src/3d/index.js';

const face: Face = {
  id: 'plane',
  color: '#808080',
  vertices: [
    { x: -1, y: -1, z: 3 },
    { x: -1, y: 1, z: 3 },
    { x: 1, y: 1, z: 3 },
    { x: 1, y: -1, z: 3 },
  ],
};
const ambient = (intensity: number): Light3D => ({
  kind: 'ambient',
  color: [1, 1, 1],
  intensity,
});
const direct = (x: number, y: number, z: number, intensity = 1): Light3D => ({
  kind: 'directional',
  color: [1, 1, 1],
  intensity,
  direction: { x, y, z },
});
const rgb = (value: string) =>
  [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16));
void test('Lambert front/back/grazing angles and normalized direction have known outcomes', () => {
  assert.equal(shadeFaces([face], [direct(0, 0, -1)])[0]!.color, '#808080');
  assert.equal(shadeFaces([face], [direct(0, 0, -9)])[0]!.color, '#808080');
  assert.equal(shadeFaces([face], [direct(0, 0, 1)])[0]!.color, '#000000');
  assert.equal(shadeFaces([face], [direct(1, 0, 0)])[0]!.color, '#000000');
  assert.equal(shadeFaces([face], [])[0]!.color, '#000000');
  const half = shadeFaces([face], [direct(Math.sqrt(3), 0, -1)])[0]!.color;
  assert.equal(half, '#5c5c5c'); // half linear illumination, not half the encoded byte value.
});
void test('linear material factors, colored lights, additive fill and emission are evaluated before sRGB conversion', () => {
  const source = {
    ...face,
    material: {
      color: '#ffffff',
      baseColorFactor: [0.5, 0.5, 0.5, 1],
      emissiveFactor: [0, 0, 0],
    },
  };
  assert.equal(shadeFaces([source], [ambient(1)])[0]!.color, '#bcbcbc');
  assert.equal(
    shadeFaces([face], [ambient(0.25), ambient(0.75)])[0]!.color,
    '#808080',
  );
  assert.equal(
    shadeFaces(
      [face],
      [{ kind: 'ambient', color: [1, 0, 0], intensity: 1 }],
    )[0]!.color,
    '#800000',
  );
  assert.equal(
    shadeFaces(
      [
        {
          ...face,
          material: { color: face.color, emissiveFactor: [0.5, 0, 0] },
        },
      ],
      [],
    )[0]!.color,
    '#bc0000',
  );
  assert.equal(shadeFaces([source], [ambient(100)])[0]!.color, '#ffffff');
});
void test('world geometric normals stay correct under nonuniform scale, reflection and independent transforms', () => {
  const node = new Node3D('plane');
  node.mesh = new Mesh3D(
    new MeshGeometry(face.vertices, [
      { id: 'quad', indices: [0, 1, 2, 3], material: 0 },
    ]),
    [{ color: face.color }],
  );
  node.transform = { ...node.transform, scale: { x: 2, y: 3, z: -1 } };
  assert.equal(
    shadeFaces(collectFaces(node), [direct(0, 0, 1)])[0]!.color,
    face.color,
  );
  node.transform = {
    ...node.transform,
    rotation: { x: 0, y: Math.PI / 2, z: 0 },
  };
  assert.equal(
    shadeFaces(collectFaces(node), [direct(1, 0, 0)])[0]!.color,
    face.color,
  );
  assert.equal(
    shadeFaces(collectFaces(node), [direct(0, 0, 1)])[0]!.color,
    '#000000',
  );
});
void test('lighting leaves shared sources untouched, handles collinear leading vertices and degenerate faces', () => {
  const snapshot = structuredClone(face),
    lights = [ambient(0.1), direct(0, 0, -1)];
  const lightCopy = structuredClone(lights),
    result = shadeFaces([face], lights);
  assert.deepEqual(face, snapshot);
  assert.deepEqual(lights, lightCopy);
  assert.notEqual(result[0], face);
  assert.equal(result[0]!.vertices, face.vertices);
  const collinear = {
    ...face,
    vertices: [
      face.vertices[0]!,
      { x: -1, y: 0, z: 3 },
      ...face.vertices.slice(1),
    ],
  };
  assert.equal(
    shadeFaces([collinear], [direct(0, 0, -1)])[0]!.color,
    face.color,
  );
  assert.equal(
    shadeFaces(
      [
        {
          ...face,
          vertices: [
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
            { x: 0, y: 0, z: 0 },
          ],
        },
      ],
      [direct(0, 0, -1)],
    )[0]!.color,
    '#000000',
  );
});
void test('invalid light and material input reject instead of propagating NaN or hidden defaults', () => {
  for (const lights of [
    [ambient(-1)],
    [ambient(NaN)],
    [direct(0, 0, 0)],
    [direct(Infinity, 0, 1)],
    [{ ...ambient(1), color: [1, NaN, 0] } as Light3D],
  ])
    assert.throws(() => shadeFaces([face], lights));
  assert.throws(
    () => shadeFaces([{ ...face, color: 'red' }], [ambient(1)]),
    /#rrggbb/,
  );
  assert.throws(
    () =>
      shadeFaces(
        [
          {
            ...face,
            material: { color: '#000000', baseColorFactor: [1, 1, 1] },
          },
        ],
        [ambient(1)],
      ),
    /components/,
  );
});
void test('shaded colors reach the existing depth backend and camera changes never relight world surfaces', () => {
  const camera = new PerspectiveCamera(),
    renderer = new SoftwareDepthRenderer3D();
  const lit = shadeFaces([face], [ambient(0.5)]);
  renderer.drawFaces(lit, camera, 64, 64);
  const expected = rgb(lit[0]!.color),
    offset = (32 * 64 + 32) * 4;
  assert.deepEqual(
    Array.from(renderer.pixels.slice(offset, offset + 3)),
    expected,
  );
  camera.x = 1;
  camera.yaw = 0.1;
  assert.deepEqual(shadeFaces([face], [ambient(0.5)]), lit);
});
