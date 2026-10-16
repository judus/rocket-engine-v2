import test from 'node:test';
import assert from 'node:assert/strict';
import { Rocket } from '../src/Rocket.js';
import type { Service } from '../src/Service.js';
import type { Scene } from '../src/types.js';
import {
  createApp,
  Stage2D,
  SceneNavigator,
} from '../src/experimental/index.js';
import { Key, Canvas, withHost } from './helpers/inputHost.js';
import { deferred } from './helpers/images.js';

void test('named app scopes follow committed routes immediately without duplicate updates or key carryover', () =>
  withHost(async (host) => {
    const app = createApp({ target: host.target, autoStart: false });
    const counts = { created: 0, disposed: 0, updates: 0 };
    const scopes = new Map<Stage2D, ReturnType<typeof app.input<'move'>>>();
    const build = () => {
      counts.created++;
      let actions: ReturnType<typeof app.input<'move'>>;
      const scene = new Stage2D({
        update(): undefined {
          counts.updates++;
          if (actions.down('move')) scene.layer('world').x++;
        },
      });
      scene.world.own((): undefined => {
        counts.disposed++;
      });
      actions = app.input(scene, { move: 'KeyD' });
      scopes.set(scene, actions);
      return scene;
    };
    app.addScene('retained', { retain: true, create: build });
    app.addScene('fresh', { create: build });
    const load = deferred<void>();
    app.addScene('slow', {
      create: () => {
        const scene = build();
        scene.world.own((): undefined => {});
        return Object.assign(scene, { prepare: () => load.promise });
      },
    });
    app.addScene('broken', {
      create: () =>
        Object.assign(build(), {
          prepare() {
            throw new Error('load failed');
          },
        }),
    });
    await app.run('retained');
    const retained = app.stage;
    const key = app.view.canvas as unknown as Canvas;
    key.focus();
    key.dispatchEvent(new Key('keydown', 'KeyD'));
    host.frame(0);
    host.frame(16);
    assert.equal(retained.layer('world').x, 2);
    assert.equal(counts.updates, 2);
    assert.equal(app.view.camera, retained.camera);
    const old = scopes.get(retained)!;
    await app.run('fresh');
    assert.equal(
      old.down('move'),
      false,
      'leaving resets immediately, not next RAF',
    );
    const fresh = app.stage;
    host.frame(32);
    assert.equal(fresh.layer('world').x, 0);
    await app.previous();
    assert.equal(app.stage, retained);
    host.frame(48);
    assert.equal(
      retained.layer('world').x,
      2,
      'held key must not resurrect on return',
    );
    await assert.rejects(app.run('broken'), /load failed/);
    assert.equal(app.stage, retained);
    const pending = app.run('slow');
    const rejected = assert.rejects(pending, { name: 'AbortError' });
    await Promise.resolve();
    await Promise.resolve();
    host.frame(64);
    assert.equal(app.stage, retained, 'loading does not activate candidate');
    await app.run('fresh');
    const secondFresh = app.stage;
    assert.notEqual(secondFresh, fresh);
    load.resolve();
    await rejected;
    app.pause();
    key.dispatchEvent(new Key('keydown', 'KeyD'));
    host.frame(80);
    assert.equal(secondFresh.layer('world').x, 0);
    await app.resume();
    host.frame(96);
    assert.equal(secondFresh.layer('world').x, 0);
    const completion = app.dispose();
    assert.equal(app.dispose(), completion);
    await completion;
    assert.equal(counts.created, counts.disposed);
    assert.equal(key.listenerCount, 0);
    assert.equal(key.getAttribute('tabindex'), null);
    assert.equal(key.style.touchAction, '');
    assert.ok(key.removed);
    assert.equal(host.document.listenerCount, 0);
    assert.equal(host.document.defaultView.listenerCount, 0);
  }));

void test('active child scope graph is visible to services but only parent receives simulation callbacks', () =>
  withHost(async (host) => {
    const app = new Rocket({ fixed: { step: 1 / 60 } });
    let updates = 0,
      fixed = 0;
    const child: Scene = {
      update(): undefined {
        updates++;
      },
      fixedUpdate(): undefined {
        fixed++;
      },
    };
    let selected: Scene | null = child;
    let serviceScopes: ReadonlySet<Scene> = new Set();
    class Probe implements Service {
      beforeUpdate(_frame: unknown, active: ReadonlySet<Scene>): undefined {
        serviceScopes = active;
      }
      beforeFixedUpdate(
        _frame: unknown,
        active: ReadonlySet<Scene>,
      ): undefined {
        assert.equal(active.has(child), selected !== null);
      }
    }
    app.use(Probe);
    const parent = app.scene({
      activeChildren: () => (selected ? [selected] : []),
      update(dt, frame): undefined {
        selected?.update?.(dt, frame);
      },
      fixedUpdate(dt, frame): undefined {
        selected?.fixedUpdate?.(dt, frame);
      },
    });
    app.view({ target: host.target, scene: parent });
    await app.start();
    host.frame(0);
    host.frame(20);
    assert.equal(updates, 2);
    assert.equal(fixed, 1);
    assert.ok(serviceScopes.has(child));
    selected = null;
    app.refreshScenes();
    host.frame(40);
    assert.ok(!serviceScopes.has(child));
    // Probe has no child to expect on further fixed steps; stop before another step.
    await app.dispose();
  }));

void test('activation cycles fail visibly and no additional RAF chain survives', () =>
  withHost(async (host) => {
    const errors: unknown[] = [];
    const app = new Rocket({
      onError: (error) => {
        errors.push(error);
      },
    });
    let cyclic = false;
    const scene: Scene = { activeChildren: () => (cyclic ? [scene] : []) };
    app.scene(scene);
    app.view({ target: host.target, scene });
    await app.start();
    cyclic = true;
    host.frame(0);
    assert.equal(app.running, false);
    assert.match(String(errors[0]), /cycle/);
    await app.dispose();
  }));

void test('navigator disposal deactivates services and callbacks before a noncooperative load settles', async () => {
  const pending = deferred<void>();
  let updates = 0,
    changes = 0;
  const nav = new SceneNavigator({
    onChange(): undefined {
      changes++;
    },
  });
  nav.add('active', {
    retain: true,
    create: () => ({
      update(): undefined {
        updates++;
      },
    }),
  });
  nav.add('loading', { create: () => ({ prepare: () => pending.promise }) });
  await nav.run('active');
  const job = nav.run('loading');
  const rejected = assert.rejects(job, { name: 'AbortError' });
  await Promise.resolve();
  const completion = nav.dispose();
  assert.equal(changes, 2);
  assert.deepEqual(nav.activeChildren(), []);
  nav.update(0, { dt: 0, time: 0 });
  assert.equal(updates, 0);
  pending.resolve();
  await rejected;
  await completion;
});

void test('fresh routed input bindings share canvas ownership until the last scene retires', () =>
  withHost(async (host) => {
    const app = createApp({ target: host.target, autoStart: false });
    app.addScene('fresh', {
      create: () => {
        const scene = new Stage2D();
        app.input(scene, { move: 'KeyD' });
        return scene;
      },
    });
    await app.run('fresh');
    const canvas = app.view.canvas as unknown as Canvas;
    await app.run('fresh');
    assert.equal(canvas.getAttribute('tabindex'), '0');
    assert.equal(canvas.style.touchAction, 'none');
    await app.dispose();
    assert.equal(canvas.getAttribute('tabindex'), null);
    assert.equal(canvas.style.touchAction, '');
    assert.equal(canvas.listenerCount, 0);
  }));
