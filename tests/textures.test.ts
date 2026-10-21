import { DynamicTextureImage } from '../src/3d/index.js';
import { updateTextureFromCanvas } from '../src/webgl/index.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { TextureImage, MeshGeometry, Mesh3D } from '../src/3d/index.js';
import { textureBinding } from '../src/3d/TextureImage.js';
import { WebGLTextureStore } from '../src/webgl/TextureStore.js';
import { meshColorVertices } from '../src/webgl/MeshRenderer3D.js';

const image = () =>
  new TextureImage(
    2,
    1,
    new Uint8Array([128, 64, 32, 255, 255, 255, 255, 255]),
  );
function fixture(failure = '') {
  const textures = new Set(),
    samplers = new Set();
  const calls: { name: string; args: unknown[] }[] = [];
  let lost = false,
    failUpdate = failure === 'update';
  const constants = Object.fromEntries(
    [
      'MAX_TEXTURE_SIZE',
      'TEXTURE0',
      'TEXTURE_2D',
      'UNPACK_ALIGNMENT',
      'UNPACK_FLIP_Y_WEBGL',
      'UNPACK_PREMULTIPLY_ALPHA_WEBGL',
      'UNPACK_COLORSPACE_CONVERSION_WEBGL',
      'NONE',
      'SRGB8_ALPHA8',
      'RGBA8',
      'RGBA',
      'UNSIGNED_BYTE',
      'TEXTURE_WRAP_S',
      'TEXTURE_WRAP_T',
      'REPEAT',
      'CLAMP_TO_EDGE',
      'MIRRORED_REPEAT',
      'TEXTURE_MAG_FILTER',
      'TEXTURE_MIN_FILTER',
      'NEAREST',
      'LINEAR',
      'LINEAR_MIPMAP_LINEAR',
    ].map((key, i) => [key, i + 1]),
  );
  const methods: Record<string, (...args: unknown[]) => unknown> = {
    getParameter: () => 4096,
    isContextLost: () => lost,
    createTexture: () => {
      if (failure === 'texture') return null;
      const t = {};
      textures.add(t);
      return t;
    },
    createSampler: () => {
      if (failure === 'sampler') return null;
      const s = {};
      samplers.add(s);
      return s;
    },
    deleteTexture: (t) => textures.delete(t),
    deleteSampler: (s) => samplers.delete(s),
    texSubImage2D: () => {
      if (failUpdate) {
        failUpdate = false;
        throw new Error('update failed');
      }
    },
    texImage2D: () => {
      if (failure === 'upload') throw new Error('upload failed');
    },
  };
  const gl = new Proxy(constants, {
    get(target, key) {
      if (key in target) return Reflect.get(target, key) as unknown;
      return (...args: unknown[]) => {
        calls.push({ name: String(key), args });
        return methods[String(key)]?.(...args);
      };
    },
  }) as unknown as WebGL2RenderingContext;
  return {
    gl,
    calls,
    textures,
    samplers,
    lose() {
      lost = true;
    },
  };
}
void test('opaque image data is copied in and out; bindings and mesh wrappers are immutable', () => {
  const bytes = new Uint8Array([128, 64, 32, 255]);
  const asset = new TextureImage(1, 1, bytes);
  bytes[0] = 0;
  const copy = asset.copyPixels();
  copy[0] = 0;
  assert.equal(asset.copyPixels()[0], 128);
  assert.throws(() => new TextureImage(1, 1, new Uint8Array(4)), /opaque/);
  assert.throws(() => new TextureImage(0, 1, bytes), /dimensions/);
  assert.throws(() => new TextureImage(1, 2, bytes), /byte count/);
  assert.throws(
    () => textureBinding({ image: asset, filter: 'invalid' as 'linear' }),
    /binding/,
  );
  const binding = textureBinding({ image: asset });
  assert.ok(Object.isFrozen(binding));
  assert.equal(binding.filter, 'trilinear');
  const geometry = new MeshGeometry(
    [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ],
    [{ id: 'a', indices: [0, 1, 2], material: 0 }],
    [],
    {
      texCoords: [
        [0, 0],
        [2, 0],
        [0, 2],
      ],
    },
  );
  const source = { image: asset, filter: 'nearest' as const };
  const mesh = new Mesh3D(geometry, [
    { color: '#ffffff', baseColorTexture: source },
  ]);
  assert.notEqual(mesh.materials[0]!.baseColorTexture, source);
  assert.ok(Object.isFrozen(mesh.materials[0]!.baseColorTexture));
  assert.deepEqual(
    meshColorVertices(mesh, true).map((v) => v.texCoord),
    [
      [0, 0],
      [2, 0],
      [0, 2],
    ],
  );
});
void test('one sRGB upload and mip chain per image, independent sampler reuse, exact byte accounting', () => {
  const f = fixture(),
    store = new WebGLTextureStore(f.gl),
    asset = image();
  store.begin();
  store.bind({ image: asset });
  store.bind({ image: asset });
  assert.equal(f.calls.filter((c) => c.name === 'texImage2D').length, 1);
  assert.equal(f.calls.filter((c) => c.name === 'generateMipmap').length, 1);
  const upload = f.calls.find((c) => c.name === 'texImage2D')!;
  assert.equal(upload.args[2], f.gl.SRGB8_ALPHA8);
  assert.equal(upload.args[3], 2);
  assert.deepEqual(store.stats, { textures: 1, samplers: 1, textureBytes: 12 });
  store.bind({
    image: asset,
    filter: 'nearest',
    wrapS: 'clamp',
    wrapT: 'mirror',
  });
  assert.equal(store.stats.samplers, 2);
  assert.equal(store.stats.textures, 1);
  const values = f.calls
    .filter((c) => c.name === 'samplerParameteri')
    .map((c) => c.args[2]);
  assert.ok(values.includes(f.gl.LINEAR_MIPMAP_LINEAR));
  assert.ok(values.includes(f.gl.NEAREST));
  assert.ok(values.includes(f.gl.CLAMP_TO_EDGE));
  assert.ok(values.includes(f.gl.MIRRORED_REPEAT));
  store.end();
  store.dispose();
  store.dispose();
  assert.equal(f.textures.size, 0);
  assert.equal(f.samplers.size, 0);
});
void test('unused images and samplers retire after a frame; neutral white completes untextured draws', () => {
  const f = fixture(),
    store = new WebGLTextureStore(f.gl);
  store.begin();
  store.bind({ image: image() });
  store.end();
  store.begin();
  store.bind();
  store.end();
  assert.deepEqual(store.stats, { textures: 1, samplers: 1, textureBytes: 4 });
  store.begin();
  store.end();
  assert.equal(f.textures.size, 0);
  assert.equal(f.samplers.size, 0);
  store.dispose();
});
void test('failed allocations/uploads, lost contexts and disposed stores do not leak', () => {
  for (const failure of ['texture', 'sampler', 'upload']) {
    const f = fixture(failure),
      store = new WebGLTextureStore(f.gl);
    store.begin();
    assert.throws(() => store.bind({ image: image() }));
    store.dispose();
    assert.equal(f.textures.size, 0);
    assert.equal(f.samplers.size, 0);
    assert.throws(() => store.begin(), /unavailable/);
  }
  const f = fixture(),
    store = new WebGLTextureStore(f.gl);
  f.lose();
  assert.throws(() => store.begin(), /unavailable/);
  store.dispose();
});

void test('linear data has its own transfer function, shared GPU allocation and sampler bindings on independent units', () => {
  const f = fixture(),
    store = new WebGLTextureStore(f.gl);
  const asset = new TextureImage(1, 1, new Uint8Array([64, 128, 192, 255]), {
    colorSpace: 'linear',
  });
  assert.equal(asset.colorSpace, 'linear');
  assert.equal(image().colorSpace, 'srgb');
  assert.throws(
    () =>
      new TextureImage(1, 1, new Uint8Array([1, 2, 3, 255]), {
        colorSpace: 'invalid' as 'linear',
      }),
    /color space/,
  );
  store.begin();
  store.bind({ image: asset }, 1, 'linear');
  store.bind({ image: asset }, 2, 'linear');
  assert.equal(f.calls.filter((c) => c.name === 'texImage2D').length, 1);
  assert.equal(
    f.calls.find((c) => c.name === 'texImage2D')!.args[2],
    f.gl.RGBA8,
  );
  assert.equal(store.stats.textures, 1);
  assert.equal(store.stats.samplers, 1);
  assert.deepEqual(
    f.calls.filter((c) => c.name === 'bindSampler').map((c) => c.args[0]),
    [1, 2],
  );
  assert.throws(
    () => store.bind({ image: asset }, 0, 'srgb'),
    /transfer function/,
  );
  assert.throws(
    () => store.bind({ image: image() }, 1, 'linear'),
    /transfer function/,
  );
  assert.throws(() => store.bind(undefined, 4), /unit/);
  store.end();
  assert.ok(
    f.calls.some(
      (c) => c.name === 'bindSampler' && c.args[0] === 1 && c.args[1] === null,
    ),
  );
  assert.ok(
    f.calls.some(
      (c) => c.name === 'bindSampler' && c.args[0] === 2 && c.args[1] === null,
    ),
  );
  store.begin();
  store.bind(undefined, 1, 'linear');
  store.bind(undefined, 2, 'linear');
  store.end();
  assert.deepEqual(store.stats, { textures: 1, samplers: 1, textureBytes: 4 });
  store.dispose();
  assert.equal(f.textures.size, 0);
  assert.equal(f.samplers.size, 0);
});
void test('material data bindings are immutable, require linear data and reject invalid AO strength', () => {
  const geometry = new MeshGeometry(
    [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ],
    [{ id: 'a', indices: [0, 1, 2], material: 0 }],
  );
  const asset = new TextureImage(1, 1, new Uint8Array([64, 128, 192, 255]), {
    colorSpace: 'linear',
  });
  const binding = { image: asset };
  const mesh = new Mesh3D(geometry, [
    {
      color: '#ffffff',
      metallicRoughnessTexture: binding,
      occlusionTexture: binding,
      occlusionStrength: 0.5,
    },
  ]);
  assert.ok(Object.isFrozen(mesh.materials[0]!.metallicRoughnessTexture));
  assert.notEqual(mesh.materials[0]!.occlusionTexture, binding);
  assert.equal(
    mesh.materials[0]!.occlusionTexture!.image,
    mesh.materials[0]!.metallicRoughnessTexture!.image,
  );
  assert.throws(
    () =>
      new Mesh3D(geometry, [{ color: '#ffffff', baseColorTexture: binding }]),
    /sRGB/,
  );
  assert.throws(
    () =>
      new Mesh3D(geometry, [
        { color: '#ffffff', metallicRoughnessTexture: { image: image() } },
      ]),
    /linear/,
  );
  assert.throws(
    () =>
      new Mesh3D(geometry, [
        { color: '#ffffff', occlusionTexture: { image: image() } },
      ]),
    /linear/,
  );
  for (const strength of [NaN, -0.1, 1.1])
    assert.throws(
      () =>
        new Mesh3D(geometry, [
          { color: '#ffffff', occlusionStrength: strength },
        ]),
      /occlusion strength/,
    );
});

void test('normal bindings require immutable linear data; tangent attributes are copied and validated', () => {
  const points = [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ],
    faces = [{ id: 'a', indices: [0, 1, 2], material: 0 }];
  const tangents: [number, number, number, number][] = [
    [1, 0, 0, 1],
    [1, 0, 0, 1],
    [1, 0, 0, 1],
  ];
  const geometry = new MeshGeometry(points, faces, [], { tangents });
  tangents[0]![0] = 9;
  assert.equal(geometry.tangents[0]![0], 1);
  assert.ok(Object.isFrozen(geometry.tangents[0]));
  assert.throws(
    () =>
      new MeshGeometry(points, faces, [], {
        tangents: [
          [1, 0, 0, 0],
          [1, 0, 0, 1],
          [1, 0, 0, 1],
        ],
      }),
    /tangent/,
  );
  assert.throws(
    () => new MeshGeometry(points, faces, [], { tangents: [[0, 0, 0, 1]] }),
    /tangent/,
  );
  assert.throws(
    () => new MeshGeometry(points, faces, [], { tangents: [[1, 0, 0, 1]] }),
    /counts/,
  );
  const normal = new TextureImage(1, 1, new Uint8Array([128, 128, 255, 255]), {
    colorSpace: 'linear',
  });
  const mesh = new Mesh3D(geometry, [
    { color: '#ffffff', normalTexture: { image: normal } },
  ]);
  assert.ok(Object.isFrozen(mesh.materials[0]!.normalTexture));
  assert.throws(
    () =>
      new Mesh3D(geometry, [
        { color: '#ffffff', normalTexture: { image: image() } },
      ]),
    /linear/,
  );
  assert.throws(
    () => new Mesh3D(geometry, [{ color: '#ffffff', normalScale: NaN }]),
    /normal scale/,
  );
});

void test('dynamic pixel revisions are explicit atomic snapshots with fixed descriptors and immutable bindings', () => {
  const bytes = new Uint8Array([10, 20, 30, 255]);
  const asset = new DynamicTextureImage(1, 1, bytes);
  bytes[0] = 200;
  assert.equal(asset.copyPixels()[0], 10);
  assert.equal(asset.revision, 0);
  const binding = textureBinding({ image: asset });
  assert.ok(Object.isFrozen(binding));
  assert.ok(Object.isFrozen(asset));
  const next = new Uint8Array([40, 50, 60, 255]);
  asset.update(next);
  next[0] = 200;
  assert.equal(asset.revision, 1);
  assert.deepEqual([...asset.copyPixels()], [40, 50, 60, 255]);
  const out = asset.copyPixels();
  out[0] = 0;
  assert.equal(asset.copyPixels()[0], 40);
  assert.throws(() => asset.update(new Uint8Array([1, 2, 3, 0])), /opaque/);
  assert.throws(() => asset.update(new Uint8Array(8)), /byte count/);
  assert.equal(asset.revision, 1);
  assert.equal(asset.copyPixels()[0], 40);
  assert.equal(binding.image, asset);
  assert.throws(
    () => new DynamicTextureImage(0, 1, new Uint8Array()),
    /dimensions/,
  );
});
void test('dynamic updates coalesce, reuse allocation, upload once across units and remain independent across contexts', () => {
  const a = fixture(),
    b = fixture(),
    first = new WebGLTextureStore(a.gl),
    second = new WebGLTextureStore(b.gl),
    asset = new DynamicTextureImage(1, 1, new Uint8Array([1, 2, 3, 255]));
  first.begin();
  first.bind({ image: asset });
  first.bind({ image: asset }, 1);
  first.end();
  second.begin();
  second.bind({ image: asset });
  second.end();
  asset.update(new Uint8Array([10, 20, 30, 255]));
  asset.update(new Uint8Array([40, 50, 60, 255]));
  first.begin();
  first.bind({ image: asset });
  first.bind({ image: asset }, 1);
  first.end();
  assert.equal(a.calls.filter((c) => c.name === 'texImage2D').length, 1);
  assert.equal(a.calls.filter((c) => c.name === 'texSubImage2D').length, 1);
  assert.deepEqual(
    [
      ...(a.calls.find((c) => c.name === 'texSubImage2D')!
        .args[8] as Uint8Array),
    ],
    [40, 50, 60, 255],
  );
  first.begin();
  first.bind({ image: asset });
  first.end();
  assert.equal(first.uploadStats.updates, 1);
  assert.equal(second.uploadStats.updates, 0);
  second.begin();
  second.bind({ image: asset });
  second.end();
  assert.equal(second.uploadStats.updates, 1);
  assert.deepEqual(first.uploadStats, {
    allocations: 1,
    updates: 1,
    sourceBytes: 8,
    mipmapBuilds: 2,
  });
  first.begin();
  first.end();
  assert.equal(a.textures.size, 0);
  asset.update(new Uint8Array([70, 80, 90, 255]));
  first.begin();
  first.bind({ image: asset });
  first.end();
  assert.equal(first.uploadStats.allocations, 2);
  assert.equal(first.uploadStats.updates, 1);
  first.dispose();
  second.dispose();
  assert.equal(a.textures.size, 0);
  assert.equal(b.textures.size, 0);
  const restored = new WebGLTextureStore(fixture().gl);
  restored.begin();
  restored.bind({ image: asset });
  restored.end();
  assert.equal(restored.uploadStats.allocations, 1);
  assert.equal(restored.uploadStats.updates, 0);
  restored.dispose();
});
void test('canvas snapshots validate size and sRGB before publishing; readback errors leave the source intact', () => {
  const asset = new DynamicTextureImage(1, 1, new Uint8Array([0, 0, 0, 255]));
  const context = {
    canvas: { width: 1, height: 1 },
    getImageData: () => ({ data: new Uint8ClampedArray([12, 34, 56, 255]) }),
  } as unknown as CanvasRenderingContext2D;
  updateTextureFromCanvas(asset, context);
  assert.equal(asset.revision, 1);
  assert.deepEqual([...asset.copyPixels()], [12, 34, 56, 255]);
  assert.throws(
    () =>
      updateTextureFromCanvas(asset, {
        ...context,
        canvas: { width: 2, height: 1 },
      } as unknown as CanvasRenderingContext2D),
    /dimensions/,
  );
  assert.throws(
    () =>
      updateTextureFromCanvas(
        new DynamicTextureImage(1, 1, new Uint8Array([0, 0, 0, 255]), {
          colorSpace: 'linear',
        }),
        context,
      ),
    /sRGB/,
  );
  const denied = {
    ...context,
    getImageData: () => {
      throw new Error('readback denied');
    },
  };
  assert.throws(() => updateTextureFromCanvas(asset, denied), /denied/);
  assert.equal(asset.revision, 1);
});

void test('failed dynamic upload retries the unseen revision without reallocating or advancing successful counters', () => {
  const f = fixture('update'),
    store = new WebGLTextureStore(f.gl),
    asset = new DynamicTextureImage(1, 1, new Uint8Array([1, 2, 3, 255]));
  store.begin();
  store.bind({ image: asset });
  store.end();
  asset.update(new Uint8Array([4, 5, 6, 255]));
  store.begin();
  assert.throws(() => store.bind({ image: asset }), /update failed/);
  store.end();
  assert.equal(store.uploadStats.updates, 0);
  store.begin();
  store.bind({ image: asset });
  store.end();
  assert.equal(store.uploadStats.updates, 1);
  assert.equal(store.uploadStats.allocations, 1);
  assert.equal(f.textures.size, 1);
  store.dispose();
  assert.equal(f.textures.size, 0);
});

void test('video frames upload directly, coalesce per source, avoid mipmaps and restore per context', async () => {
  const { VideoTextureImage } = await import('../src/3d/index.js');
  const source = {
    videoWidth: 512,
    videoHeight: 512,
    readyState: 2,
  } as HTMLVideoElement;
  const video = new VideoTextureImage(source);
  const binding = { image: video, filter: 'linear' as const };
  assert.throws(() => textureBinding({ image: video }), /filtering/);
  const a = fixture(),
    b = fixture();
  const first = new WebGLTextureStore(a.gl),
    second = new WebGLTextureStore(b.gl);
  first.begin();
  first.bind(binding);
  first.bind(binding, 1);
  first.end();
  assert.equal(first.uploadStats.allocations, 1);
  assert.equal(first.uploadStats.mipmapBuilds, 0);
  assert.equal(first.stats.textureBytes, 512 * 512 * 4);
  assert.equal(
    a.calls.find((c) => c.name === 'texImage2D')!.args.at(-1),
    source,
  );
  video.update();
  video.update();
  first.begin();
  first.bind(binding);
  first.bind(binding, 1);
  first.end();
  assert.equal(first.uploadStats.updates, 1);
  assert.equal(
    a.calls.find((c) => c.name === 'texSubImage2D')!.args.at(-1),
    source,
  );
  first.begin();
  first.bind(binding);
  first.end();
  assert.equal(first.uploadStats.updates, 1);
  second.begin();
  second.bind(binding);
  second.end();
  assert.equal(second.uploadStats.allocations, 1);
  const retry = fixture('update'),
    retryStore = new WebGLTextureStore(retry.gl);
  retryStore.begin();
  retryStore.bind(binding);
  retryStore.end();
  video.update();
  retryStore.begin();
  assert.throws(() => retryStore.bind(binding), /update failed/);
  retryStore.bind(binding);
  retryStore.end();
  assert.equal(retryStore.uploadStats.updates, 1);
  for (const store of [first, second, retryStore]) {
    store.begin();
    store.end();
    assert.equal(store.stats.textures, 0);
    store.dispose();
  }
  const mutable = source as unknown as {
    videoWidth: number;
    videoHeight: number;
    readyState: number;
  };
  mutable.readyState = 1;
  assert.throws(() => new VideoTextureImage(source), /decoded frame/);
  assert.throws(() => video.update(), /decoded frame/);
  mutable.readyState = 2;
  mutable.videoWidth = 0;
  assert.throws(() => new VideoTextureImage(source), /dimensions/);
  mutable.videoWidth = 1024;
  assert.throws(() => video.validate(), /dimensions/);
});

void test('display saturation and screen-door offsets validate and freeze at material boundaries', () => {
  const geometry = new MeshGeometry(
    [
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    ],
    [{ id: 'panel', indices: [0, 1, 2], material: 0 }],
  );
  const offset: [number, number] = [3, 4];
  const mesh = new Mesh3D(geometry, [
    {
      color: '#ffffff',
      saturation: 0.25,
      screenDoor: { repeat: [10, 10], fill: 0.8, offset },
    },
  ]);
  offset[0] = 9;
  assert.deepEqual(mesh.materials[0]!.screenDoor!.offset, [3, 4]);
  for (const saturation of [NaN, -1, 2])
    assert.throws(
      () => new Mesh3D(geometry, [{ color: '#ffffff', saturation }]),
      /saturation/,
    );
  assert.throws(
    () =>
      new Mesh3D(geometry, [
        {
          color: '#ffffff',
          screenDoor: { repeat: [10, 10], fill: 0.8, offset: [NaN, 0] },
        },
      ]),
    /coverage/,
  );
});
