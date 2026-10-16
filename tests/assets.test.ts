import test from 'node:test';
import assert from 'node:assert/strict';
import { Assets } from '../src/index.js';
import { deferred, imageBrowser } from './helpers/images.js';

void test('concurrent equivalent URLs share one load and distinct leases; last owner closes', async () => {
  const host = imageBrowser();
  const assets = new Assets();
  try {
    const [a, b] = await Promise.all([
      assets.acquireImage('./base.png'),
      assets.acquireImage('https://example.test/demo/base.png'),
    ]);
    assert.notEqual(a, b);
    assert.equal(a.image, b.image);
    assert.equal(host.loads, 1);
    assert.equal(host.decodes, 1);
    a.dispose();
    a.dispose();
    assert.equal(host.closes, 0);
    assert.throws(() => a.image, /released/);
    assert.equal(b.image, host.image);
    b.dispose();
    assert.equal(host.closes, 1);
    const fresh = await assets.acquireImage('./base.png');
    assert.equal(host.loads, 2);
    fresh.dispose();
  } finally {
    assets.dispose();
    host.restore();
  }
});

void test('HTTP and decode failures reject with causes and allow same-URL retry', async () => {
  let attempt = 0;
  const host = imageBrowser({
    fetch: () =>
      Promise.resolve(
        ++attempt === 1
          ? new Response(null, { status: 404 })
          : new Response(new Blob(['image'])),
      ),
    decode: () =>
      attempt === 2
        ? Promise.reject(new Error('Invalid image'))
        : Promise.resolve(host.image),
  });
  const assets = new Assets();
  try {
    for (const cause of ['HTTP 404', 'Invalid image']) {
      const requests = [
        assets.acquireImage('bad.png'),
        assets.acquireImage('bad.png'),
      ];
      for (const request of requests) {
        await assert.rejects(request, (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /Could not load image/);
          assert.ok(error.cause instanceof Error);
          assert.equal(error.cause.message, cause);
          return true;
        });
      }
    }
    const lease = await assets.acquireImage('bad.png');
    assert.equal(host.loads, 3);
    lease.dispose();
  } finally {
    assets.dispose();
    host.restore();
  }
});

void test('cancelling one pending caller leaves the other load alive', async () => {
  const loading = deferred<Response>();
  let sharedSignal: AbortSignal | null | undefined;
  const host = imageBrowser({
    fetch: (_url, options) => {
      sharedSignal = options?.signal;
      return loading.promise;
    },
  });
  const assets = new Assets();
  try {
    const controller = new AbortController();
    const cancelled = assets.acquireImage('base.png', {
      signal: controller.signal,
    });
    const other = assets.acquireImage('base.png');
    controller.abort(new Error('Caller cancelled'));
    await assert.rejects(cancelled, /Caller cancelled/);
    assert.equal(sharedSignal?.aborted, false);
    loading.resolve(new Response(new Blob(['image'])));
    const lease = await other;
    assert.equal(host.loads, 1);
    lease.dispose();
    assert.equal(host.closes, 1);
  } finally {
    assets.dispose();
    host.restore();
  }
});

void test('last caller cancellation closes a late decode and cannot evict its replacement', async () => {
  const decode = deferred<ImageBitmap>();
  let decodeStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    decodeStarted = resolve;
  });
  const host = imageBrowser({
    decode: () => {
      decodeStarted();
      return decode.promise;
    },
  });
  const assets = new Assets();
  try {
    const controller = new AbortController();
    const pending = assets.acquireImage('base.png', {
      signal: controller.signal,
    });
    await started;
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    const replacement = assets.acquireImage('base.png');
    decode.resolve(host.image);
    const lease = await replacement;
    assert.equal(host.loads, 2);
    assert.equal(host.closes, 1);
    const shared = await assets.acquireImage('base.png');
    assert.equal(host.loads, 2);
    shared.dispose();
    lease.dispose();
    assert.equal(host.closes, 2);
  } finally {
    assets.dispose();
    host.restore();
  }
});

void test('service disposal rejects pending requests even if fetch ignores cancellation', async () => {
  const loading = deferred<Response>();
  const host = imageBrowser({ fetch: () => loading.promise });
  const assets = new Assets();
  try {
    const pending = assets.acquireImage('base.png');
    assets.dispose();
    assets.dispose();
    await assert.rejects(pending, /Assets is disposed/);
    await assert.rejects(assets.acquireImage('base.png'), /disposed/);
    loading.resolve(new Response(new Blob(['image'])));
    // Let the uncancellable continuation settle and release its decoded result.
    await host.closed;
    assert.equal(host.closes, 1);
  } finally {
    host.restore();
  }
});

void test('service disposal invalidates delivered leases exactly once; pre-abort does no work', async () => {
  const host = imageBrowser();
  const assets = new Assets();
  try {
    const signal = AbortSignal.abort(new Error('Already cancelled'));
    await assert.rejects(
      assets.acquireImage('base.png', { signal }),
      /Already cancelled/,
    );
    assert.equal(host.loads, 0);
    const lease = await assets.acquireImage('base.png');
    assets.dispose();
    assets.dispose();
    assert.throws(() => lease.image, /released/);
    lease.dispose();
    assert.equal(host.closes, 1);
  } finally {
    assets.dispose();
    host.restore();
  }
});
