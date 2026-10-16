import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ChunkStream,
  MemoryEdits,
  chunkSize,
} from '../examples/streaming/ChunkStream.js';
import { TerrainGenerator } from '../examples/terrain/TerrainGenerator.js';
import {
  StreamedClassicCache,
  classicTier,
  classicDemand,
  type ClassicObject,
} from '../examples/terrain/StreamedClassicCache.js';
import {
  factoryArtworkBounds,
  factoryChunkCapacity,
  factoryCanvasWidth,
  factoryCanvasHeight,
} from '../examples/workshop/TerrainViewport.js';
function fixture(capacity = 64) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const canvases: { width: number; height: number }[] = [];
  const ctx = {
    fillStyle: '',
    fillRect() {},
    drawImage() {},
  } as unknown as CanvasRenderingContext2D;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement() {
        const canvas = {
          width: 0,
          height: 0,
          getContext() {
            return ctx;
          },
        };
        canvases.push(canvas);
        return canvas;
      },
    },
  });
  const generator = new TerrainGenerator({ seed: 42 });
  const edits = new MemoryEdits(
    (cell) => generator.sample(cell.x, cell.y).biome,
    6,
  );
  const stream = new ChunkStream(edits, capacity, 1);
  const image = {} as ImageBitmap;
  const cache = new StreamedClassicCache(stream, generator, image, image);
  return {
    cache,
    stream,
    edits,
    canvases,
    ctx,
    generator,
    restore() {
      cache.dispose();
      stream.dispose();
      if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
      else Reflect.deleteProperty(globalThis, 'document');
    },
  };
}
const bounds = { minX: 0, minY: 0, maxX: 16, maxY: 8 };
void test('classic draw culls external objects by overhang bounds and preserves depth order', () => {
  const f = fixture();
  try {
    const drawn: string[] = [];
    const object = (id: string, x: number, feetY: number): ClassicObject => ({
      id,
      x,
      feetY,
      bounds: { minX: x - 30, maxX: x + 30, minY: feetY - 62, maxY: feetY },
      draw() {
        drawn.push(id);
      },
    });
    const view = { minX: -8, minY: -8, maxX: 0, maxY: 0 };
    f.cache.draw(f.ctx, view, [
      object('roof-overlap', -30, 50),
      object('left-touch', -158, -50),
      object('right-touch', 30, -50),
      object('above', -30, -128),
      object('far', 1000, 1000),
      object('near', -30, -50),
      object('tie-b', -30, -50),
      object('tie-a', -30, -50),
    ]);
    assert.deepEqual(drawn, ['near', 'tie-a', 'tie-b', 'roof-overlap']);
    assert.equal(f.cache.drawStats.objects, 4);
  } finally {
    f.restore();
  }
});
void test('decoration chunk queries skip prefetch records without losing sprites crossing a chunk edge', () => {
  const f = fixture(factoryChunkCapacity);
  try {
    const warmed = factoryArtworkBounds({
      minX: -8,
      minY: -8,
      maxX: 32,
      maxY: 16,
    });
    f.stream.demand(classicDemand(warmed));
    for (let i = 0; i < 100; i++) f.stream.advance(2);
    for (let i = 0; i < 30; i++) f.cache.prepare(warmed, 16);
    const calls: number[][] = [];
    f.ctx.drawImage = (...args: unknown[]) => {
      if (args.length === 9) calls.push(args.slice(5).map(Number));
    };
    f.cache.draw(f.ctx, { minX: -64, minY: -64, maxX: 64, maxY: 64 });
    const all = [...calls];
    const crossing = all.find(([x, y, w, h]) => {
      assert.ok(
        x !== undefined &&
          y !== undefined &&
          w !== undefined &&
          h !== undefined,
      );
      const edge = Math.floor((y + h - 1) / 128) * 128;
      return y < edge && y + h > edge;
    });
    assert.ok(crossing, 'fixture must contain a sprite spanning a chunk edge');
    const edge = Math.floor((crossing[1]! + crossing[3]! - 1) / 128) * 128;
    const view = { minX: -64, maxX: 64, minY: edge / 16 - 1, maxY: edge / 16 };
    const expected = all.filter(
      ([x, y, w, h]) =>
        x! + w! > view.minX * 16 &&
        x! < view.maxX * 16 &&
        y! + h! > view.minY * 16 &&
        y! < view.maxY * 16,
    );
    calls.length = 0;
    f.cache.draw(f.ctx, view);
    assert.deepEqual(calls, expected);
    assert.ok(
      calls.some((call) => call.every((value, i) => value === crossing[i])),
    );
    assert.ok(f.cache.drawStats.queriedRegions < f.cache.stats.regions);
    assert.ok(f.cache.drawStats.scannedRecords < f.cache.stats.records);
    f.cache.dispose();
    assert.equal(f.cache.drawStats.objects, 0);
  } finally {
    f.restore();
  }
});
void test('factory artwork is ready before the camera crosses a northern chunk boundary', () => {
  const f = fixture(factoryChunkCapacity);
  try {
    const home = { minX: -8, minY: -8, maxX: 72, maxY: 37 };
    f.stream.demand(classicDemand(factoryArtworkBounds(home)));
    for (let i = 0; i < 160; i++) f.stream.advance(2);
    for (let i = 0; i < 100; i++)
      f.cache.prepare(factoryArtworkBounds(home), 2);
    const builds = f.cache.stats.builds;
    const north = { ...home, minY: -9, maxY: 36 };
    f.stream.demand(classicDemand(factoryArtworkBounds(north)));
    // Newly demanded outer dependencies have not loaded yet. Visible artwork
    // must already exist, rather than requiring a build on this frame.
    f.cache.prepare(factoryArtworkBounds(north), 0);
    for (let y = north.minY; y < north.maxY; y++)
      for (let x = north.minX; x < north.maxX; x++)
        assert.equal(f.cache.ready({ x, y }), true, `${x},${y}`);
    assert.equal(f.cache.stats.builds, builds);
    f.cache.dispose();
    assert.equal(f.cache.stats.regions, 0);
  } finally {
    f.restore();
  }
});
void test('factory zoom, prefetch and dependency rings fit the chunk cap at every camera alignment', () => {
  const stream = new ChunkStream(new MemoryEdits(), factoryChunkCapacity, 1);
  try {
    for (const zoom of [0.75, 0.8, 0.99, 1, 1.001, 1.5, 2, 4])
      for (let y = -8; y < 0; y++)
        for (let x = -8; x < 0; x++) {
          const visible = {
            minX: x,
            minY: y,
            maxX: x + Math.ceil(factoryCanvasWidth / (16 * zoom)) + 1,
            maxY: y + Math.ceil(factoryCanvasHeight / (16 * zoom)) + 1,
          };
          stream.demand(classicDemand(factoryArtworkBounds(visible, zoom)));
          assert.ok(stream.stats.retained <= factoryChunkCapacity);
          assert.notEqual(
            stream.read({ x: visible.minX, y: visible.minY }).state,
            'missing',
          );
          assert.notEqual(
            stream.read({ x: visible.maxX - 1, y: visible.maxY - 1 }).state,
            'missing',
          );
        }
  } finally {
    stream.dispose();
  }
});
void test('classic biome overrides use explicit tiers; removing an override restores the generated tier', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5].map((value) => classicTier(8, value)),
    [2, 3, 5, 6, 10, 11],
  );
  assert.equal(classicTier(8, undefined), 8);
  assert.throws(() => classicTier(0, 6), RangeError);
});
void test('classic artwork waits for ready halos, obeys build budget and reuses stable frames', () => {
  const f = fixture();
  try {
    f.stream.demand(classicDemand(bounds));
    f.cache.prepare(bounds, 2);
    assert.equal(f.cache.stats.regions, 0);
    for (let i = 0; i < 30; i++) f.stream.advance(2);
    f.cache.prepare(bounds, 2);
    assert.equal(f.cache.stats.builds, 2);
    for (let i = 0; i < 10; i++) f.cache.prepare(bounds, 2);
    const before = f.cache.stats;
    f.cache.prepare(bounds, 2);
    f.cache.draw(f.ctx, bounds);
    assert.deepEqual(f.cache.stats, before);
    assert.ok(before.regions > 0);
    f.stream.demand({ minX: 1000, minY: 1000, maxX: 1016, maxY: 1008 });
    f.cache.prepare(bounds);
    assert.equal(f.cache.stats.regions, 0);
    assert.ok(f.canvases.every((c) => c.width === 0));
  } finally {
    f.restore();
  }
});
void test('an edit on a chunk boundary invalidates both neighbors and their decorations without repainting unrelated regions', () => {
  const f = fixture();
  try {
    f.stream.demand(classicDemand(bounds));
    for (let i = 0; i < 30; i++) f.stream.advance(2);
    for (let i = 0; i < 10; i++) f.cache.prepare(bounds, 16);
    const before = f.cache.stats,
      canvases = [...f.canvases];
    const cell = { x: chunkSize - 1, y: 3 },
      base = f.generator.sample(cell.x, cell.y).biome;
    f.edits.set(cell, base === 5 ? 0 : 5);
    f.cache.prepare(bounds, 0);
    assert.equal(f.cache.stats.invalidations - before.invalidations, 2);
    assert.equal(canvases.filter((c) => c.width === 0).length, 2);
    f.cache.prepare(bounds, 2);
    assert.equal(f.cache.stats.builds - before.builds, 2);
    f.edits.set(cell, base);
    f.cache.prepare(bounds, 2);
    assert.equal(f.cache.stats.builds - before.builds, 4);
    f.cache.dispose();
    assert.equal(f.cache.stats.regions, 0);
    assert.equal(f.cache.stats.records, 0);
    assert.ok(f.canvases.every((c) => c.width === 0));
  } finally {
    f.restore();
  }
});

void test('classic preparation stops starting builds after its soft time budget', () => {
  const f = fixture();
  const descriptor = Object.getOwnPropertyDescriptor(performance, 'now');
  let cpuMs = 0;
  Object.defineProperty(performance, 'now', {
    configurable: true,
    value: () => cpuMs,
  });
  f.ctx.fillRect = () => {
    cpuMs += 0.1;
  };
  try {
    f.stream.demand(classicDemand(bounds));
    for (let i = 0; i < 30; i++) f.stream.advance(2);
    f.cache.prepare(bounds, 4, 3);
    assert.equal(f.cache.stats.builds, 1);
    assert.ok(f.cache.stats.lastMs > 3);
    assert.throws(() => f.cache.prepare(bounds, 4, 0), RangeError);
  } finally {
    if (descriptor) Object.defineProperty(performance, 'now', descriptor);
    else Reflect.deleteProperty(performance, 'now');
    f.restore();
  }
});

void test('decoration pick membership is retained with ready artwork and released on eviction/disposal', () => {
  const f = fixture();
  try {
    const home = { minX: -8, minY: -8, maxX: 16, maxY: 16 };
    f.stream.demand(classicDemand(home));
    for (let i = 0; i < 80; i++) {
      f.stream.advance(4);
      f.cache.prepare(home, 16);
    }
    assert.ok(f.cache.stats.pickableObjects > 0);
    let found:
      ReturnType<StreamedClassicCache['candidates']>[number] | undefined;
    for (let y = -256; y <= 384 && !found; y += 8)
      for (let x = -256; x <= 384 && !found; x += 8)
        found = f.cache.candidates({ x, y })[0];
    assert.ok(found);
    const p = {
      x: (found.bounds.minX + found.bounds.maxX) / 2,
      y: (found.bounds.minY + found.bounds.maxY) / 2,
    };
    assert.ok(f.cache.candidates(p).some((e) => e.id === found.id));
    const far = { minX: 1000, minY: -1000, maxX: 1024, maxY: -976 };
    f.stream.demand(classicDemand(far));
    f.cache.prepare(far, 0);
    assert.equal(f.cache.candidates(p).length, 0);
    assert.equal(f.cache.stats.pickableObjects, 0);
    f.cache.dispose();
    assert.equal(f.cache.stats.pickableObjects, 0);
    assert.throws(() => f.cache.candidates(p), /disposed/);
  } finally {
    f.restore();
  }
});
