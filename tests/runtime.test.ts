import { StreamedWalker } from '../examples/navigation/StreamedWalker.js';
import { WorkplaceOperator } from '../examples/workshop/WorkplaceOperator.js';
import {
  GridTraversal,
  GridNavigator,
  Movement,
} from '../src/navigation/index.js';
import { FactoryDemo } from '../examples/workshop/FactoryDemo.js';
import test from 'node:test';
import { ChunkStream, MemoryEdits } from '../examples/streaming/ChunkStream.js';
import { PhysicsWorld } from '../src/physics/matter.js';
import { imageBrowser } from './helpers/images.js';
import assert from 'node:assert/strict';
import type {
  Frame,
  PerformanceStats,
  Scene,
  FixedFrame,
} from '../src/index.js';
import type { Matrix2D } from '../src/types.js';
import type { View } from '../src/View.js';
import { Rocket, Scene2D, Node2D, Assets } from '../src/index.js';

interface FakeContext {
  transforms: Matrix2D[];
  readonly currentTransform: Matrix2D;
  readonly path: [number, number][];
  fillStyle: string;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  setTransform(...args: Matrix2D): void;
  transform(...args: Matrix2D): void;
  clearRect(): void;
  save(): void;
  restore(): void;
}
interface FakeCanvas {
  style: Record<string, string>;
  width: number;
  height: number;
  removed: boolean;
  getContext(): FakeContext;
  remove(): void;
  getBoundingClientRect(): {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}
// The fixture deliberately implements only the browser surface under test.
// Assertions stay typed; casts are confined to the fake/real DOM boundary.
function context(canvas: HTMLCanvasElement): FakeContext {
  return (canvas as unknown as FakeCanvas).getContext();
}
function drawingContext(ctx: CanvasRenderingContext2D): FakeContext {
  return ctx as unknown as FakeContext;
}
function wasRemoved(canvas: HTMLCanvasElement): boolean {
  return (canvas as unknown as FakeCanvas).removed;
}
function failure(errors: unknown[]): Error {
  assert.ok(errors[0] instanceof Error);
  return errors[0];
}
function stats(app: Rocket): PerformanceStats {
  const value = app.performance;
  assert.ok(value);
  return value;
}

function browser() {
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const frames = new Map<number, FrameRequestCallback>();
  const listeners = new Set<() => void>();
  const canvases: FakeCanvas[] = [];
  let nextId = 0;
  let cpuMs = 0;
  const document = {
    hidden: false,
    addEventListener(_type: string, fn: () => void) {
      listeners.add(fn);
    },
    removeEventListener(_type: string, fn: () => void) {
      listeners.delete(fn);
    },
    createElement() {
      let style = 'black';
      let matrix: Matrix2D = [1, 0, 0, 1, 0, 0];
      const stack: { style: string; matrix: Matrix2D }[] = [];
      const transforms: Matrix2D[] = [];
      let path: [number, number][] = [];
      const ctx: FakeContext = {
        transforms,
        beginPath() {
          path = [];
        },
        moveTo(x: number, y: number) {
          path.push([x, y]);
        },
        get path() {
          return [...path];
        },
        setTransform(...args: Matrix2D) {
          transforms.push(args);
          matrix = args;
        },
        get currentTransform(): Matrix2D {
          return [...matrix];
        },
        transform(
          a: number,
          b: number,
          c: number,
          d: number,
          e: number,
          f: number,
        ) {
          const [A, B, C, D, E, F] = matrix;
          matrix = [
            A * a + C * b,
            B * a + D * b,
            A * c + C * d,
            B * c + D * d,
            A * e + C * f + E,
            B * e + D * f + F,
          ];
        },
        clearRect() {},
        save() {
          stack.push({ style, matrix: [...matrix] });
        },
        restore() {
          ({ style, matrix } = stack.pop()!);
        },
        get fillStyle() {
          return style;
        },
        set fillStyle(value: string) {
          style = value;
        },
      };
      const canvas: FakeCanvas = {
        style: {},
        width: 0,
        height: 0,
        removed: false,
        getContext() {
          return ctx;
        },
        remove() {
          this.removed = true;
        },
        getBoundingClientRect() {
          return { left: 10, top: 20, width: 300, height: 200 };
        },
      };
      canvases.push(canvas);
      return canvas;
    },
  };
  for (const [key, value] of Object.entries({
    document,
    performance: {
      now() {
        return cpuMs;
      },
    },
    devicePixelRatio: 2,
    requestAnimationFrame(fn: FrameRequestCallback) {
      const id = nextId++;
      frames.set(id, fn);
      return id;
    },
    cancelAnimationFrame(id: number) {
      frames.delete(id);
    },
  })) {
    saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }
  return {
    document,
    frames,
    listeners,
    canvases,
    work(ms: number) {
      cpuMs += ms;
    },
    target: {
      ownerDocument: document,
      appendChild() {},
    } as unknown as HTMLElement,
    frame(now: number) {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const fn of callbacks) fn(now);
    },
    restore() {
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    },
  };
}

async function withBrowser(
  run: (host: ReturnType<typeof browser>) => void | Promise<void>,
) {
  const host = browser();
  try {
    await run(host);
  } finally {
    host.restore();
  }
}

void test('two views update one scene once; independent cameras and screen overlays', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    const dts: number[] = [],
      draws: number[] = [],
      overlays: string[] = [];
    const scene = app.scene({
      x: 0,
      update(dt) {
        dts.push(dt);
        this.x += 100 * dt;
      },
      draw(ctx) {
        draws.push(this.x);
        ctx.fillStyle = 'red';
      },
    });
    const first = app.view({
      target: host.target,
      scene,
      overlay(ctx) {
        overlays.push(String(ctx.fillStyle));
      },
    });
    const second = app.view({ target: host.target, scene });
    second.camera.x = -20;
    second.camera.zoom = 2;
    await app.start();
    host.frame(0);
    host.frame(1000);
    assert.deepEqual(dts, [0, 1]);
    assert.deepEqual(draws, [0, 0, 100, 100]);
    assert.deepEqual(overlays, ['black', 'black']);
    assert.ok(context(first.canvas).transforms.some((t) => t[0] === 2));
    assert.ok(
      context(second.canvas).transforms.some((t) => t[0] === 4 && t[4] === 80),
    );
    await app.dispose();
  }));

void test('animation displacement is identical at 60 and 144 Hz', () =>
  withBrowser(async (host) => {
    for (const hz of [60, 144]) {
      const app = new Rocket();
      const scene = app.scene({
        x: 0,
        update(dt) {
          this.x += 90 * dt;
        },
      });
      app.view({ target: host.target, scene });
      await app.start();
      for (let i = 0; i <= hz; i++) host.frame((i * 1000) / hz);
      assert.ok(Math.abs(scene.x - 90) < 1e-9);
      await app.dispose();
    }
  }));

void test('start is idempotent; stop cancels frame ID zero; resume excludes stopped time', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    const frames: Frame[] = [];
    const scene = app.scene({
      update(_dt, frame) {
        frames.push(frame);
      },
    });
    app.view({ target: host.target, scene });
    const first = app.start();
    assert.equal(app.start(), first);
    await first;
    assert.equal(host.frames.size, 1);
    app.stop();
    assert.equal(host.frames.size, 0);
    await app.start();
    host.frame(1000);
    host.frame(1500);
    app.stop();
    await app.start();
    host.frame(5000);
    host.frame(5500);
    assert.deepEqual(
      frames.map((f) => f.dt),
      [0, 0.5, 0, 0.5],
    );
    assert.equal(frames.at(-1)!.time, 1);
    await app.dispose();
  }));

void test('hidden tabs pause and resume without accounting hidden elapsed time', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    const dts: number[] = [];
    const scene = app.scene({
      update(dt) {
        dts.push(dt);
      },
    });
    app.view({ target: host.target, scene });
    await app.start();
    host.frame(0);
    host.frame(100);
    host.document.hidden = true;
    host.frame(200);
    host.frame(9000);
    host.document.hidden = false;
    for (const fn of host.listeners) fn();
    host.frame(10000);
    host.frame(10100);
    assert.deepEqual(dts, [0, 0.1, 0, 0.1]);
    await app.dispose();
  }));

void test('preparation is awaited once across views and restarts; failures can be retried', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    let ready!: () => void;
    let attempts = 0;
    const scene = app.scene({
      prepare() {
        attempts++;
        return new Promise<void>((resolve) => {
          ready = resolve;
        });
      },
    });
    app.view({ target: host.target, scene });
    app.view({ target: host.target, scene });
    const start = app.start();
    await Promise.resolve();
    assert.equal(host.frames.size, 0);
    ready();
    await start;
    app.stop();
    await app.start();
    assert.equal(attempts, 1);
    await app.dispose();
    const retry = new Rocket();
    let fail = true;
    const retryScene = retry.scene({
      prepare() {
        if (fail) throw new Error('load failed');
      },
    });
    retry.view({ target: host.target, scene: retryScene });
    await assert.rejects(retry.start(), /load failed/);
    assert.equal(retry.running, false);
    fail = false;
    await retry.start();
    await retry.dispose();
  }));

void test('dispose aborts preparation, waits for settlement, removes canvases and runs cleanup once', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    let resolve!: () => void;
    let signal!: AbortSignal;
    let cleaned = 0;
    const scene = app.scene({
      prepare(context) {
        signal = context.signal;
        return new Promise<void>((r) => {
          resolve = r;
        });
      },
      dispose() {
        cleaned++;
      },
    });
    const view = app.view({ target: host.target, scene });
    const start = app.start();
    const rejected = assert.rejects(start, /cancelled/);
    await Promise.resolve();
    const disposal = app.dispose();
    assert.equal(app.dispose(), disposal);
    assert.equal(signal.aborted, true);
    await Promise.resolve();
    assert.equal(wasRemoved(view.canvas), true);
    assert.equal(cleaned, 0);
    resolve();
    await rejected;
    await disposal;
    assert.equal(cleaned, 1);
    assert.equal(host.frames.size, 0);
    assert.equal(host.listeners.size, 0);
    await assert.rejects(app.start(), /disposed/);
  }));

void test('cleanup continues after errors; frame errors halt scheduling', () =>
  withBrowser(async (host) => {
    const errors: unknown[] = [];
    const app = new Rocket({ onError: (e) => errors.push(e) });
    let cleaned = false;
    const scene = app.scene({
      update() {
        throw new Error('bad update');
      },
      dispose() {
        cleaned = true;
      },
    });
    app.scene({
      dispose() {
        throw new Error('bad cleanup');
      },
    });
    app.view({ target: host.target, scene });
    await app.start();
    host.frame(0);
    assert.equal(app.running, false);
    assert.equal(host.frames.size, 0);
    assert.equal(failure(errors).message, 'bad update');
    await assert.rejects(app.dispose(), AggregateError);
    assert.equal(cleaned, true);
    assert.equal(host.listeners.size, 0);
  }));

void test('resize, pixel ratio and CSS-scaled picking use logical dimensions', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    const scene = app.scene({});
    const view = app.view({
      target: host.target,
      scene,
      width: 600,
      height: 400,
    });
    assert.equal(view.canvas.width, 1200);
    view.camera.x = -50;
    view.camera.y = 20;
    view.camera.zoom = 2;
    assert.deepEqual(view.clientToWorld({ x: 160, y: 120 }), {
      x: 100,
      y: 120,
    });
    const point = { x: -123.5, y: 99.25 };
    assert.deepEqual(
      view.camera.screenToWorld(view.camera.worldToScreen(point)),
      point,
    );
    view.resize(300, 200);
    assert.equal(view.canvas.width, 600);
    globalThis.devicePixelRatio = 3;
    await app.start();
    host.frame(0);
    assert.equal(view.canvas.width, 900);
    assert.throws(() => view.resize(0, 10), /positive/);
    assert.throws(() => {
      view.camera.zoom = 0;
    }, /positive/);
    await app.dispose();
    assert.equal(view.canvas.width, 0);
    assert.throws(() => view.resize(1, 1), /disposed/);
  }));

void test('unviewed/disposed-view scenes do not update; composition is guarded while running', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    let count = 0;
    const scene = app.scene({
      update() {
        count++;
      },
    });
    app.scene({
      update() {
        throw new Error('unviewed scene ran');
      },
    });
    const view = app.view({ target: host.target, scene });
    await app.start();
    host.frame(0);
    assert.equal(count, 1);
    assert.throws(() => app.scene({}), /Stop/);
    view.dispose();
    host.frame(100);
    assert.equal(count, 1);
    app.stop();
    assert.throws(
      () => app.view({ target: host.target, scene: {} }),
      /Register/,
    );
    await app.dispose();
  }));

void test('stop inside update prevents drawing and a second frame from being scheduled', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    let draws = 0;
    const scene = app.scene({
      update() {
        app.stop();
      },
      draw() {
        draws++;
      },
    });
    app.view({ target: host.target, scene });
    await app.start();
    host.frame(0);
    assert.equal(draws, 0);
    assert.equal(host.frames.size, 0);
    await app.dispose();
  }));

void test('a scheduling failure rejects startup without leaving a running application', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    const original = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = () => {
      throw new Error('scheduler unavailable');
    };
    await assert.rejects(app.start(), /scheduler unavailable/);
    assert.equal(app.running, false);
    globalThis.requestAnimationFrame = original;
    await app.start();
    assert.equal(host.frames.size, 1);
    await app.dispose();
  }));

void test('drawing failure restores canvas state and stops all further rendering', () =>
  withBrowser(async (host) => {
    let laterDraws = 0;
    const errors: unknown[] = [];
    const app = new Rocket({ onError: (error) => errors.push(error) });
    const scene = app.scene({
      draw(ctx) {
        ctx.fillStyle = 'red';
        throw new Error('draw failed');
      },
    });
    const first = app.view({ target: host.target, scene });
    app.view({
      target: host.target,
      scene: app.scene({
        draw() {
          laterDraws++;
        },
      }),
    });
    await app.start();
    host.frame(0);
    assert.equal(context(first.canvas).fillStyle, 'black');
    assert.equal(laterDraws, 0);
    assert.equal(host.frames.size, 0);
    assert.equal(failure(errors).message, 'draw failed');
    await app.dispose();
  }));

void test('a scene has exactly one application owner, including after disposal', () =>
  withBrowser(async (_host) => {
    const first = new Rocket();
    const second = new Rocket();
    const scene = first.scene({});
    assert.equal(first.scene(scene), scene);
    assert.throws(() => second.scene(scene), /owner/);
    await first.dispose();
    assert.throws(() => second.scene(scene), /owner/);
    await second.dispose();
  }));

void test('async frame hooks are rejected before executing', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    // @ts-expect-error Verify runtime rejection for JavaScript consumers too.
    assert.throws(() => app.scene({ async update() {} }), /synchronous/);
    // @ts-expect-error Async draws cannot occupy synchronous slots.
    assert.throws(() => app.scene({ async draw() {} }), /synchronous/);
    const scene = app.scene({});
    assert.throws(
      // @ts-expect-error Async overlays cannot occupy synchronous slots.
      () => app.view({ target: host.target, scene, async overlay() {} }),
      /synchronous/,
    );
    await app.dispose();
  }));

void test('draw and overlay begin with independent empty paths on every frame', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    const paths: [number, number][][] = [];
    const scene = app.scene({
      draw(ctx) {
        paths.push(drawingContext(ctx).path);
        ctx.moveTo(1, 2);
      },
    });
    app.view({
      target: host.target,
      scene,
      overlay(ctx) {
        paths.push(drawingContext(ctx).path);
        ctx.moveTo(3, 4);
      },
    });
    await app.start();
    host.frame(0);
    host.frame(16);
    assert.deepEqual(paths, [[], [], [], []]);
    await app.dispose();
  }));

void test('disposing the last view before another scene turn skips that scene', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    let secondView!: View;
    let laterUpdates = 0;
    const first = app.scene({
      update() {
        secondView.dispose();
      },
    });
    app.view({ target: host.target, scene: first });
    secondView = app.view({
      target: host.target,
      scene: app.scene({
        update() {
          laterUpdates++;
        },
      }),
    });
    await app.start();
    host.frame(0);
    assert.equal(laterUpdates, 0);
    await app.dispose();
  }));

void test('promises returned by ordinary frame functions fail clearly and halt the loop', () =>
  withBrowser(async (host) => {
    for (const hook of ['update', 'draw']) {
      const errors: unknown[] = [];
      const app = new Rocket({ onError: (error) => errors.push(error) });
      const scene = app.scene({
        [hook]() {
          return Promise.reject(new Error('late failure'));
        },
      });
      app.view({ target: host.target, scene });
      await app.start();
      host.frame(0);
      assert.match(failure(errors).message, /synchronous/);
      assert.equal(app.running, false);
      assert.equal(host.frames.size, 0);
      await app.dispose();
    }
  }));

void test('disposing one view keeps the shared scene active until the last view is gone', () =>
  withBrowser(async (host) => {
    let updates = 0,
      draws = 0,
      disposals = 0;
    const app = new Rocket();
    const scene = app.scene({
      update() {
        updates++;
      },
      draw() {
        draws++;
      },
      dispose() {
        disposals++;
      },
    });
    const first = app.view({ target: host.target, scene });
    const second = app.view({ target: host.target, scene });
    await app.start();
    host.frame(0);
    first.dispose();
    host.frame(16);
    assert.equal(updates, 2);
    assert.equal(draws, 3);
    assert.equal(disposals, 0);
    assert.equal(first.scene, null);
    second.dispose();
    host.frame(32);
    assert.equal(updates, 2);
    assert.equal(draws, 3);
    await app.dispose();
    assert.equal(disposals, 1);
  }));

void test('performance averages application frames, updates once and includes both view costs', () =>
  withBrowser(async (host) => {
    const app = new Rocket({ performance: true });
    const scene = app.scene({
      update() {
        host.work(3);
      },
      draw() {
        host.work(2);
      },
    });
    app.view({ target: host.target, scene });
    app.view({ target: host.target, scene });
    await app.start();
    host.frame(0);
    assert.equal(stats(app).fps, null);
    for (let i = 1; i <= 30; i++) host.frame((i * 1000) / 60);
    assert.ok(Math.abs(stats(app).fps! - 60) < 1e-9);
    assert.ok(Math.abs(stats(app).frameMs! - 1000 / 60) < 1e-9);
    assert.ok(Math.abs(stats(app).maxFrameMs! - 1000 / 60) < 1e-9);
    assert.equal(stats(app).updateMs, 3);
    assert.equal(stats(app).renderMs, 4);
    assert.ok(Object.isFrozen(app.performance));
    await app.dispose();
  }));

void test('frame limits retain elapsed time, update a shared scene once and skip both views together', () =>
  withBrowser(async (host) => {
    const app = new Rocket({ maxFps: 30 });
    let elapsed = 0,
      updates = 0,
      draws = 0;
    const scene = app.scene({
      update(dt) {
        elapsed += dt;
        updates++;
      },
      draw() {
        draws++;
      },
    });
    app.view({ target: host.target, scene });
    app.view({ target: host.target, scene });
    await app.start();
    for (let i = 0; i <= 144; i++) host.frame((i * 1000) / 144);
    assert.equal(updates, 31);
    assert.equal(draws, 62);
    assert.ok(Math.abs(elapsed - 1) < 1e-9);
    host.frame(5000);
    assert.equal(updates, 32);
    assert.ok(Math.abs(elapsed - 5) < 1e-9);
    host.frame(5001);
    assert.equal(updates, 32);
    app.maxFps = null;
    host.frame(5002);
    assert.equal(updates, 33);
    app.stop();
    app.maxFps = 60;
    await app.start();
    host.frame(10000);
    assert.ok(Math.abs(elapsed - 5.002) < 1e-9);
    assert.throws(() => {
      app.maxFps = 0;
    }, RangeError);
    await app.dispose();
    assert.equal(host.frames.size, 0);
  }));

void test('performance resets across stop and visibility changes without measuring inactive gaps', () =>
  withBrowser(async (host) => {
    const app = new Rocket({ performance: true });
    app.view({ target: host.target, scene: app.scene({}) });
    await app.start();
    host.frame(0);
    for (let i = 1; i <= 72; i++) host.frame((i * 1000) / 144);
    assert.ok(Math.abs(stats(app).fps! - 144) < 1e-9);
    app.stop();
    assert.equal(stats(app).fps, null);
    await app.start();
    host.frame(100000);
    assert.equal(stats(app).fps, null);
    for (let i = 1; i <= 30; i++) host.frame(100000 + (i * 1000) / 60);
    assert.ok(Math.abs(stats(app).fps! - 60) < 1e-7);
    host.document.hidden = true;
    for (const fn of host.listeners) fn();
    host.frame(200000);
    assert.equal(stats(app).fps, null);
    host.document.hidden = false;
    for (const fn of host.listeners) fn();
    host.frame(300000);
    assert.equal(stats(app).fps, null);
    await app.dispose();
  }));

void test('all demo frame limits preserve their target average on a 144 Hz callback stream', () =>
  withBrowser(async (host) => {
    for (const limit of [100, 80, 60, 30]) {
      const app = new Rocket({ maxFps: limit });
      let updates = 0;
      app.view({
        target: host.target,
        scene: app.scene({
          update() {
            updates++;
          },
        }),
      });
      await app.start();
      for (let i = 0; i <= 144; i++) host.frame((i * 1000) / 144);
      assert.equal(updates, limit + 1);
      await app.dispose();
    }
  }));

void test('the performance window exposes slow frames hidden by its average', () =>
  withBrowser(async (host) => {
    const app = new Rocket({ performance: true });
    app.view({ target: host.target, scene: app.scene({}) });
    await app.start();
    host.frame(0);
    for (let i = 1; i <= 40; i++) host.frame(i * 10);
    host.frame(500);
    assert.ok(Math.abs(stats(app).fps! - 82) < 1e-9);
    assert.equal(stats(app).maxFrameMs, 100);
    await app.dispose();
  }));

void test('equal average FPS distinguishes steady cadence from clustered callback pairs', () =>
  withBrowser(async (host) => {
    const steady = new Rocket({ performance: true });
    steady.view({ target: host.target, scene: steady.scene({}) });
    await steady.start();
    host.frame(0);
    for (let i = 1; i <= 50; i++) host.frame(i * 10);
    assert.ok(Math.abs(stats(steady).fps! - 100) < 1e-7);
    assert.ok(stats(steady).frameJitterMs! < 1e-5);
    assert.equal(stats(steady).minFrameMs, 10);
    await steady.dispose();
    const burst = new Rocket({ performance: true });
    burst.view({ target: host.target, scene: burst.scene({}) });
    await burst.start();
    host.frame(1000);
    for (let i = 1; i <= 25; i++) {
      host.frame(1000 + i * 20 - 19);
      host.frame(1000 + i * 20);
    }
    assert.ok(Math.abs(stats(burst).fps! - 100) < 1e-7);
    assert.ok(Math.abs(stats(burst).frameJitterMs! - 9) < 1e-7);
    assert.equal(stats(burst).minFrameMs, 1);
    assert.equal(stats(burst).maxFrameMs, 19);
    burst.stop();
    assert.equal(stats(burst).minFrameMs, null);
    assert.equal(stats(burst).frameJitterMs, null);
    await burst.dispose();
  }));

void test('pixel snapping changes only per-view presentation and picking at fractional ratio and zoom', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    const seen: Matrix2D[] = [];
    const scene = app.scene({
      draw(ctx) {
        seen.push(drawingContext(ctx).currentTransform);
      },
    });
    const first = app.view({
      target: host.target,
      scene,
      pixelRatio: 1.25,
      width: 100,
      height: 80,
    });
    const second = app.view({
      target: host.target,
      scene,
      pixelRatio: 1.25,
      pixelSnap: true,
      width: 100,
      height: 80,
    });
    for (const view of [first, second]) {
      view.camera.x = 4.21;
      view.camera.y = -7.33;
      view.camera.zoom = 1.5;
    }
    await app.start();
    host.frame(0);
    assert.equal(seen[0]![4], -4.21 * 1.25 * 1.5);
    assert.equal(seen[0]![5], 7.33 * 1.25 * 1.5);
    assert.equal(seen[1]![4], -8);
    assert.equal(seen[1]![5], 14);
    assert.equal(seen[1]![0], seen[0]![0]);
    const unsnappedOrigin = first.clientToWorld({ x: 10, y: 20 });
    assert.ok(Math.abs(unsnappedOrigin.x - 4.21) < 1e-12);
    assert.ok(Math.abs(unsnappedOrigin.y + 7.33) < 1e-12);
    assert.deepEqual(second.clientToWorld({ x: 10, y: 20 }), {
      x: 8 / 1.875,
      y: -14 / 1.875,
    });
    second.pixelSnap = false;
    host.frame(10);
    assert.deepEqual(seen[3], seen[0]);
    assert.equal(second.camera.x, 4.21);
    assert.equal(second.camera.y, -7.33);
    assert.equal(second.camera.zoom, 1.5);
    assert.equal(first.pixelSnap, false);
    await app.dispose();
  }));

void test('performance instrumentation is disabled by default', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    app.view({ target: host.target, scene: app.scene({}) });
    globalThis.performance.now = () => {
      throw new Error('unexpected instrumentation');
    };
    await app.start();
    host.frame(0);
    host.frame(16);
    assert.equal(app.performance, null);
    assert.equal(app.running, true);
    await app.dispose();
  }));

void test('tree updates once before both cameras draw; one view disposal preserves behaviors', () =>
  withBrowser(async (host) => {
    const calls: string[] = [],
      draws: Matrix2D[] = [];
    let cleaned = 0;
    const app = new Rocket();
    const scene = app.scene(
      new Scene2D({
        update() {
          calls.push('scene');
        },
      }),
    );
    const parent = scene.root.add(
      new Node2D({ x: 10, y: 20, rotation: Math.PI / 2 }),
    );
    const child = parent.add(
      new Node2D({
        x: 5,
        draw(ctx) {
          draws.push(drawingContext(ctx).currentTransform);
        },
      }),
    );
    parent.attach({
      update() {
        calls.push('parent');
        parent.x += 1;
      },
      dispose() {
        cleaned++;
      },
    });
    child.attach({
      update() {
        calls.push('child');
      },
      dispose() {
        cleaned++;
      },
    });
    const first = app.view({ target: host.target, scene });
    const second = app.view({ target: host.target, scene });
    second.camera.x = 3;
    second.camera.zoom = 2;
    await app.start();
    host.frame(0);
    assert.deepEqual(calls, ['scene', 'parent', 'child']);
    assert.ok(Math.abs(draws[0]![4] - 22) < 1e-9);
    assert.ok(Math.abs(draws[0]![5] - 50) < 1e-9);
    assert.ok(Math.abs(draws[1]![4] - 32) < 1e-9);
    assert.ok(Math.abs(draws[1]![5] - 100) < 1e-9);
    assert.deepEqual(child.localToWorld({ x: 0, y: 0 }), { x: 11, y: 25 });
    first.dispose();
    host.frame(16);
    assert.equal(calls.length, 6);
    assert.equal(draws.length, 3);
    assert.equal(cleaned, 0);
    await app.dispose();
    assert.equal(cleaned, 2);
    assert.equal(child.disposed, true);
    host.frame(32);
    assert.equal(calls.length, 6);
  }));

void test('node drawing isolates style and path from descendants and siblings', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    const scene = app.scene(new Scene2D());
    const seen: [string, [number, number][]][] = [];
    const parent = scene.root.add(
      new Node2D({
        draw(ctx) {
          ctx.fillStyle = 'red';
          ctx.moveTo(1, 2);
        },
      }),
    );
    parent.add(
      new Node2D({
        draw(ctx) {
          seen.push([String(ctx.fillStyle), drawingContext(ctx).path]);
        },
      }),
    );
    scene.root.add(
      new Node2D({
        draw(ctx) {
          seen.push([String(ctx.fillStyle), drawingContext(ctx).path]);
        },
      }),
    );
    app.view({ target: host.target, scene });
    app.view({ target: host.target, scene });
    await app.start();
    host.frame(0);
    assert.deepEqual(
      seen,
      Array.from({ length: 4 }, () => ['black', []]),
    );
    await app.dispose();
  }));

void test('structural mutation during drawing fails and restores the canvas', () =>
  withBrowser(async (host) => {
    const errors: unknown[] = [];
    const app = new Rocket({ onError: (error) => errors.push(error) });
    const scene = app.scene(new Scene2D());
    scene.root.add(
      new Node2D({
        draw() {
          scene.root.add(new Node2D());
        },
      }),
    );
    const view = app.view({ target: host.target, scene });
    await app.start();
    host.frame(0);
    assert.match(failure(errors).message, /during drawing/);
    assert.equal(app.running, false);
    assert.deepEqual(context(view.canvas).currentTransform, [1, 0, 0, 1, 0, 0]);
    await app.dispose();
  }));

void test('scene background cannot mutate or dispose its tree between view renders', () =>
  withBrowser(async (host) => {
    for (const operation of ['add', 'dispose']) {
      const errors: unknown[] = [];
      const app = new Rocket({ onError: (error) => errors.push(error) });
      const scene = app.scene(
        new Scene2D({
          draw() {
            if (operation === 'add') this.root.add(new Node2D());
            else this.dispose();
          },
        }),
      );
      let cleanups = 0;
      scene.root.attach({
        dispose() {
          cleanups++;
        },
      });
      app.view({ target: host.target, scene });
      app.view({ target: host.target, scene });
      await app.start();
      host.frame(0);
      assert.match(failure(errors).message, /during drawing/);
      assert.equal(scene.root.disposed, false);
      await app.dispose();
      assert.equal(cleanups, 1);
    }
  }));

void test('prepared scene shares image across views, retains it on stop/view removal, releases after tree cleanup', () =>
  withBrowser(async (host) => {
    const images = imageBrowser({ document: false });
    const app = new Rocket();
    const assets = app.use(Assets);
    let image: ImageBitmap;
    let preparations = 0;
    const draws: ImageBitmap[] = [];
    const scene = app.scene(
      new Scene2D({
        async prepare({ signal }) {
          preparations++;
          image = this.own(
            await assets.acquireImage(
              new URL('https://example.test/base.png'),
              { signal },
            ),
          ).image;
          this.root
            .add(
              new Node2D({
                draw() {
                  draws.push(image);
                },
              }),
            )
            .attach({
              dispose() {
                assert.equal(images.closes, 0);
              },
            });
        },
      }),
    );
    const first = app.view({ target: host.target, scene });
    app.view({ target: host.target, scene });
    try {
      await app.start();
      host.frame(0);
      assert.deepEqual(draws, [images.image, images.image]);
      assert.equal(images.loads, 1);
      first.dispose();
      app.stop();
      assert.equal(images.closes, 0);
      await app.start();
      host.frame(20);
      assert.equal(preparations, 1);
      assert.equal(draws.length, 3);
      await app.dispose();
      assert.equal(images.closes, 1);
    } finally {
      await app.dispose();
      images.restore();
    }
  }));

void test('fixed catch-up is bounded, excess whole time is dropped; one frame update precedes both renders', () =>
  withBrowser(async (host) => {
    const app = new Rocket({ fixed: { step: 0.01, maxSteps: 3 } });
    const calls: string[] = [];
    class Phases {
      beforeUpdate(): undefined {
        calls.push('snapshot');
      }
      beforeFixedUpdate(tick: FixedFrame): undefined {
        calls.push(`tick-input:${tick.tick}`);
      }
    }
    app.use(Phases);
    const scene = app.scene(
      new Scene2D({
        fixedUpdate(dt, tick) {
          assert.equal(dt, 0.01);
          calls.push(`fixed:${tick.tick}`);
        },
        update() {
          calls.push('frame');
        },
        draw() {
          calls.push('draw');
        },
      }),
    );
    app.view({ target: host.target, scene });
    app.view({ target: host.target, scene });
    await app.start();
    host.frame(0);
    calls.length = 0;
    host.frame(105);
    assert.deepEqual(calls, [
      'snapshot',
      'tick-input:1',
      'fixed:1',
      'tick-input:2',
      'fixed:2',
      'tick-input:3',
      'fixed:3',
      'frame',
      'draw',
      'draw',
    ]);
    assert.ok(app.fixed);
    assert.equal(app.fixed.steps, 3);
    assert.equal(app.fixed.time, 0.03);
    assert.ok(Math.abs(app.fixed.droppedTime - 0.07) < 1e-12);
    assert.ok(Math.abs(app.fixed.alpha - 0.5) < 1e-12);
    calls.length = 0;
    host.frame(110);
    assert.deepEqual(calls, [
      'snapshot',
      'tick-input:4',
      'fixed:4',
      'frame',
      'draw',
      'draw',
    ]);
    await app.dispose();
  }));

void test('fixed simulations advance identically at 60 and 144 Hz; node behaviors remain frame-domain', () =>
  withBrowser(async (host) => {
    for (const hz of [60, 144]) {
      const app = new Rocket({ fixed: {} });
      let position = 0,
        behaviors = 0;
      const scene = app.scene(
        new Scene2D({
          fixedUpdate(dt) {
            position += 10 * dt;
          },
        }),
      );
      scene.root.attach({
        update() {
          behaviors++;
        },
      });
      app.view({ target: host.target, scene });
      await app.start();
      host.frame(0);
      for (let index = 1; index <= hz; index++) host.frame((index * 1000) / hz);
      assert.equal(app.fixed?.totalSteps, 60);
      assert.ok(Math.abs(position - 10) < 1e-12);
      assert.equal(behaviors, hz + 1);
      await app.dispose();
    }
  }));

void test('stop and visibility discard fixed remainders, retain simulation time, and exclude inactive gaps', () =>
  withBrowser(async (host) => {
    const app = new Rocket({ fixed: { step: 0.01 } });
    const scene = app.scene({ fixedUpdate() {} });
    app.view({ target: host.target, scene });
    await app.start();
    host.frame(0);
    host.frame(15);
    assert.equal(app.fixed?.totalSteps, 1);
    app.stop();
    await app.start();
    host.frame(1000);
    host.frame(1005);
    assert.equal(app.fixed?.totalSteps, 1);
    host.document.hidden = true;
    for (const fn of host.listeners) fn();
    host.frame(2000);
    host.document.hidden = false;
    for (const fn of host.listeners) fn();
    host.frame(3000);
    host.frame(3005);
    assert.equal(app.fixed?.totalSteps, 1);
    host.frame(3010);
    assert.equal(app.fixed?.totalSteps, 2);
    assert.equal(app.fixed?.droppedTime, 0);
    await app.dispose();
  }));

void test('fixed hook failure or stop halts catch-up and rendering; configuration and async hooks are guarded', () =>
  withBrowser(async (host) => {
    assert.throws(() => new Rocket({ fixed: { step: 0 } }), RangeError);
    assert.throws(() => new Rocket({ fixed: { maxSteps: 1.5 } }), RangeError);
    const plain = new Rocket();
    assert.throws(() => plain.scene({ fixedUpdate() {} }), /Enable fixed/);
    await plain.dispose();
    for (const throws of [false, true]) {
      const errors: unknown[] = [];
      const app = new Rocket({
        fixed: { step: 0.01 },
        onError(error) {
          errors.push(error);
        },
      });
      // Runtime boundary deliberately bypasses the compile-time synchronous guard.
      assert.throws(
        () => app.scene({ fixedUpdate: async () => {} } as unknown as Scene),
        /synchronous/,
      );
      let steps = 0,
        draws = 0;
      const scene = app.scene({
        fixedUpdate() {
          steps++;
          if (throws) throw new Error('Fixed failed');
          else app.stop();
        },
        draw() {
          draws++;
        },
      });
      app.view({ target: host.target, scene });
      await app.start();
      host.frame(0);
      draws = 0;
      host.frame(100);
      assert.equal(steps, 1);
      assert.equal(draws, 0);
      assert.equal(host.frames.size, 0);
      assert.equal(errors.length, throws ? 1 : 0);
      await app.dispose();
    }
  }));

void test('last fixed view removal during catch-up stops its steps; draw-only scenes do not accrue fixed time', () =>
  withBrowser(async (host) => {
    const app = new Rocket({ fixed: { step: 0.01 } });
    let steps = 0;
    const scene = app.scene({
      fixedUpdate() {
        steps++;
        view.dispose();
      },
    });
    const view = app.view({ target: host.target, scene });
    app.view({ target: host.target, scene: app.scene({ draw() {} }) });
    try {
      await app.start();
      host.frame(0);
      host.frame(40);
      assert.equal(steps, 1);
      assert.equal(app.fixed?.steps, 1);
      assert.equal(app.fixed?.totalSteps, 1);
      host.frame(1000);
      assert.equal(app.fixed?.steps, 0);
      assert.equal(app.fixed?.totalSteps, 1);
      assert.equal(app.fixed?.alpha, 0);
      assert.equal(app.fixed?.droppedTime, 0);
    } finally {
      await app.dispose();
    }
  }));

void test('one physics clock drives world and independent diagnostics; offscreen camera has no solver authority', () =>
  withBrowser(async (host) => {
    const app = new Rocket({ fixed: {} });
    const world = new PhysicsWorld();
    const body = world.rectangle(0, 0, 20, 20);
    let presentation = body.pose,
      updates = 0;
    const rendered: number[] = [];
    const scene = app.scene(
      new Scene2D({
        fixedUpdate(dt) {
          world.step(dt);
        },
        update() {
          presentation = body.pose;
          updates++;
        },
        draw() {
          rendered.push(presentation.y);
        },
      }),
    );
    scene.own(world);
    scene.root.attach({
      dispose() {
        body.dispose();
      },
    });
    const view = app.view({ target: host.target, scene });
    const diagnostic = app.view({
      target: host.target,
      scene: app.scene({
        draw() {
          rendered.push(body.pose.y);
        },
      }),
    });
    try {
      await app.start();
      host.frame(0);
      view.camera.x = 10000;
      host.frame(1000 / 60);
      assert.equal(world.stats.steps, 1);
      assert.equal(app.fixed?.totalSteps, 1);
      assert.equal(updates, 2);
      assert.ok(body.pose.y > 0);
      assert.equal(rendered.at(-1), rendered.at(-2));
      assert.equal(world.stats.bodies, 1);
      await app.dispose();
      assert.equal(body.disposed, true);
      assert.equal(world.stats.bodies, 0);
      assert.equal(world.stats.listeners, 0);
      assert.equal(world.stats.disposed, true);
      assert.equal(diagnostic.disposed, true);
    } finally {
      await app.dispose();
    }
  }));

void test('stream controller generates once before two independent presentations; scene disposal preserves host edits', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    const edits = new MemoryEdits();
    const stream = new ChunkStream(edits, 9);
    const reads: number[] = [];
    const scene = app.scene(
      new Scene2D({
        update() {
          stream.demand({ minX: -8, minY: -8, maxX: 0, maxY: 0 });
          stream.advance(1);
        },
        draw() {
          reads.push(stream.stats.generations);
        },
      }),
    );
    scene.own(stream);
    app.view({ target: host.target, scene });
    const diagnostic = app.view({
      target: host.target,
      scene: app.scene({
        draw() {
          reads.push(stream.stats.generations);
        },
      }),
    });
    try {
      await app.start();
      host.frame(0);
      assert.deepEqual(reads, [1, 1]);
      stream.cycle({ x: -1, y: -1 });
      assert.equal(edits.stats.cells, 1);
      host.frame(16);
      assert.deepEqual(reads, [1, 1, 2, 2]);
      diagnostic.dispose();
      host.frame(32);
      assert.equal(stream.stats.generations, 3);
      await app.dispose();
      assert.equal(stream.stats.retained, 0);
      assert.equal(stream.stats.pending, 0);
      assert.equal(edits.stats.cells, 1);
    } finally {
      await app.dispose();
    }
  }));

void test('Workshop has one elapsed-time owner with two views; closing one preserves production and pause excludes inactive time', () =>
  withBrowser(async (host) => {
    const app = new Rocket(),
      factory = new FactoryDemo();
    const ticks: number[] = [];
    const scene = app.scene(
      new Scene2D({
        update(dt) {
          factory.advance(dt);
        },
        draw() {
          ticks.push(factory.read().summary.tick);
        },
      }),
    );
    scene.own(factory);
    const floor = app.view({ target: host.target, scene });
    app.view({ target: host.target, scene });
    try {
      await app.start();
      host.frame(0);
      host.frame(1000);
      assert.deepEqual(ticks, [0, 0, 20, 20]);
      assert.equal(factory.read().advances, 1);
      floor.dispose();
      host.frame(2000);
      assert.equal(factory.read().summary.tick, 40);
      assert.equal(factory.read().advances, 2);
      app.stop();
      host.frame(30000);
      assert.equal(factory.read().summary.tick, 40);
      await app.start();
      host.frame(40000);
      host.frame(41000);
      assert.equal(factory.read().summary.tick, 60);
      host.frame(71000);
      assert.equal(factory.read().summary.tick, 660); // Full visible stall retained; no fixed-clock catch-up cap.
      await app.dispose();
      assert.throws(() => factory.advance(1), /disposed/);
    } finally {
      await app.dispose();
    }
  }));

void test('navigation pose advances once with two views; view closure preserves journey and scene disposal cancels it', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    const domain = { minX: 0, minY: 0, columns: 10, rows: 3, tileSize: 10 };
    const world = new GridTraversal(
      domain,
      () => ({ status: 'passable', cost: 1 }),
      () => 0,
    );
    const movement = new Movement(
      new GridNavigator(world, domain),
      { x: 5, y: 15 },
      { radius: 1, clearance: 0, capabilities: ['walk'] },
    );
    const journey = movement.move({
      destination: { x: 95, y: 15 },
      speed: 10,
      arrivalTolerance: 0,
      replan: 'manual',
    });
    const poses: number[] = [];
    const scene = app.scene(
      new Scene2D({
        update(dt) {
          movement.update(dt);
        },
        draw() {
          poses.push(movement.position.x);
        },
      }),
    );
    scene.own(movement);
    const first = app.view({ target: host.target, scene });
    const second = app.view({ target: host.target, scene });
    await app.start();
    host.frame(0);
    host.frame(1000);
    assert.equal(movement.position.x, 15);
    assert.deepEqual(poses, [5, 5, 15, 15]);
    first.dispose();
    host.frame(2000);
    assert.equal(movement.position.x, 25);
    assert.equal(journey.snapshot().status, 'moving');
    second.dispose();
    await app.dispose();
    assert.equal(journey.snapshot().status, 'cancelled');
  }));

void test('two views share one workplace journey and production clock; closing a view preserves staffing and teardown clears it', () =>
  withBrowser(async (host) => {
    const factory = new FactoryDemo(1, true, true);
    const id = factory.ids[1]!;
    const world = new GridTraversal(
      { minX: 0, minY: 0, columns: 10, rows: 4, tileSize: 10 },
      () => ({ status: 'passable', cost: 1 }),
      () => 0,
    );
    const profile = { radius: 2, clearance: 0, capabilities: ['walk'] };
    const operator = new WorkplaceOperator(
      new Movement(
        new GridNavigator(world, world.domain),
        { x: 15, y: 15 },
        profile,
      ),
      {
        workplace() {
          return { x: 35, y: 15 };
        },
        canStand(point) {
          return world.point(point, profile).status === 'passable';
        },
        setPresent(facility, present) {
          factory.operatorOnSite(facility, present);
        },
      },
    );
    const app = new Rocket({ fixed: {} });
    const scene = app.scene(
      new Scene2D({
        fixedUpdate(dt) {
          operator.reconcile();
          factory.advance(dt);
          operator.update(dt);
        },
      }),
    );
    scene.own(operator); // Factory remains caller-owned for the teardown assertion.
    const first = app.view({ target: host.target, scene });
    app.view({ target: host.target, scene });
    operator.assign(id);
    try {
      await app.start();
      host.frame(0);
      for (let i = 1; i <= 60; i++) host.frame((i * 1000) / 60);
      assert.equal(factory.read().summary.tick, 20);
      assert.equal(operator.snapshot().present, id);
      first.dispose();
      for (let i = 61; i <= 120; i++) host.frame((i * 1000) / 60);
      assert.equal(factory.read().summary.tick, 40);
      assert.equal(operator.snapshot().present, id);
      app.stop();
      app.view({ target: host.target, scene });
      await app.start();
      host.frame(3000);
      assert.equal(factory.read().summary.tick, 40);
      assert.equal(operator.snapshot().present, id);
      await app.dispose();
      assert.equal(
        factory.read().facilities.find((f) => f.id === id)!.attendance.operator,
        undefined,
      );
    } finally {
      await app.dispose();
      factory.dispose();
    }
  }));

void test('keepAlive simulation prepares and advances once with zero views; ordinary inactive scenes stay paused', () =>
  withBrowser(async (host) => {
    const app = new Rocket({ fixed: {} });
    let prepared = 0,
      fixed = 0,
      frames = 0,
      inactive = 0;
    const scene = app.scene(
      {
        prepare() {
          prepared++;
        },
        fixedUpdate() {
          fixed++;
        },
        update() {
          frames++;
        },
      },
      { keepAlive: true },
    );
    app.scene({
      update() {
        inactive++;
      },
    });
    try {
      await app.start();
      host.frame(0);
      host.frame(1000 / 60);
      assert.equal(prepared, 1);
      assert.equal(fixed, 1);
      assert.equal(frames, 2);
      assert.equal(inactive, 0);
      app.stop();
      const view = app.view({ target: host.target, scene });
      await app.start();
      host.frame(100);
      host.frame(100 + 1000 / 60);
      assert.equal(prepared, 1);
      assert.equal(fixed, 2);
      view.dispose();
      host.frame(100 + 2000 / 60);
      assert.equal(fixed, 3);
      app.stop();
      host.frame(1000);
      assert.equal(fixed, 3);
    } finally {
      await app.dispose();
    }
  }));
void test('actor crosses streamed chunk boundaries after all cameras close and reopening observes the existing pose', () =>
  withBrowser(async (host) => {
    const app = new Rocket({ fixed: {} }),
      stream = new ChunkStream(new MemoryEdits(() => 0), 64, 0),
      actor = new StreamedWalker(stream);
    const scene = app.scene(
      new Scene2D({
        fixedUpdate(dt) {
          stream.advance(64);
          actor.update(dt);
        },
      }),
      { keepAlive: true },
    );
    scene.own(stream);
    scene.own(actor);
    const camera = stream.createDemand();
    camera.set({ minX: 40, minY: 0, maxX: 48, maxY: 8 });
    const view = app.view({ target: host.target, scene });
    view.own(camera);
    actor.go({ x: 304, y: 48 });
    await app.start();
    host.frame(0);
    view.dispose();
    try {
      for (let i = 1; i <= 180; i++) host.frame((i * 1000) / 60);
      assert.equal(actor.snapshot().journey!.status, 'arrived');
      assert.equal(actor.position.x, 304);
      assert.equal(stream.stats.owners, 1);
      app.stop();
      app.view({ target: host.target, scene });
      await app.start();
      host.frame(4000);
      assert.equal(actor.position.x, 304);
      await app.dispose();
      assert.equal(stream.stats.owners, 0);
      assert.equal(stream.stats.retained, 0);
    } finally {
      await app.dispose();
    }
  }));

void test('backend-neutral presentations share one prepared scene update and render CPU lifecycle with Canvas views', () =>
  withBrowser(async (host) => {
    const app = new Rocket({ performance: true });
    let prepares = 0,
      updates = 0,
      renders = 0,
      cleanups = 0;
    const scene = app.scene({
      prepare() {
        prepares++;
      },
      update() {
        updates++;
        host.work(2);
      },
    });
    app.view({ target: host.target, scene });
    const slot = app.presentation({
      scene,
      render() {
        renders++;
        host.work(3);
      },
      dispose() {
        cleanups++;
      },
    });
    await app.start();
    host.frame(0);
    host.frame(1000);
    assert.equal(prepares, 1);
    assert.equal(updates, 2);
    assert.equal(renders, 2);
    assert.equal(stats(app).renderMs, 3);
    slot.dispose();
    slot.dispose();
    assert.equal(slot.scene, null);
    assert.equal(cleanups, 1);
    host.frame(2000);
    assert.equal(renders, 2);
    assert.equal(updates, 3);
    await app.dispose();
    assert.equal(cleanups, 1);
    assert.equal(host.frames.size, 0);
  }));
void test('presentation-only scenes activate without a hidden Canvas view and retire when detached', () =>
  withBrowser(async (host) => {
    const app = new Rocket();
    let updates = 0,
      draws = 0;
    const scene = app.scene({
      update() {
        updates++;
      },
    });
    assert.throws(
      () => app.presentation({ scene: {}, render() {} }),
      /Register/,
    );
    const slot = app.presentation({
      scene,
      render() {
        draws++;
      },
    });
    await app.start();
    host.frame(0);
    assert.equal(host.canvases.length, 0);
    assert.equal(updates, 1);
    assert.equal(draws, 1);
    assert.throws(() => app.presentation({ scene, render() {} }), /Stop/);
    slot.dispose();
    host.frame(1000);
    assert.equal(updates, 1);
    assert.equal(draws, 1);
    await app.dispose();
    assert.throws(() => app.presentation({ scene, render() {} }), /disposed/);
  }));
void test('presentation failures halt the shared loop and cleanup errors do not skip scene disposal', () =>
  withBrowser(async (host) => {
    const errors: unknown[] = [];
    const app = new Rocket({ onError: (e) => errors.push(e) });
    let cleaned = false;
    const scene = app.scene({
      dispose() {
        cleaned = true;
      },
    });
    const slot = app.presentation({
      scene,
      render() {
        throw new Error('GPU failed');
      },
      dispose() {
        throw new Error('cleanup failed');
      },
    });
    await app.start();
    host.frame(0);
    assert.equal(failure(errors).message, 'GPU failed');
    assert.equal(host.frames.size, 0);
    await assert.rejects(app.dispose(), AggregateError);
    assert.equal(cleaned, true);
    assert.equal(slot.disposed, true);
  }));
