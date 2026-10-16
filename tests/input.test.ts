import test from 'node:test';
import { ChunkStream, MemoryEdits } from '../examples/streaming/ChunkStream.js';
import { PhysicsWorld } from '../src/physics/matter.js';
import { createBoxController } from '../examples/physics/createBoxController.js';
import { TileBoard } from '../examples/TileBoard.js';
import { createTileBoard } from '../examples/createTileBoard.js';
import assert from 'node:assert/strict';
import { Rocket, Scene2D, Input } from '../src/index.js';
import type { Scene, Service } from '../src/index.js';
import { ResourceScope } from '../src/ResourceScope.js';

import { Key, Pointer, canvas, withHost } from './helpers/inputHost.js';

void test('service installation is idempotent; services snapshot before one scene update and two draws', () =>
  withHost(async (host) => {
    const calls: string[] = [];
    class Probe implements Service {
      start(): undefined {
        calls.push('start');
      }
      stop(): undefined {
        calls.push('stop');
      }
      beforeUpdate(): undefined {
        calls.push('input');
      }
      dispose(): undefined {
        calls.push('service-dispose');
      }
    }
    const app = new Rocket();
    const service = app.use(Probe);
    assert.equal(app.use(Probe), service);
    const scene = app.scene({
      update() {
        calls.push('scene');
      },
      draw() {
        calls.push('draw');
      },
      dispose() {
        calls.push('scene-dispose');
      },
    });
    app.view({ target: host.target, scene });
    app.view({ target: host.target, scene });
    await app.start();
    host.frame(0);
    app.stop();
    await app.dispose();
    assert.deepEqual(calls, [
      'start',
      'input',
      'scene',
      'draw',
      'draw',
      'stop',
      'scene-dispose',
      'service-dispose',
    ]);
  }));

void test('shared keyboard actions use frame edges, aliases, short taps and no repeat duplication', () =>
  withHost(async (host) => {
    const app = new Rocket(),
      input = app.use(Input);
    const seen: boolean[][] = [];
    const scene = app.scene(
      new Scene2D({
        update() {
          seen.push([
            controls.down('move'),
            controls.pressed('move'),
            controls.released('move'),
          ]);
        },
      }),
    );
    const controls = scene.own(
      input.scope(scene, { move: ['KeyD', 'ArrowRight'] }),
    );
    const first = controls.bind(app.view({ target: host.target, scene }));
    controls.bind(app.view({ target: host.target, scene }));
    await app.start();
    canvas(first).focus();
    const down = new Key('keydown', 'KeyD');
    canvas(first).dispatchEvent(down);
    assert.equal(down.defaultPrevented, true);
    assert.equal(controls.pressed('move'), false); // Listeners never publish directly.
    host.frame(0);
    canvas(first).dispatchEvent(new Key('keydown', 'KeyD', { repeat: true }));
    canvas(first).dispatchEvent(new Key('keydown', 'ArrowRight'));
    host.frame(16);
    canvas(first).dispatchEvent(new Key('keyup', 'KeyD'));
    host.frame(32);
    canvas(first).dispatchEvent(new Key('keyup', 'ArrowRight'));
    host.frame(48);
    canvas(first).dispatchEvent(new Key('keydown', 'KeyD'));
    canvas(first).dispatchEvent(new Key('keyup', 'KeyD'));
    host.frame(64);
    assert.deepEqual(seen, [
      [true, true, false],
      [true, false, false],
      [true, false, false],
      [false, false, true],
      [false, true, true],
    ]);
    await app.dispose();
  }));

void test('focus transfer, pause, hidden tabs, blur and view disposal clear held/queued input', () =>
  withHost(async (host) => {
    const app = new Rocket(),
      input = app.use(Input),
      scene = app.scene(new Scene2D());
    const controls = scene.own(input.scope(scene, { move: 'KeyD' }));
    const first = controls.bind(app.view({ target: host.target, scene }));
    const second = controls.bind(app.view({ target: host.target, scene }));
    await app.start();
    canvas(first).focus();
    canvas(first).dispatchEvent(new Key('keydown', 'KeyD'));
    host.frame(0);
    assert.equal(controls.down('move'), true);
    canvas(second).focus();
    host.frame(16);
    assert.equal(controls.down('move'), false);
    canvas(second).dispatchEvent(new Key('keydown', 'KeyD'));
    app.stop();
    canvas(second).dispatchEvent(new Key('keydown', 'KeyD'));
    await app.start();
    host.frame(32);
    assert.equal(controls.pressed('move'), false);
    canvas(second).dispatchEvent(new Key('keydown', 'KeyD'));
    host.document.hidden = true;
    host.document.dispatchEvent(new Event('visibilitychange'));
    host.document.hidden = false;
    host.document.dispatchEvent(new Event('visibilitychange'));
    host.frame(48);
    assert.equal(controls.down('move'), false);
    canvas(second).dispatchEvent(new Key('keydown', 'KeyD'));
    host.document.defaultView.dispatchEvent(new Event('blur'));
    host.frame(64);
    assert.equal(controls.down('move'), false);
    canvas(second).dispatchEvent(new Key('keydown', 'KeyD'));
    second.view.dispose();
    host.frame(80);
    assert.equal(controls.down('move'), false);
    assert.equal(canvas(second).listenerCount, 0);
    assert.equal(first.disposed, false);
    canvas(first).focus();
    canvas(first).dispatchEvent(new Key('keydown', 'KeyD'));
    host.frame(96);
    assert.equal(controls.down('move'), true);
    await app.dispose();
    assert.equal(canvas(first).listenerCount, 0);
    assert.equal(host.document.listenerCount, 0);
    assert.equal(host.document.defaultView.listenerCount, 0);
  }));

void test('unbound keys, shortcuts and composition keep defaults; modifier keyup cannot stick', () =>
  withHost(async (host) => {
    const app = new Rocket(),
      input = app.use(Input),
      scene = app.scene(new Scene2D());
    const controls = scene.own(input.scope(scene, { move: 'KeyD' }));
    const binding = controls.bind(app.view({ target: host.target, scene }));
    await app.start();
    for (const event of [
      new Key('keydown', 'KeyX'),
      new Key('keydown', 'KeyD', { ctrlKey: true }),
      new Key('keydown', 'KeyD', { isComposing: true }),
    ]) {
      canvas(binding).dispatchEvent(event);
      assert.equal(event.defaultPrevented, false);
    }
    host.frame(0);
    assert.equal(controls.down('move'), false);
    canvas(binding).dispatchEvent(new Key('keydown', 'KeyD'));
    host.frame(16);
    canvas(binding).dispatchEvent(new Key('keyup', 'KeyD', { ctrlKey: true }));
    host.frame(32);
    assert.equal(controls.down('move'), false);
    await app.dispose();
  }));

void test('pointer snapshots use originating view camera and CSS scaling; capture and cancellation clean up', () =>
  withHost(async (host) => {
    const app = new Rocket(),
      input = app.use(Input),
      scene = app.scene(new Scene2D());
    const controls = scene.own(input.scope(scene, {}));
    const first = controls.bind(
      app.view({ target: host.target, scene, width: 600, height: 400 }),
    );
    const second = controls.bind(
      app.view({ target: host.target, scene, width: 600, height: 400 }),
    );
    second.view.camera.x = -50;
    second.view.camera.y = 20;
    second.view.camera.zoom = 2;
    await app.start();
    canvas(second).dispatchEvent(new Pointer('pointerdown'));
    assert.equal(canvas(second).captures.size, 1);
    assert.equal(second.pointer.pressed, false);
    host.frame(0);
    assert.deepEqual(second.pointer.world, { x: 100, y: 120 });
    assert.equal(second.pointer.pressed, true);
    assert.equal(first.pointer.world, null);
    canvas(second).dispatchEvent(new Pointer('pointerup', 310, 220));
    host.frame(16);
    assert.deepEqual(second.pointer.world, { x: 250, y: 220 });
    assert.equal(second.pointer.down, false);
    assert.equal(second.pointer.released, true);
    assert.equal(canvas(second).captures.size, 0);
    host.frame(32);
    assert.equal(second.pointer.released, false);
    canvas(second).dispatchEvent(new Pointer('pointerdown'));
    canvas(second).dispatchEvent(new Pointer('pointercancel'));
    host.frame(48);
    assert.deepEqual(second.pointer, {
      world: null,
      down: false,
      pressed: false,
      released: false,
    });
    canvas(second).dispatchEvent(new Pointer('pointerdown'));
    second.view.dispose();
    assert.equal(canvas(second).captures.size, 0);
    assert.equal(canvas(second).tabIndex, -1);
    assert.equal(canvas(second).style.touchAction, '');
    await app.dispose();
  }));

void test('scene resources dispose before service; errors never abandon other resources or service cleanup', () =>
  withHost(async (host) => {
    const calls: string[] = [];
    class Probe {
      dispose(): undefined {
        calls.push('service');
      }
    }
    const app = new Rocket();
    app.use(Probe);
    const scene = app.scene(new Scene2D());
    scene.own(() => {
      calls.push('first');
    });
    scene.own(() => {
      calls.push('second');
      throw new Error('bad resource');
    });
    const view = app.view({ target: host.target, scene });
    view.own(() => {
      calls.push('view');
      throw new Error('bad view resource');
    });
    await assert.rejects(app.dispose(), AggregateError);
    assert.deepEqual(calls, ['view', 'second', 'first', 'service']);
    assert.equal(view.canvas.width, 0);
    assert.equal(view.scene, null);
    const scope = new ResourceScope();
    let count = 0;
    const resource = (): undefined => {
      count++;
    };
    scope.own(resource);
    scope.own(resource);
    scope.dispose();
    scope.dispose();
    assert.equal(count, 1);
  }));

void test('service startup rollback and suspension failure still permit complete disposal', () =>
  withHost(async (_host) => {
    const calls: string[] = [];
    class Probe {
      start(): undefined {
        throw new Error('bad start');
      }
      stop(): undefined {
        calls.push('stop');
        throw new Error('bad stop');
      }
      dispose(): undefined {
        calls.push('dispose');
      }
    }
    const app = new Rocket();
    app.use(Probe);
    await assert.rejects(app.start(), AggregateError);
    assert.equal(app.running, false);
    await app.dispose();
    assert.deepEqual(calls, ['stop', 'dispose']);
  }));

void test('inactive scenes cannot publish pending input; scene cleanup unbinds still-live views', () =>
  withHost(async (host) => {
    const app = new Rocket(),
      input = app.use(Input);
    const scene: Scene = { update() {} };
    const controls = input.scope(scene, { move: 'KeyD' });
    const other = new Rocket();
    other.scene(scene);
    const binding = controls.bind(other.view({ target: host.target, scene }));
    await app.start();
    const event = new Key('keydown', 'KeyD');
    canvas(binding).dispatchEvent(event);
    assert.equal(event.defaultPrevented, false);
    host.frame(0);
    assert.equal(controls.down('move'), false);
    controls.dispose();
    assert.equal(canvas(binding).listenerCount, 0);
    await app.dispose();
    await other.dispose();
  }));

void test('secondary pointers do not steal or cancel a primary drag; short click publishes both edges', () =>
  withHost(async (host) => {
    const app = new Rocket(),
      input = app.use(Input),
      scene = app.scene(new Scene2D());
    const controls = scene.own(input.scope(scene, {}));
    const binding = controls.bind(app.view({ target: host.target, scene }));
    await app.start();
    canvas(binding).dispatchEvent(new Pointer('pointerdown'));
    const secondary = new Pointer('pointercancel');
    secondary.pointerId = 2;
    secondary.isPrimary = false;
    canvas(binding).dispatchEvent(secondary);
    host.frame(0);
    assert.equal(binding.pointer.down, true);
    canvas(binding).dispatchEvent(new Pointer('pointerup'));
    host.frame(16);
    canvas(binding).dispatchEvent(new Pointer('pointerdown'));
    canvas(binding).dispatchEvent(new Pointer('pointerup'));
    host.frame(32);
    assert.equal(binding.pointer.pressed, true);
    assert.equal(binding.pointer.released, true);
    assert.equal(binding.pointer.down, false);
    await app.dispose();
  }));

void test('service stop during startup cancels activation instead of resurrecting the frame loop', () =>
  withHost(async (host) => {
    const app = new Rocket();
    let updates = 0;
    class Stopper {
      start(): undefined {
        app.stop();
      }
    }
    app.use(Stopper);
    const scene = app.scene({
      update() {
        updates++;
      },
    });
    app.view({ target: host.target, scene });
    await assert.rejects(app.start(), /cancelled/);
    host.frame(0);
    assert.equal(app.running, false);
    assert.equal(updates, 0);
    await app.dispose();
  }));

void test('tile edits from different cameras publish once to both views; removed view stops editing', () =>
  withHost(async (host) => {
    const app = new Rocket();
    const input = app.use(Input);
    const board = new TileBoard();
    let cleanups = 0;
    const object = createTileBoard(board, () => {
      cleanups++;
    });
    const drawn: (number | null)[] = [];
    const activeCounts: number[] = [];
    const cell = { x: -1, y: -1 };
    const scene = app.scene({
      update() {
        for (const binding of controls.views) {
          const pointer = binding.pointer;
          if (pointer.pressed && pointer.world) object.edit(pointer.world);
        }
      },
      draw() {
        drawn.push(board.get(cell));
      },
      dispose() {
        controls.dispose();
        object.node.dispose();
      },
    });
    const controls = input.scope(scene, {});
    const first = controls.bind(
      app.view({ target: host.target, scene, width: 300, height: 200 }),
    );
    const second = controls.bind(
      app.view({ target: host.target, scene, width: 300, height: 200 }),
    );
    first.view.camera.x = -166;
    first.view.camera.y = -116;
    second.view.camera.zoom = 2;
    second.view.camera.x = -91;
    second.view.camera.y = -66;
    const counterScene = app.scene({
      draw() {
        activeCounts.push(board.counts.active);
      },
    });
    const counter = app.view({ target: host.target, scene: counterScene });
    try {
      await app.start();
      for (const [index, binding] of [first, second].entries()) {
        canvas(binding).dispatchEvent(new Pointer('pointerdown'));
        canvas(binding).dispatchEvent(new Pointer('pointerup'));
        host.frame(index * 16);
        assert.equal(board.revision, index + 1);
        assert.equal(activeCounts.at(-1), 1);
        assert.deepEqual(drawn.slice(-2), [index + 1, index + 1]);
      }
      second.view.dispose();
      assert.equal(canvas(second).listenerCount, 0);
      canvas(second).dispatchEvent(new Pointer('pointerdown'));
      canvas(second).dispatchEvent(new Pointer('pointerup'));
      host.frame(32);
      assert.equal(board.revision, 2);
      assert.equal(cleanups, 0);
      assert.equal(activeCounts.at(-1), 1);
      canvas(first).dispatchEvent(new Pointer('pointerdown'));
      canvas(first).dispatchEvent(new Pointer('pointerup'));
      host.frame(48);
      assert.equal(board.revision, 3);
      assert.equal(drawn.at(-1), 0);
      assert.equal(activeCounts.at(-1), 0);
      await app.dispose();
      assert.equal(cleanups, 1);
      assert.equal(counter.disposed, true);
      assert.equal(board.get(cell), 0);
    } finally {
      await app.dispose();
    }
  }));

void test('fixed input buffers zero-step frames and delivers short key/pointer taps only once during catch-up', () =>
  withHost(async (host) => {
    const app = new Rocket({ fixed: { step: 0.01, maxSteps: 3 } });
    const input = app.use(Input);
    const ticks: boolean[][] = [],
      frames: boolean[] = [];
    const scene = app.scene(
      new Scene2D({
        fixedUpdate() {
          ticks.push([
            controls.fixed.down('jump'),
            controls.fixed.pressed('jump'),
            controls.fixed.released('jump'),
            binding.fixedPointer.down,
            binding.fixedPointer.pressed,
            binding.fixedPointer.released,
          ]);
        },
        update() {
          frames.push(controls.pressed('jump'));
        },
      }),
    );
    const controls = scene.own(input.scope(scene, { jump: 'Space' }));
    const binding = controls.bind(app.view({ target: host.target, scene }));
    try {
      await app.start();
      host.frame(0);
      canvas(binding).focus();
      canvas(binding).dispatchEvent(new Key('keydown', 'Space'));
      canvas(binding).dispatchEvent(new Key('keyup', 'Space'));
      canvas(binding).dispatchEvent(new Pointer('pointerdown'));
      canvas(binding).dispatchEvent(new Pointer('pointerup'));
      host.frame(4);
      host.frame(8);
      assert.deepEqual(frames, [false, true, false]);
      assert.equal(ticks.length, 0);
      host.frame(35);
      assert.deepEqual(ticks, [
        [false, true, true, false, true, true],
        [false, false, false, false, false, false],
        [false, false, false, false, false, false],
      ]);
      host.frame(1000); // Dropped overload steps must not replay consumed edges.
      assert.deepEqual(
        ticks.slice(-3),
        Array.from({ length: 3 }, () => [
          false,
          false,
          false,
          false,
          false,
          false,
        ]),
      );
    } finally {
      await app.dispose();
    }
  }));

void test('fixed held actions persist across steps, while pause, blur and view cleanup discard queued edges', () =>
  withHost(async (host) => {
    const app = new Rocket({ fixed: { step: 0.01 } });
    const input = app.use(Input),
      seen: boolean[][] = [];
    const scene = app.scene(
      new Scene2D({
        fixedUpdate() {
          seen.push([
            controls.fixed.down('move'),
            controls.fixed.pressed('move'),
          ]);
        },
      }),
    );
    const controls = scene.own(input.scope(scene, { move: 'KeyD' }));
    const first = controls.bind(app.view({ target: host.target, scene }));
    const second = controls.bind(app.view({ target: host.target, scene }));
    try {
      await app.start();
      host.frame(0);
      canvas(first).focus();
      canvas(first).dispatchEvent(new Key('keydown', 'KeyD'));
      host.frame(25);
      assert.deepEqual(seen, [
        [true, true],
        [true, false],
      ]);
      canvas(second).focus(); // Clears held and queued keys before another step.
      host.frame(30);
      assert.deepEqual(seen.at(-1), [false, false]);
      canvas(second).dispatchEvent(new Key('keydown', 'KeyD'));
      host.frame(34);
      app.stop();
      await app.start();
      host.frame(1000);
      host.frame(1010);
      assert.deepEqual(seen.at(-1), [false, false]);
      canvas(second).dispatchEvent(new Key('keydown', 'KeyD'));
      host.frame(1014);
      second.view.dispose();
      host.frame(1020);
      assert.deepEqual(seen.at(-1), [false, false]);
    } finally {
      await app.dispose();
    }
  }));

void test('fixed input controls physics once per edge, before the solver, through catch-up and blur', () =>
  withHost(async (host) => {
    const app = new Rocket({ fixed: { maxSteps: 3 } });
    const world = new PhysicsWorld();
    const body = world.rectangle(0, 0, 20, 20);
    const input = app.use(Input);
    const scene = app.scene(
      new Scene2D({
        fixedUpdate(dt) {
          controller.update();
          world.step(dt);
        },
      }),
    );
    scene.own(world);
    const controls = scene.own(
      input.scope(scene, { left: 'KeyA', right: 'KeyD', boost: 'Space' }),
    );
    const controller = createBoxController(body, controls.fixed);
    const binding = controls.bind(app.view({ target: host.target, scene }));
    const diagnostics = app.view({
      target: host.target,
      scene: app.scene({ draw() {} }),
    });
    try {
      await app.start();
      host.frame(0);
      canvas(binding).focus();
      canvas(binding).dispatchEvent(new Key('keydown', 'KeyD'));
      canvas(binding).dispatchEvent(new Key('keydown', 'Space'));
      canvas(binding).dispatchEvent(new Key('keyup', 'Space'));
      host.frame(4); // no solver step; edge must be retained
      assert.equal(world.stats.steps, 0);
      host.frame(55); // three solver steps; one boost edge
      assert.equal(world.stats.steps, 3);
      assert.equal(controller.boosts, 1);
      assert.ok(body.pose.x > 7);
      assert.ok(body.pose.y < -10);
      host.frame(1000);
      assert.equal(controller.boosts, 1);
      assert.equal(world.stats.steps, 6);
      canvas(binding).dispatchEvent(new Event('blur'));
      host.frame(1020);
      assert.ok(Math.abs(body.velocity.x) < 1e-9);
      await app.dispose();
      assert.equal(canvas(binding).listenerCount, 0);
      assert.equal(body.disposed, true);
      assert.equal(world.stats.cachedPairs, 0);
      assert.equal(world.stats.cachedBodies, 0);
      assert.equal(world.stats.listeners, 0);
      assert.equal(diagnostics.disposed, true);
      controller.update(); // removed body never receives a stale command
      assert.equal(controller.boosts, 1);
    } finally {
      await app.dispose();
    }
  }));

void test('two demand views pan independently; closing each releases its input scope and demand without erasing edits', () =>
  withHost(async (host) => {
    const app = new Rocket(),
      input = app.use(Input),
      edits = new MemoryEdits();
    const stream = new ChunkStream(edits, 4, 0);
    let updates = 0;
    const scene = app.scene(
      new Scene2D({
        update() {
          updates++;
          for (const entry of entries) {
            if (entry.view.disposed) continue;
            if (entry.controls.down('right')) entry.view.camera.x += 8;
            entry.demand.set({
              minX: entry.view.camera.x,
              minY: 0,
              maxX: entry.view.camera.x + 8,
              maxY: 8,
            });
          }
          stream.advance(4);
        },
      }),
    );
    scene.own(stream);
    function entry(x: number) {
      const view = app.view({ target: host.target, scene });
      view.camera.x = x;
      const demand = view.own(stream.createDemand());
      const controls = view.own(input.scope(scene, { right: 'KeyD' }));
      const binding = controls.bind(view);
      return { view, demand, controls, binding };
    }
    const first = entry(0),
      second = entry(80),
      entries = [first, second];
    const observer = app.view({
      target: host.target,
      scene: app.scene({ draw() {} }),
    });
    try {
      await app.start();
      host.frame(0);
      assert.equal(updates, 1);
      assert.equal(stream.stats.owners, 2);
      canvas(second.binding).focus();
      canvas(second.binding).dispatchEvent(new Key('keydown', 'KeyD'));
      host.frame(16);
      assert.equal(first.view.camera.x, 0);
      assert.equal(second.view.camera.x, 88);
      stream.cycle({ x: 0, y: 0 });
      assert.equal(edits.stats.cells, 1);
      first.view.dispose();
      assert.equal(canvas(first.binding).listenerCount, 0);
      assert.equal(first.controls.views.length, 0);
      assert.equal(stream.stats.owners, 1);
      assert.equal(stream.read({ x: 88, y: 0 }).state, 'ready');
      host.frame(32);
      assert.equal(second.view.camera.x, 96);
      second.view.dispose();
      host.frame(48);
      assert.equal(canvas(second.binding).listenerCount, 0);
      assert.equal(stream.stats.owners, 0);
      assert.equal(stream.stats.retained, 0);
      assert.equal(edits.stats.cells, 1);
      assert.equal(observer.disposed, false);
      assert.throws(() => second.controls.bind(second.view), /disposed/);
      await app.dispose();
      assert.equal(stream.stats.disposed, true);
    } finally {
      await app.dispose();
    }
  }));
