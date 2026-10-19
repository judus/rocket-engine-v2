import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TextureImage } from '../src/3d/TextureImage.js';
import {
  decodeTextureImage,
  loadTextureImage,
} from '../src/webgl/TextureLoader.js';
import { decodeTexturedGlb, loadTexturedGlb } from '../src/webgl/GlbLoader.js';
import { WebGLAssets } from '../src/webgl/WebGLAssets.js';
void test('texture pixel budgets are explicit, bounded and preserve immutable image validation', () => {
  const pixels = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]);
  assert.throws(
    () => new TextureImage(2, 1, pixels, { maxPixels: 1 }),
    /dimensions/,
  );
  const image = new TextureImage(2, 1, pixels, { maxPixels: 2 });
  assert.equal(image.width, 2);
  for (const maxPixels of [0, -1, 0.5, Infinity, 67108865])
    assert.throws(
      () => new TextureImage(2, 1, pixels, { maxPixels }),
      /pixel budget/,
    );
  assert.throws(
    () => new TextureImage(8192, 8192, new Uint8Array()),
    /dimensions/,
  );
});
void test('browser model decode budgets pass through isolated asset pools without changing defaults', async () => {
  const names = [
    'createImageBitmap',
    'OffscreenCanvas',
    'fetch',
    'document',
  ] as const;
  const descriptors = names.map(
    (name) =>
      [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
  );
  const source = await readFile(
    'examples/3d/assets/cockpit-forward-v4-materials.glb',
  );
  const bytes = source.buffer.slice(
    source.byteOffset,
    source.byteOffset + source.byteLength,
  );
  let opened = 0,
    closed = 0;
  let bitmapWidth = 2;
  let noContext = false,
    httpOk = true;
  class DecodeCanvas {
    constructor(
      readonly width: number,
      readonly height: number,
    ) {}
    getContext() {
      if (noContext) return null;
      return {
        drawImage() {},
        getImageData(_x: number, _y: number, width: number, height: number) {
          return { data: new Uint8ClampedArray(width * height * 4).fill(255) };
        },
      };
    }
  }
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: () => {
      opened++;
      return Promise.resolve({
        width: bitmapWidth,
        height: 2,
        close() {
          closed++;
        },
      });
    },
  });
  Object.defineProperty(globalThis, 'OffscreenCanvas', {
    configurable: true,
    value: DecodeCanvas,
  });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: () =>
      Promise.resolve({
        ok: httpOk,
        status: 404,
        blob: () => Promise.resolve(new Blob()),
        arrayBuffer: () => Promise.resolve(bytes),
      }),
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { baseURI: 'http://localhost/' },
  });
  try {
    await assert.rejects(
      decodeTextureImage(new Blob(), { maxPixels: 0 }),
      /pixel budget/,
    );
    await assert.rejects(
      decodeTextureImage(new Blob(), { maxPixels: 3 }),
      /exceeds pixel budget/,
    );
    assert.equal(
      (await decodeTextureImage(new Blob(), { maxPixels: 4 })).width,
      2,
    );
    for (const maxDimension of [0, -1, 0.5, Infinity, NaN])
      await assert.rejects(
        decodeTextureImage(new Blob(), { maxDimension }),
        /dimension limit/,
      );
    bitmapWidth = 8;
    const wide = await decodeTextureImage(new Blob(), { maxDimension: 4 });
    assert.equal(wide.width, 4);
    assert.equal(wide.height, 1);
    bitmapWidth = 2;
    const small = await decodeTextureImage(new Blob(), { maxDimension: 1 });
    assert.equal(small.width, 1);
    assert.equal(small.height, 1);
    const unchanged = await decodeTextureImage(new Blob(), {
      maxDimension: 4096,
    });
    assert.equal(unchanged.width, 2);
    assert.equal(unchanged.height, 2);
    await assert.rejects(
      decodeTextureImage(new Blob(), { maxDimension: 1, maxPixels: 3 }),
      /pixel budget/,
    );
    await assert.rejects(
      decodeTexturedGlb(bytes, { maxTotalPixels: 0 }),
      /total image pixel budget/,
    );
    await assert.rejects(
      decodeTexturedGlb(bytes, { maxTotalPixels: 1 }),
      /decoded image pixel budget/,
    );
    await decodeTextureImage(new Blob());
    noContext = true;
    await assert.rejects(
      decodeTextureImage(new Blob()),
      /canvas is unavailable/,
    );
    noContext = false;
    await loadTextureImage('/test.jpg');
    const signal = new AbortController().signal;
    await loadTextureImage('/test.jpg', { signal, colorSpace: 'linear' });
    await loadTexturedGlb('/test.glb');
    httpOk = false;
    await assert.rejects(
      loadTextureImage('/missing.jpg'),
      /Texture request failed/,
    );
    await assert.rejects(loadTexturedGlb('/missing.glb'), /GLB HTTP/);
    httpOk = true;
    await assert.rejects(
      decodeTexturedGlb(new ArrayBuffer(67108865)),
      /64 MiB/,
    );
    const jsonLength = new DataView(bytes).getUint32(12, true);
    const doc = JSON.parse(
      new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)),
    ) as { images: unknown[] };
    doc.images = new Array<unknown>(33).fill(doc.images[0]);
    const json = new TextEncoder().encode(JSON.stringify(doc)),
      padded = Math.ceil(json.length / 4) * 4;
    const binary = new Uint8Array(bytes, 28 + jsonLength);
    const packed = new ArrayBuffer(28 + padded + binary.length),
      view = new DataView(packed),
      raw = new Uint8Array(packed);
    view.setUint32(0, 0x46546c67, true);
    view.setUint32(4, 2, true);
    view.setUint32(8, packed.byteLength, true);
    view.setUint32(12, padded, true);
    view.setUint32(16, 0x4e4f534a, true);
    raw.fill(32, 20, 20 + padded);
    raw.set(json, 20);
    view.setUint32(20 + padded, binary.length, true);
    view.setUint32(24 + padded, 0x004e4942, true);
    raw.set(binary, 28 + padded);
    await assert.rejects(decodeTexturedGlb(packed), /32 image budget/);
    const fittedPool = new WebGLAssets({ maxTextureDimension: 1 });
    const defaultPool = new WebGLAssets(),
      restricted = new WebGLAssets({ maxImagePixels: 3, maxTexturePixels: 3 }),
      large = new WebGLAssets({
        maxImagePixels: 67108864,
        maxTotalPixels: 134217728,
        maxTexturePixels: 4,
      });
    try {
      await assert.rejects(
        restricted.acquireModel('/cockpit.glb'),
        /exceeds pixel budget/,
      );
      await assert.rejects(
        restricted.acquireTexture('/sky.png'),
        /exceeds pixel budget/,
      );
      await assert.rejects(
        restricted.acquireTexture('/sky-linear.png', { colorSpace: 'linear' }),
        /exceeds pixel budget/,
      );
      const fitted = await fittedPool.acquireTexture('/sky.png');
      assert.equal(fitted.value.width, 1);
      assert.equal(fitted.value.height, 1);
      fitted.dispose();
      const sky = await large.acquireTexture('/sky.png');
      const linearSky = await large.acquireTexture('/sky-linear.png', {
        colorSpace: 'linear',
      });
      const defaultSky = await defaultPool.acquireTexture('/default.png');
      assert.equal(sky.value.width, 2);
      assert.equal(sky.value.colorSpace, 'srgb');
      assert.equal(linearSky.value.colorSpace, 'linear');
      sky.dispose();
      linearSky.dispose();
      defaultSky.dispose();
      const normal = await defaultPool.acquireModel('/cockpit.glb');
      const big = await large.acquireModel('/cockpit.glb');
      assert.ok(normal.value.triangles > 0);
      assert.equal(big.value.triangles, normal.value.triangles);
      normal.dispose();
      big.dispose();
    } finally {
      fittedPool.dispose();
      defaultPool.dispose();
      restricted.dispose();
      large.dispose();
    }
    assert.equal(
      opened,
      closed,
      'each decoded bitmap closes on success and budget rejection',
    );
  } finally {
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});
