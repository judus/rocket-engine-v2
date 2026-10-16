import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  parseGlb,
  loadGlb,
  matrixPoint,
  collectFaces,
  PerspectiveCamera,
  SoftwareDepthRenderer3D,
  Node3D,
} from '../src/3d/index.js';

function pack(doc: unknown, bin: Uint8Array): ArrayBuffer {
  const text = new TextEncoder().encode(JSON.stringify(doc)),
    jsonLength = Math.ceil(text.length / 4) * 4,
    binLength = Math.ceil(bin.length / 4) * 4;
  const buffer = new ArrayBuffer(28 + jsonLength + binLength),
    view = new DataView(buffer),
    bytes = new Uint8Array(buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, buffer.byteLength, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonLength);
  bytes.set(text, 20);
  view.setUint32(20 + jsonLength, binLength, true);
  view.setUint32(24 + jsonLength, 0x004e4942, true);
  bytes.set(bin, 28 + jsonLength);
  return buffer;
}
function fixture() {
  const bin = new Uint8Array(52),
    data = new DataView(bin.buffer);
  // Interleaved position + unused padding, then unsigned-byte indices.
  [-1, -1, -2, 0, 1, -1, -2, 0, 0, 1, -2, 0].forEach((v, i) =>
    data.setFloat32(i * 4, v, true),
  );
  bin.set([0, 1, 2], 48);
  const doc = {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 52 }],
    bufferViews: [
      { buffer: 0, byteLength: 48, byteStride: 16 },
      { buffer: 0, byteOffset: 48, byteLength: 3 },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 1, componentType: 5121, count: 3, type: 'SCALAR' },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    nodes: [{ name: 'triangle', mesh: 0 }],
    scenes: [{ name: 'triangle scene', nodes: [0] }],
  };
  return { doc, bin };
}
void test('GLB strided vertices and byte indices produce reusable instances and render through existing backend', () => {
  const { doc, bin } = fixture(),
    model = parseGlb(pack(doc, bin)),
    a = model.instantiate(),
    b = model.instantiate();
  assert.equal(model.triangles, 1);
  assert.equal(model.vertices, 3);
  assert.equal(model.name, 'triangle scene');
  assert.notEqual(a.root, b.root);
  assert.equal(a.nodes[0]!.mesh, b.nodes[0]!.mesh);
  a.nodes[0]!.visible = false;
  assert.equal(collectFaces(a.root).length, 0);
  assert.equal(collectFaces(b.root).length, 1);
  const mount = new Node3D();
  mount.transform = { ...mount.transform, scale: { x: 1, y: 1, z: -1 } };
  mount.add(b.root);
  const renderer = new SoftwareDepthRenderer3D();
  const stats = renderer.render(mount, new PerspectiveCamera(), 64, 64);
  assert.ok(stats.depthPasses > 0);
  assert.ok(renderer.depthAt(32, 32) < 3);
});
void test('GLB quaternion hierarchy and exact matrix preserve source coordinates without Euler conversion', () => {
  const { doc, bin } = fixture();
  const n = doc.nodes as unknown[];
  n.push({
    name: 'parent',
    translation: [3, 4, 5],
    rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
    scale: [2, 3, 4],
    children: [0],
  });
  doc.scenes[0]!.nodes = [1];
  const asset = parseGlb(pack(doc, bin)),
    instance = asset.instantiate();
  const result = matrixPoint(instance.nodes[0]!.worldMatrix(), {
    x: 1,
    y: 0,
    z: 0,
  });
  assert.ok(Math.abs(result.x - 3) < 1e-12);
  assert.ok(Math.abs(result.y - 6) < 1e-12);
  assert.equal(result.z, 5);
  const leaf = instance.nodes[0]!;
  leaf.matrix = null;
  leaf.transform = { ...leaf.transform, position: { x: 1, y: 0, z: 0 } };
  assert.notEqual(
    leaf.worldMatrix(),
    asset.instantiate().nodes[0]!.worldMatrix(),
  );
});
void test('GLB rejects truncated containers, bad accessor spans, invalid topology and unsupported rendering features', () => {
  const { doc, bin } = fixture(),
    bytes = pack(doc, bin);
  assert.throws(() => parseGlb(bytes.slice(0, -4)), /header/);
  const edits: ((d: Record<string, unknown>) => void)[] = [
    (d) => {
      d.extensionsRequired = ['KHR_draco_mesh_compression'];
    },
    (d) => {
      d.animations = [{}];
    },
    (d) => {
      d.textures = [{}];
    },
    (d) => {
      (d.accessors as { count: number }[])[0]!.count = 100000000;
    },
    (d) => {
      (d.nodes as unknown[]).push({ children: [0] });
      (d.nodes as Record<string, unknown>[])[0]!.children = [1];
    },
    (d) => {
      (d.nodes as unknown[]).push({ children: [0, 0] });
    },
    (d) => {
      (d.nodes as Record<string, unknown>[])[0]!.matrix = [
        1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
      ];
      (d.nodes as Record<string, unknown>[])[0]!.translation = [0, 0, 0];
    },
    (d) => {
      (d.accessors as Record<string, unknown>[])[0]!.sparse = {};
    },
    (d) => {
      d.materials = [{ alphaMode: 'BLEND' }];
    },
  ];
  for (const edit of edits) {
    const copy = structuredClone(doc);
    edit(copy);
    assert.throws(() => parseGlb(pack(copy, bin)), /GLB:/);
  }
  const broken = bin.slice();
  broken[50] = 99;
  assert.throws(() => parseGlb(pack(doc, broken)), /geometry index/);
});
void test('cockpit v3 loads unchanged: names, UVs, normals, linear material factors, camera and independent placements', async () => {
  const bytes = await readFile(
    new URL('../../examples/3d/assets/cockpit-forward-v3.glb', import.meta.url),
  );
  const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ),
    model = parseGlb(buffer),
    instance = model.instantiate();
  assert.equal(model.triangles, 2072);
  assert.equal(model.vertices, 6216);
  assert.equal(model.meshCount, 17);
  assert.equal(instance.cameras.length, 1);
  assert.equal(instance.cameras[0]!.near, 0.03);
  assert.equal(instance.cameras[0]!.node.name, 'PilotCamera');
  assert.equal(
    instance.nodes.filter((n) => n.name.includes('screen-black')).length,
    7,
  );
  const mesh = instance.nodes.find((n) => n.mesh)!.mesh!;
  assert.equal(mesh.geometry.normals.length, mesh.geometry.vertices.length);
  assert.equal(mesh.geometry.texCoords.length, mesh.geometry.vertices.length);
  assert.ok(Object.isFrozen(mesh.geometry.texCoords[0]));
  assert.ok(Object.isFrozen(mesh.materials[0]!.baseColorFactor));
  const mount = new Node3D();
  mount.transform = { ...mount.transform, scale: { x: 1, y: 1, z: -1 } };
  mount.add(instance.root);
  const camera = new PerspectiveCamera();
  camera.y = 1.5;
  camera.near = 0.03;
  camera.far = 100;
  const renderer = new SoftwareDepthRenderer3D();
  assert.ok(renderer.render(mount, camera, 160, 90).depthPasses > 0);
});
void test('loadGlb reports HTTP failure and forwards caller cancellation; no hidden cache', async (t) => {
  const { doc, bin } = fixture();
  let calls = 0;
  t.mock.method(
    globalThis,
    'fetch',
    async (_url: unknown, options: RequestInit) => {
      calls++;
      options.signal?.throwIfAborted();
      return calls === 1
        ? new Response('', { status: 404 })
        : new Response(pack(doc, bin));
    },
  );
  await assert.rejects(loadGlb('test.glb'), /HTTP 404/);
  assert.equal((await loadGlb('test.glb')).triangles, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(loadGlb('test.glb', { signal: controller.signal }), {
    name: 'AbortError',
  });
  assert.equal(calls, 3);
});

void test('GLB exact matrices, multiple primitives and unsigned-short indices stay generic', () => {
  const { doc, bin } = fixture();
  const value = structuredClone(doc) as unknown as Record<string, unknown>;
  value.nodes = [
    {
      name: 'placed',
      mesh: 0,
      matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 4, 5, 6, 1],
    },
  ];
  const mesh = (value.meshes as { primitives: unknown[] }[])[0]!;
  mesh.primitives.push(structuredClone(mesh.primitives[0]));
  const expanded = new Uint8Array(56);
  expanded.set(bin);
  new DataView(expanded.buffer).setUint16(48, 0, true);
  new DataView(expanded.buffer).setUint16(50, 1, true);
  new DataView(expanded.buffer).setUint16(52, 2, true);
  (value.buffers as { byteLength: number }[])[0]!.byteLength = 56;
  (value.bufferViews as { byteLength: number }[])[1]!.byteLength = 6;
  (value.accessors as { componentType: number }[])[1]!.componentType = 5123;
  const model = parseGlb(pack(value, expanded)),
    instance = model.instantiate();
  assert.equal(model.triangles, 2);
  assert.equal(instance.nodes[0]!.children.length, 2);
  assert.deepEqual(
    matrixPoint(instance.nodes[0]!.worldMatrix(), { x: 0, y: 0, z: 0 }),
    { x: 4, y: 5, z: 6 },
  );
  assert.equal(collectFaces(instance.root).length, 2);
});

void test('textured cockpit retains original geometry/tangents and shares source images across standard material slots', async () => {
  const { embeddedGlbImages } = await import('../src/3d/GlbModel.js');
  const { TextureImage } = await import('../src/3d/TextureImage.js');
  const bytes = await readFile(
    new URL(
      '../../examples/3d/assets/cockpit-forward-v4-materials.glb',
      import.meta.url,
    ),
  );
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const images = embeddedGlbImages(buffer);
  assert.equal(images.length, 9);
  assert.equal(images[0]!.mimeType, 'image/png');
  assert.deepEqual([...images[0]!.bytes.slice(0, 4)], [137, 80, 78, 71]);
  assert.throws(() => parseGlb(buffer), /unsupported textures/);
  const cache = new Map<string, InstanceType<typeof TextureImage>>();
  const model = parseGlb(buffer, {
    resolveImage(index, colorSpace) {
      const key = `${index}/${colorSpace}`;
      let image = cache.get(key);
      if (!image) {
        image = new TextureImage(1, 1, new Uint8Array([128, 128, 255, 255]), {
          colorSpace,
        });
        cache.set(key, image);
      }
      return image;
    },
  });
  assert.equal(model.triangles, 2072);
  assert.equal(model.meshCount, 17);
  assert.equal(model.vertices, 6216);
  assert.equal(cache.size, 9);
  const a = model.instantiate(),
    b = model.instantiate();
  assert.equal(a.cameras.length, 1);
  let mapped = 0;
  a.root.traverse((node) => {
    if (!node.mesh) return;
    const mesh = node.mesh,
      m = mesh.materials[0]!;
    assert.equal(mesh.geometry.tangents.length, mesh.geometry.vertices.length);
    if (m.normalTexture) {
      mapped++;
      assert.equal(m.normalTexture.image.colorSpace, 'linear');
      assert.equal(m.baseColorTexture!.image.colorSpace, 'srgb');
      assert.equal(
        m.metallicRoughnessTexture!.image,
        m.occlusionTexture!.image,
      );
      assert.equal(m.baseColorTexture!.wrapS, 'repeat');
      assert.equal(m.baseColorTexture!.filter, 'trilinear');
    }
  });
  assert.ok(mapped > 0);
  assert.notEqual(a.root, b.root);
  assert.equal(a.nodes[0]!.mesh, b.nodes[0]!.mesh);
});
void test('textured GLB rejects external/bad image descriptors, unsupported UV/filter settings, and missing tangent bases', async () => {
  const { readGlbContainer } = await import('../src/3d/GlbContainer.js');
  const { embeddedGlbImages } = await import('../src/3d/GlbModel.js');
  const { TextureImage } = await import('../src/3d/TextureImage.js');
  const bytes = await readFile(
    new URL(
      '../../examples/3d/assets/cockpit-forward-v4-materials.glb',
      import.meta.url,
    ),
  );
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const container = readGlbContainer(buffer),
    bin = new Uint8Array(
      container.binary!.buffer,
      container.binary!.byteOffset,
      container.binary!.byteLength,
    );
  const decode = (_index: number, colorSpace: 'srgb' | 'linear') =>
    new TextureImage(1, 1, new Uint8Array([128, 128, 255, 255]), {
      colorSpace,
    });
  const mutate = (change: (doc: Record<string, unknown>) => void) => {
    const doc = structuredClone(container.document) as Record<string, unknown>;
    change(doc);
    return pack(doc, bin);
  };
  assert.throws(
    () =>
      embeddedGlbImages(
        mutate((d) => {
          (d.images as Record<string, unknown>[])[0]!.uri = 'external.png';
        }),
      ),
    /unsupported uri/,
  );
  assert.throws(
    () =>
      embeddedGlbImages(
        mutate((d) => {
          (d.images as Record<string, unknown>[])[0]!.mimeType = 'image/webp';
        }),
      ),
    /PNG\/JPEG/,
  );
  assert.throws(
    () =>
      embeddedGlbImages(
        mutate((d) => {
          (d.images as Record<string, unknown>[])[0]!.bufferView = 99999;
        }),
      ),
    /range/,
  );
  assert.throws(
    () =>
      parseGlb(
        mutate((d) => {
          (d.samplers as Record<string, unknown>[])[0]!.minFilter = 9728;
        }),
        { resolveImage: decode },
      ),
    /filter combination/,
  );
  assert.throws(
    () =>
      parseGlb(
        mutate((d) => {
          (
            d.materials as { normalTexture: Record<string, unknown> }[]
          )[0]!.normalTexture.texCoord = 1;
        }),
        { resolveImage: decode },
      ),
    /TEXCOORD_0/,
  );
  assert.throws(
    () =>
      parseGlb(
        mutate((d) => {
          delete (
            d.meshes as {
              primitives: { attributes: Record<string, unknown> }[];
            }[]
          )[0]!.primitives[0]!.attributes.TANGENT;
        }),
        { resolveImage: decode },
      ),
    /normals, tangents/,
  );
  assert.throws(
    () =>
      parseGlb(buffer, {
        resolveImage: () =>
          new TextureImage(1, 1, new Uint8Array([128, 128, 255, 255])),
      }),
    /transfer function/,
  );
});
