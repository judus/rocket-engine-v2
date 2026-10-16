import test from 'node:test';
import assert from 'node:assert/strict';
import { WebGLGpuTimer } from '../src/webgl/index.js';

function fixture(supported = true) {
  let available = false,
    disjoint = false,
    lost = false,
    reads = 0,
    deleted = 0;
  const gl = {
    QUERY_RESULT_AVAILABLE: 1,
    QUERY_RESULT: 2,
    getExtension: () =>
      supported ? { TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 } : null,
    isContextLost: () => lost,
    getParameter: () => disjoint,
    createQuery: () => ({}),
    beginQuery: () => {},
    endQuery: () => {},
    deleteQuery: () => {
      deleted++;
    },
    getQueryParameter: (_query: unknown, parameter: number) => {
      if (parameter === 1) return available;
      reads++;
      return 2_000_000;
    },
  } as unknown as WebGL2RenderingContext;
  return {
    timer: new WebGLGpuTimer(gl),
    ready: () => {
      available = true;
    },
    disjoint: () => {
      disjoint = true;
    },
    lose: () => {
      lost = true;
    },
    counts: () => ({ reads, deleted }),
  };
}

void test('GPU timer bounds pending queries and reads results only when available', () => {
  const f = fixture();
  for (let i = 0; i < 4; i++) {
    assert.equal(f.timer.begin(), true);
    assert.equal(f.timer.begin(), false);
    f.timer.end();
  }
  assert.equal(f.timer.begin(), false);
  f.timer.poll();
  assert.equal(f.counts().reads, 0);
  assert.equal(f.timer.stats.averageMs, null);
  f.ready();
  f.timer.poll();
  assert.equal(f.timer.stats.averageMs, 2);
  assert.equal(f.timer.stats.maxMs, 2);
  assert.equal(f.timer.stats.samples, 4);
  assert.deepEqual(f.counts(), { reads: 4, deleted: 4 });
  f.timer.dispose();
});

void test('GPU timer invalidates disjoint results and disposes active and queued resources once', () => {
  const f = fixture();
  f.timer.begin();
  f.timer.end();
  f.ready();
  f.timer.poll();
  f.timer.begin();
  f.timer.end();
  f.timer.begin();
  f.disjoint();
  f.timer.poll();
  assert.equal(f.timer.stats.status, 'disjoint');
  assert.equal(f.timer.stats.averageMs, null);
  assert.deepEqual(f.counts(), { reads: 1, deleted: 3 });
  f.timer.dispose();
  f.timer.dispose();
  assert.equal(f.timer.begin(), false);
  assert.equal(f.counts().deleted, 3);
});

void test('GPU timer reports unsupported and context loss without fabricated timing', () => {
  const unsupported = fixture(false);
  assert.equal(unsupported.timer.stats.status, 'unsupported');
  assert.equal(unsupported.timer.begin(), false);
  unsupported.timer.poll();
  unsupported.timer.dispose();
  const f = fixture();
  f.timer.begin();
  f.timer.end();
  f.lose();
  f.timer.poll();
  assert.equal(f.timer.stats.status, 'lost');
  assert.equal(f.timer.stats.samples, 0);
  assert.equal(f.timer.begin(), false);
  assert.equal(f.counts().reads, 0);
  assert.equal(f.counts().deleted, 1);
});
