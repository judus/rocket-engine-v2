import test from 'node:test';
import assert from 'node:assert/strict';
import { WebGLSurface } from '../src/webgl/index.js';
import { AssetPool } from '../src/index.js';

void test('surface owns native generations, bounded DPR resizing and once-only cleanup without a loop', () => {
  const previous = new Map(
    ['document', 'window'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  let removed = false,
    creates = 0,
    releases = 0;
  class Canvas extends EventTarget {
    style = {};
    width = 1;
    height = 1;
    tabIndex = -1;
    setAttribute() {}
    remove() {
      removed = true;
    }
    getContext() {
      return gl;
    }
    getBoundingClientRect() {
      return { left: 10, top: 20, width: 400, height: 225 };
    }
  }
  const canvas = new Canvas();
  const gl = {
    MAX_VIEWPORT_DIMS: 1,
    MAX_RENDERBUFFER_SIZE: 2,
    MAX_TEXTURE_SIZE: 3,
    getParameter(p: number) {
      return p === 1 ? [1024, 1024] : 1024;
    },
    isContextLost() {
      return false;
    },
    getExtension() {
      return null;
    },
  };
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => canvas },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { devicePixelRatio: 2 },
  });
  try {
    const surface = new WebGLSurface({
      target: { clientWidth: 400, append() {} } as unknown as HTMLElement,
      scene: {},
    });
    const lease = surface.manage(() => {
      creates++;
      return {
        value: creates,
        dispose(): undefined {
          releases++;
        },
      };
    });
    surface.resize();
    assert.equal(canvas.width, 800);
    assert.equal(canvas.height, 450);
    surface.resize(2);
    assert.equal(canvas.width, 1024);
    assert.equal(surface.limited, true);
    assert.deepEqual(surface.clientToWorld({ x: 210, y: 132.5 }), {
      x: 200,
      y: 112.5,
    });
    canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    assert.equal(lease.current, null);
    assert.equal(releases, 1);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    assert.equal(lease.current, 2);
    surface.dispose();
    surface.dispose();
    lease.dispose();
    assert.equal(releases, 2);
    assert.equal(removed, true);
    canvas.dispatchEvent(new Event('webglcontextrestored'));
    assert.equal(creates, 2);
  } finally {
    for (const [key, descriptor] of previous)
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
  }
});

void test('generic CPU assets share acquisition and cancel only the released owner', async () => {
  let loads = 0,
    releases = 0;
  let resolve!: (value: { id: number }) => void;
  const pool = new AssetPool(
    () => {
      loads++;
      return new Promise<{ id: number }>((done) => {
        resolve = done;
      });
    },
    () => {
      releases++;
    },
  );
  const cancel = new AbortController();
  const first = pool.acquire('model', { signal: cancel.signal });
  const second = pool.acquire('model');
  const failed = assert.rejects(first);
  cancel.abort();
  resolve({ id: 1 });
  await failed;
  const lease = await second;
  assert.equal(loads, 1);
  assert.equal(lease.value.id, 1);
  lease.dispose();
  assert.equal(releases, 1);
  pool.dispose();
  assert.throws(() => lease.value, /released/);
});
