import test from 'node:test';
import { TerrainRasterCache } from '../examples/terrain/TerrainRasterCache.js';
import { TerrainGenerator } from '../examples/terrain/TerrainGenerator.js';
import { ChunkStream, MemoryEdits } from '../examples/streaming/ChunkStream.js';
import { Scene2D, Node2D } from '../src/index.js';
import assert from 'node:assert/strict';
import { TileBoard } from '../examples/TileBoard.js';
import { TileRegionCache } from '../examples/TileRegionCache.js';

function fixture() {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const canvases: { width: number; height: number }[] = [];
  let paints = 0;
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement() {
        const canvas = {
          width: 0,
          height: 0,
          getContext() {
            return {
              fillStyle: '',
              fillRect() {
                paints++;
              },
            };
          },
        };
        canvases.push(canvas);
        return canvas;
      },
    },
  });
  const copies: CanvasImageSource[] = [];
  const view = (x: number, y: number, width = 256, height = 256, ratio = 1) =>
    ({
      canvas: { width: width * ratio, height: height * ratio },
      getTransform() {
        return { a: ratio, b: 0, c: 0, d: ratio, e: -x * ratio, f: -y * ratio };
      },
      drawImage(image: CanvasImageSource) {
        copies.push(image);
      },
    }) as unknown as CanvasRenderingContext2D;
  return {
    canvases,
    copies,
    view,
    get paints() {
      return paints;
    },
    restore() {
      if (saved) Object.defineProperty(globalThis, 'document', saved);
      else Reflect.deleteProperty(globalThis, 'document');
    },
  };
}

void test('two cameras share artwork; stable frames and DPR changes reuse it; outside demand allocates nothing', () => {
  const host = fixture();
  const board = new TileBoard({ width: 128, height: 80 });
  const cache = new TileRegionCache(board);
  try {
    cache.draw(host.view(-256, -256));
    assert.equal(cache.stats.builds, 1);
    const painted = host.paints;
    cache.draw(host.view(-256, -256, 256, 256, 2));
    assert.equal(host.copies[0], host.copies[1]);
    assert.equal(cache.stats.builds, 1);
    assert.equal(host.paints, painted);
    cache.draw(host.view(-240, -240, 200, 200));
    assert.equal(cache.stats.builds, 1);
    cache.draw(host.view(10000, 10000));
    assert.equal(cache.stats.regions, 1);
    assert.equal(host.copies.length, 3);
  } finally {
    cache.dispose();
    host.restore();
  }
});

void test('edits invalidate only their retained region; origin and region boundary edits are distinct', () => {
  const host = fixture();
  const board = new TileBoard({ width: 128, height: 80 });
  const cache = new TileRegionCache(board);
  const view = host.view(-256, -256, 512, 512);
  try {
    cache.draw(view);
    assert.equal(cache.stats.builds, 4);
    for (const cell of [
      { x: -1, y: -1 },
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: 0, y: 0 },
    ]) {
      const before: number = cache.stats.builds;
      board.cycle(cell);
      cache.draw(view);
      cache.draw(view);
      assert.equal(cache.stats.builds, before + 1);
    }
    board.cycle({ x: 20, y: 20 }); // Unseen edit: no invalidation of visible art.
    cache.draw(view);
    assert.equal(cache.stats.builds, 8);
    cache.draw(host.view(512, 512));
    assert.equal(cache.stats.builds, 9);
    assert.equal(board.get({ x: 20, y: 20 }), 1);
  } finally {
    cache.dispose();
    host.restore();
  }
});

void test('LRU capacity releases pixels before replacement; revisiting rebuilds, disposing is final and idempotent', () => {
  const host = fixture();
  const board = new TileBoard({ width: 128, height: 80 });
  const cache = new TileRegionCache(board, { maxRegions: 2 });
  try {
    cache.draw(host.view(0, 0));
    cache.draw(host.view(256, 0));
    cache.draw(host.view(0, 0)); // Refresh region zero; region one is now oldest.
    cache.draw(host.view(512, 0));
    assert.equal(cache.stats.regions, 2);
    assert.equal(cache.stats.pixelBytes, 2 * 256 * 256 * 4);
    assert.equal(cache.stats.evictions, 1);
    assert.equal(host.canvases[1]?.width, 0);
    assert.equal(host.canvases[0]?.width, 256);
    board.cycle({ x: 8, y: 0 });
    cache.draw(host.view(256, 0));
    assert.equal(cache.stats.builds, 4);
    cache.dispose();
    cache.dispose();
    assert.equal(cache.stats.pixelBytes, 0);
    assert.equal(cache.stats.regions, 0);
    assert.ok(
      host.canvases.every(
        (canvas) => canvas.width === 0 && canvas.height === 0,
      ),
    );
    assert.equal(board.get({ x: 8, y: 0 }), 1);
    assert.throws(() => cache.draw(host.view(0, 0)), /disposed/);
  } finally {
    cache.dispose();
    host.restore();
  }
});

void test('rotated/scaled node transforms use conservative local bounds and singular transforms draw nothing', () => {
  const host = fixture();
  const cache = new TileRegionCache(new TileBoard({ width: 128, height: 80 }));
  try {
    const view = host.view(0, 0);
    Object.assign(view, {
      getTransform: () => ({ a: 0, b: 2, c: -2, d: 0, e: 0, f: 0 }),
    });
    cache.draw(view);
    assert.equal(cache.stats.regions, 1);
    const count = host.copies.length;
    Object.assign(view, {
      getTransform: () => ({ a: 0, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    });
    cache.draw(view);
    assert.equal(host.copies.length, count);
  } finally {
    cache.dispose();
    host.restore();
  }
});

void test('scene cleanup releases cached canvases even when subtree cleanup fails', () => {
  const host = fixture();
  const cache = new TileRegionCache(new TileBoard());
  const scene = new Scene2D();
  scene.own(cache);
  scene.root.add(new Node2D()).attach({
    dispose() {
      throw new Error('Broken behavior cleanup');
    },
  });
  try {
    cache.draw(host.view(-256, -160, 512, 320));
    assert.ok(cache.stats.regions > 0);
    assert.throws(() => scene.dispose(), AggregateError);
    assert.equal(cache.stats.pixelBytes, 0);
    assert.ok(
      host.canvases.every(
        (canvas) => canvas.width === 0 && canvas.height === 0,
      ),
    );
    scene.dispose();
  } finally {
    cache.dispose();
    host.restore();
  }
});

void test('procedural biome/elevation share bounded artwork; edits rebuild only biome and eviction/disposal release pixels', () => {
  const host = fixture(),
    generator = new TerrainGenerator({ seed: 42 });
  const edits = new MemoryEdits(
    (cell) => generator.sample(cell.x, cell.y).biome,
    6,
  );
  const stream = new ChunkStream(edits, 2, 0);
  const cache = new TerrainRasterCache(stream, generator);
  const area = { minX: -8, minY: -8, maxX: 0, maxY: 0 };
  try {
    stream.demand(area);
    stream.advance(1);
    cache.draw(host.view(0, 0), area, 'biome');
    cache.draw(host.view(0, 0), area, 'height');
    assert.equal(host.canvases.length, 2);
    assert.equal(cache.stats.regions, 1);
    const paints = host.paints,
      heightImage = host.copies.at(-1);
    cache.draw(host.view(0, 0), area, 'biome');
    cache.draw(host.view(0, 0), area, 'height');
    assert.equal(host.paints, paints);
    stream.cycle({ x: -1, y: -1 });
    cache.draw(host.view(0, 0), area, 'biome');
    cache.draw(host.view(0, 0), area, 'height');
    assert.equal(host.paints, paints + 64);
    assert.equal(host.copies.at(-1), heightImage);
    assert.equal(cache.stats.builds, 2);
    stream.demand({ minX: 80, minY: 80, maxX: 88, maxY: 88 });
    cache.prune();
    assert.equal(cache.stats.regions, 0);
    assert.ok(host.canvases.every((canvas) => canvas.width === 0));
    stream.advance(1);
    cache.draw(
      host.view(0, 0),
      { minX: 80, minY: 80, maxX: 88, maxY: 88 },
      'height',
    );
    cache.dispose();
    cache.dispose();
    assert.equal(cache.stats.pixelBytes, 0);
    assert.equal(edits.stats.cells, 1);
    assert.ok(host.canvases.every((canvas) => canvas.width === 0));
  } finally {
    cache.dispose();
    stream.dispose();
    host.restore();
  }
});
