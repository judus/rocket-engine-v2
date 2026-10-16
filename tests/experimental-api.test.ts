import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Stage2D,
  SceneNavigator,
  followCamera,
} from '../src/experimental/index.js';
import { Camera2D } from '../src/Camera2D.js';
import { deferred } from './helpers/images.js';

void test('experimental stages retain actual nodes, IDs/tags, sorting, and ownership', () => {
  const stage = new Stage2D();
  stage.addLayer('actors', { sort: 'y' });
  stage.addLayer('hud', { space: 'screen' });
  const a = stage.add({
    id: 'hero',
    tags: ['actor'],
    layer: 'actors',
    y: 20,
    update(dt): undefined {
      this.y -= dt * 20;
    },
  });
  const b = stage.add({ tags: ['actor'], layer: 'actors', y: 10 });
  assert.equal(stage.find('hero'), a);
  assert.deepEqual(stage.query({ tag: 'actor' }), [a, b]);
  stage.update(0, { dt: 0, time: 0 });
  assert.deepEqual(stage.layer('actors').children, [b, a]);
  stage.update(1, { dt: 1, time: 1 });
  assert.deepEqual(stage.layer('actors').children, [a, b]);
  assert.throws(() => stage.add({ id: 'hero' }), /Duplicate/);
  assert.throws(() => stage.addLayer('hud'), /Duplicate/);
  a.detach();
  assert.equal(stage.find('hero'), undefined);
  stage.layer('hud').add(a);
  assert.equal(stage.find('hero'), a);
  a.dispose();
  assert.deepEqual(stage.query({ tag: 'actor' }), [b]);
  stage.dispose();
  stage.dispose();
  assert.ok(b.disposed);
  assert.throws(() => stage.add(), /disposed/);
});
void test('experimental layers separate world/screen drawing and parallax camera translation', () => {
  const stage = new Stage2D();
  stage.addLayer('sky', { parallax: 0.2 });
  stage.addLayer('hud', { space: 'screen' });
  const log: string[] = [],
    translations: number[][] = [];
  stage.add({
    layer: 'sky',
    draw(): undefined {
      log.push('sky');
    },
  });
  stage.add({
    layer: 'hud',
    draw(): undefined {
      log.push('hud');
    },
  });
  const context = {
    save() {},
    restore() {},
    beginPath() {},
    transform() {},
    translate(x: number, y: number) {
      translations.push([x, y]);
    },
  } as unknown as CanvasRenderingContext2D;
  const camera = new Camera2D();
  camera.x = 100;
  camera.y = 50;
  stage.drawWorld(context, { dt: 0, time: 0 }, camera);
  assert.deepEqual(log, ['sky']);
  assert.deepEqual(translations.at(-1), [80, 40]);
  stage.drawScreen(context, { dt: 0, time: 0 });
  assert.deepEqual(log, ['sky', 'hud']);
  assert.throws(
    () => stage.addLayer('bad', { space: 'screen', parallax: 0 }),
    /only to world/,
  );
  stage.dispose();
});
void test('camera follow half-life uses seconds and frames small bounds symmetrically', () => {
  const stage = new Stage2D();
  const hero = stage.add({ x: 100, y: 100 });
  const view = { camera: new Camera2D(), width: 100, height: 100 };
  followCamera(view, hero, 1, { halfLife: 1 });
  assert.equal(view.camera.x, 25);
  followCamera(view, hero, 1, {
    bounds: { x: 0, y: 0, width: 40, height: 40 },
  });
  assert.equal(view.camera.x, -30);
  assert.equal(view.camera.y, -30);
  assert.throws(() => followCamera(view, hero, -1), /nonnegative/);
  stage.dispose();
});
void test('navigation keeps retained identity, recreates fresh routes, records successful history', async () => {
  const nav = new SceneNavigator();
  let created = 0,
    disposed = 0;
  nav.add('home', {
    retain: true,
    create: () => ({
      update(): undefined {},
      dispose() {
        disposed++;
      },
    }),
  });
  nav.add('fresh', {
    create: () => {
      created++;
      return {
        dispose() {
          disposed++;
        },
      };
    },
  });
  await nav.run('home');
  const home = nav.scene;
  await nav.run('fresh');
  assert.deepEqual(nav.history, ['home']);
  await nav.previous();
  assert.equal(nav.scene, home);
  assert.equal(disposed, 1);
  await nav.run('fresh');
  assert.equal(created, 2);
  await nav.run('home');
  assert.equal(disposed, 2);
  const completion = nav.dispose();
  assert.equal(nav.dispose(), completion);
  await completion;
  assert.equal(disposed, 3);
  await assert.rejects(nav.run('home'), /disposed/);
});
void test('failed and superseded preparations do not replace the active route or leak instances', async () => {
  const nav = new SceneNavigator();
  const slow = deferred<void>();
  let disposed = 0;
  nav.add('home', { retain: true, create: () => ({}) });
  nav.add('slow', {
    create: () => ({
      prepare: () => slow.promise,
      dispose() {
        disposed++;
      },
    }),
  });
  nav.add('bad', {
    create: () => ({
      prepare() {
        throw new Error('load failed');
      },
      dispose() {
        disposed++;
      },
    }),
  });
  await nav.run('home');
  await assert.rejects(nav.run('bad'), /load failed/);
  assert.equal(nav.current, 'home');
  assert.deepEqual(nav.history, []);
  const job = nav.run('slow');
  await Promise.resolve();
  await nav.run('home');
  slow.resolve();
  await assert.rejects(job, { name: 'AbortError' });
  assert.equal(nav.current, 'home');
  assert.equal(disposed, 2);
  await nav.dispose();
});
void test('navigation disposal aborts pending load and waits for its owned cleanup', async () => {
  const nav = new SceneNavigator();
  const load = deferred<void>();
  let cleaned = 0;
  nav.add('load', {
    create: () => ({
      prepare: () => load.promise,
      dispose() {
        cleaned++;
      },
    }),
  });
  const job = nav.run('load');
  const rejected = assert.rejects(job, { name: 'AbortError' });
  await Promise.resolve();
  const completion = nav.dispose();
  load.resolve();
  await rejected;
  await completion;
  assert.equal(cleaned, 1);
  assert.equal(nav.current, null);
});

void test('minimal app auto-start/deferred start/readiness and owned DOM cleanup use one Rocket loop', async () => {
  const { createApp } = await import('../src/experimental/index.js');
  const keys = [
    'document',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'devicePixelRatio',
  ];
  const saved = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  class Element {
    children = new Set<Element>();
    parent: Element | null = null;
    style = {};
    width = 0;
    height = 0;
    get ownerDocument() {
      return document;
    }
    appendChild(child: Element) {
      this.children.add(child);
      child.parent = this;
    }
    remove() {
      this.parent?.children.delete(this);
      this.parent = null;
    }
    getContext() {
      return {};
    }
  }
  const body = new Element();
  const document = Object.assign(new EventTarget(), {
    hidden: false,
    body,
    createElement: () => new Element(),
    querySelector: () => null,
  });
  for (const [key, value] of Object.entries({
    document,
    devicePixelRatio: 1,
    requestAnimationFrame: (fn: FrameRequestCallback) => {
      frames.set(++frameId, fn);
      return frameId;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  }))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  try {
    const app = createApp();
    const node = app.stage.add({ id: 'node' });
    assert.equal(app.engine.running, false);
    await app.ready;
    assert.equal(app.engine.running, true);
    assert.equal(frames.size, 1);
    assert.equal(body.children.size, 1);
    app.pause();
    assert.equal(frames.size, 0);
    await app.resume();
    assert.equal(frames.size, 1);
    await app.dispose();
    assert.equal(frames.size, 0);
    assert.equal(body.children.size, 0);
    assert.ok(node.disposed);
    const pausedBeforeStart = createApp();
    pausedBeforeStart.pause();
    await pausedBeforeStart.ready;
    assert.equal(pausedBeforeStart.engine.running, false);
    await pausedBeforeStart.dispose();
    const deferredApp = createApp({ autoStart: false });
    await deferredApp.ready;
    assert.equal(deferredApp.engine.running, false);
    await deferredApp.resume();
    assert.equal(frames.size, 1);
    await deferredApp.dispose();
    const errors: unknown[] = [];
    const failed = createApp({
      prepare() {
        throw new Error('startup failed');
      },
      runtime: {
        onError: (error) => {
          errors.push(error);
        },
      },
    });
    await assert.rejects(failed.ready, /startup failed/);
    assert.equal(errors.length, 1);
    assert.equal(frames.size, 0);
    await failed.dispose();
    assert.equal(body.children.size, 0);
    assert.throws(() => createApp({ target: '#missing' }), /view target/);
  } finally {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});

void test('navigator forwards fixed ticks only when explicitly opted in', async () => {
  let ticks = 0;
  const create = () => ({
    fixedUpdate(): undefined {
      ticks++;
    },
  });
  const normal = new SceneNavigator().add('fixed', { create });
  await assert.rejects(normal.run('fixed'), /Enable fixed timing/);
  await normal.dispose();
  const nav = new SceneNavigator({ fixed: true }).add('fixed', { create });
  await nav.run('fixed');
  nav.fixedUpdate!(1 / 60, { dt: 1 / 60, time: 1 / 60, tick: 1 });
  assert.equal(ticks, 1);
  await nav.dispose();
});
