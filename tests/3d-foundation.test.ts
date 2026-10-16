import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Node3D,
  Mesh3D,
  MeshGeometry,
  collectFaces,
  matrixPoint,
  CanvasRenderer3D,
  PerspectiveCamera,
} from '../src/3d/index.js';

const geometry = () =>
  new MeshGeometry(
    [
      { x: -1, y: -1, z: 0 },
      { x: -1, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
    ],
    [{ id: 'triangle', indices: [0, 1, 2], material: 0 }],
  );

void test('nested nonuniform scale and rotation compose without losing shear; reparenting preserves local pose', () => {
  const parent = new Node3D('parent'),
    child = new Node3D('child'),
    leaf = new Node3D('leaf');
  parent.transform = {
    position: { x: 10, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: Math.PI / 2 },
    scale: { x: 2, y: 3, z: 4 },
  };
  child.transform = {
    position: { x: 1, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: Math.PI / 2 },
    scale: { x: 1, y: 2, z: 1 },
  };
  parent.add(child);
  child.add(leaf);
  // (1,1,0) -> child (-1,1,0) -> parent (7,-2,0).
  const p = matrixPoint(leaf.worldMatrix(), { x: 1, y: 1, z: 0 });
  assert.ok(Math.abs(p.x - 7) < 1e-10 && Math.abs(p.y + 2) < 1e-10);
  assert.throws(() => leaf.add(parent), /cycles/);
  assert.equal(child.parent, parent);
  assert.equal(parent.parent, null);
  const other = new Node3D();
  other.add(child);
  assert.equal(parent.children.length, 0);
  assert.equal(child.parent, other);
  assert.equal(child.transform.position.x, 1);
  other.remove(child);
  other.remove(child);
  assert.equal(child.parent, null);
});

void test('shared geometry survives independent materials, parent changes, detach, visibility and mirrored winding', () => {
  const source = geometry(),
    root = new Node3D(),
    a = new Node3D('a'),
    b = new Node3D('b');
  a.mesh = new Mesh3D(source, [{ color: '#f00' }]);
  b.mesh = new Mesh3D(source, [{ color: '#00f' }]);
  root.add(a).add(b);
  b.transform = {
    ...b.transform,
    position: { x: 3, y: 0, z: 5 },
    scale: { x: -1, y: 1, z: 1 },
  };
  const first = collectFaces(root);
  assert.deepEqual(
    first.map((f) => f.color),
    ['#f00', '#00f'],
  );
  const mirrored = first[1]!.vertices;
  const [p, q, r] = mirrored;
  assert.ok((q!.x - p!.x) * (r!.y - p!.y) - (q!.y - p!.y) * (r!.x - p!.x) < 0);
  root.transform = { ...root.transform, position: { x: 0, y: 0, z: 4 } };
  assert.equal(collectFaces(root)[1]!.vertices[0]!.z, 9);
  assert.equal(first[1]!.vertices[0]!.z, 5);
  assert.equal(source.vertices[0]!.x, -1);
  assert.ok(Object.isFrozen(source.vertices[0]));
  root.remove(a);
  assert.equal(collectFaces(root).length, 1);
  root.visible = false;
  assert.equal(collectFaces(root).length, 0);
});

void test('geometry rejects invalid indices, sparse inputs and missing surface bindings at the asset boundary', () => {
  const points = [{ x: 0, y: 0, z: 0 }];
  assert.throws(
    () =>
      new MeshGeometry(points, [
        { id: 'bad', indices: [0, 1, 0], material: 0 },
      ]),
    /index/,
  );
  assert.throws(
    () => new MeshGeometry(new Array(3) as typeof points, []),
    /finite/,
  );
  assert.throws(
    () =>
      new MeshGeometry(points, [
        { id: 'bad', indices: new Array<number>(3), material: 0 },
      ]),
    /index/,
  );
  assert.throws(() => new Mesh3D(geometry(), []), /material/);
});

void test('public renderer works without a DOM, clips geometry, returns counts and restores caller state on failure', () => {
  const calls: string[] = [];
  const ctx = {
    save() {
      calls.push('save');
    },
    restore() {
      calls.push('restore');
    },
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {
      calls.push('fill');
    },
    stroke() {
      calls.push('stroke');
    },
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
  const root = new Node3D();
  root.mesh = new Mesh3D(geometry(), [{ color: '#f00' }]);
  root.transform = { ...root.transform, position: { x: 0, y: 0, z: 3 } };
  const camera = new PerspectiveCamera(),
    renderer = new CanvasRenderer3D();
  const result = renderer.render(ctx, root, camera, 800, 400);
  assert.equal(result.submitted, 1);
  assert.equal(result.visible.length, 1);
  assert.deepEqual(calls, ['save', 'fill', 'restore']);
  root.transform = { ...root.transform, position: { x: 0, y: 0, z: -3 } };
  assert.equal(renderer.render(ctx, root, camera, 800, 400).visible.length, 0);
  root.transform = { ...root.transform, position: { x: 0, y: 0, z: 3 } };
  ctx.fill = () => {
    throw new Error('context failed');
  };
  assert.throws(
    () => renderer.render(ctx, root, camera, 800, 400),
    /context failed/,
  );
  assert.equal(calls.at(-1), 'restore');
});
