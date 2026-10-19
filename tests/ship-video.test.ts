import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultVideo,
  migrateVideoStorage,
  readVideo,
  saveVideo,
  validateVideo,
  videoResolution,
  videoSurfaceScale,
} from '../games/ship/VideoSettings.js';

void test('Video caps device density before applying scale without changing logical viewport size', () => {
  const settings = { renderScale: 0.75, pixelDensityLimit: 2 };
  assert.equal(videoSurfaceScale(settings, 3), 0.5);
  assert.deepEqual(videoResolution(settings, 800, 600, 3), {
    width: 1200,
    height: 900,
  });
  assert.deepEqual(
    videoResolution({ renderScale: 1, pixelDensityLimit: 1 }, 800, 600, 3),
    { width: 800, height: 600 },
  );
  assert.equal(
    videoSurfaceScale({ renderScale: 1, pixelDensityLimit: 2 }, 1),
    1,
  );
  assert.deepEqual(
    videoResolution({ renderScale: 0.5, pixelDensityLimit: null }, 800, 600, 2),
    { width: 800, height: 600 },
  );
  assert.deepEqual(
    videoResolution({ renderScale: 1, pixelDensityLimit: null }, 800, 600, 2),
    { width: 1600, height: 1200 },
  );
});
void test('Video preferences round-trip independently of control settings, with detached defaults', () => {
  let saved: string | null = null;
  const store = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  assert.deepEqual(readVideo(store), defaultVideo());
  const value = {
    surfaceDetail: 'scalar-pbr' as const,
    showFps: true,
    renderScale: 0.6,
    pixelDensityLimit: null,
  };
  const applied = saveVideo(store, value);
  value.renderScale = 1;
  assert.deepEqual(readVideo(store), applied);
  assert.equal(readVideo(store).renderScale, 0.6);
});
void test('Video rejects invalid saved values and reports storage failures before applying', () => {
  for (const value of [
    null,
    {},
    { ...defaultVideo(), renderScale: NaN },
    { ...defaultVideo(), renderScale: 0 },
    { ...defaultVideo(), renderScale: 1.01 },
    { ...defaultVideo(), pixelDensityLimit: 0 },
    { ...defaultVideo(), pixelDensityLimit: '2' },
    { ...defaultVideo(), extra: true },
    { ...defaultVideo(), showFps: 1 },
    { ...defaultVideo(), surfaceDetail: 'diffuse' },
    { ...defaultVideo(), surfaceDetail: undefined },
  ])
    assert.throws(() => validateVideo(value));
  let writes = 0;
  assert.throws(() =>
    saveVideo(
      {
        setItem: () => {
          writes++;
        },
      },
      { renderScale: 4, pixelDensityLimit: 1 },
    ),
  );
  assert.equal(writes, 0);
  assert.throws(() => readVideo({ getItem: () => '{' }), SyntaxError);
  assert.throws(
    () =>
      saveVideo(
        {
          setItem: () => {
            throw new Error('Storage denied');
          },
        },
        defaultVideo(),
      ),
    /Storage denied/,
  );
  assert.throws(() => videoSurfaceScale(defaultVideo(), 0), /density/);
});

void test('All three player surface profiles persist, while diffuse is refused before storage writes', () => {
  for (const surfaceDetail of ['full', 'no-normal', 'scalar-pbr'] as const) {
    let saved: string | null = null;
    const storage = {
      getItem: () => saved,
      setItem: (_key: string, value: string) => {
        saved = value;
      },
    };
    saveVideo(storage, { ...defaultVideo(), surfaceDetail });
    assert.equal(readVideo(storage).surfaceDetail, surfaceDetail);
  }
  let writes = 0;
  assert.throws(
    () =>
      saveVideo(
        {
          setItem: () => {
            writes++;
          },
        },
        { ...defaultVideo(), surfaceDetail: 'diffuse' },
      ),
    /Invalid video/,
  );
  assert.equal(writes, 0);
});
void test('Resolution-only saved preferences migrate once to Full; the reader itself remains strict', () => {
  let saved = JSON.stringify({ renderScale: 0.75, pixelDensityLimit: 1.5 }),
    writes = 0;
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
      writes++;
    },
  };
  assert.throws(() => readVideo(storage), /Invalid video/);
  assert.equal(migrateVideoStorage(storage), true);
  assert.deepEqual(readVideo(storage), {
    surfaceDetail: 'full',
    showFps: false,
    renderScale: 0.75,
    pixelDensityLimit: 1.5,
  });
  assert.equal(migrateVideoStorage(storage), false);
  assert.equal(writes, 1);
  saved = JSON.stringify({ renderScale: 9, pixelDensityLimit: 1.5 });
  assert.throws(() => migrateVideoStorage(storage), /Invalid video/);
  assert.equal(writes, 1);
});

void test('Surface-detail preferences migrate to an FPS-off default without losing quality settings', () => {
  let saved = JSON.stringify({
    surfaceDetail: 'scalar-pbr',
    renderScale: 0.5,
    pixelDensityLimit: 1,
  });
  const storage = {
    getItem: () => saved,
    setItem: (_key: string, value: string) => {
      saved = value;
    },
  };
  assert.equal(migrateVideoStorage(storage), true);
  assert.deepEqual(readVideo(storage), {
    surfaceDetail: 'scalar-pbr',
    renderScale: 0.5,
    pixelDensityLimit: 1,
    showFps: false,
  });
  assert.equal(migrateVideoStorage(storage), false);
});
