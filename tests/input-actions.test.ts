import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Rocket,
  Scene2D,
  Input,
  firstPersonInput,
  topDownInput,
} from '../src/index.js';
import type { ActionEvent, ActionHandler } from '../src/index.js';
import { Key, Pointer, withHost } from './helpers/inputHost.js';

void test('top-down preset dispatches frame actions, aliases, opposing axes, hold cancellation and runtime remapping', () =>
  withHost(async (host) => {
    const app = new Rocket(),
      scene = app.scene(new Scene2D()),
      controls = app.use(Input).actions(scene).use(topDownInput);
    const events: ActionEvent[] = [];
    controls.on('sprint', (event) => {
      events.push(event);
    });
    let interactions = 0;
    controls.on('interact', () => {
      interactions++;
    });
    const view = app.view({ target: host.target, scene });
    controls.bind(view);
    view.canvas.focus();
    await app.start();
    view.canvas.dispatchEvent(new Key('keydown', 'KeyW'));
    host.frame(0);
    assert.equal(controls.value('north'), 1);
    view.canvas.dispatchEvent(new Key('keydown', 'KeyS'));
    host.frame(16);
    assert.equal(controls.value('north'), 0);
    view.canvas.dispatchEvent(new Key('keyup', 'KeyW'));
    host.frame(32);
    assert.equal(controls.value('north'), -1);
    view.canvas.dispatchEvent(new Key('keydown', 'ShiftLeft'));
    host.frame(48);
    assert.equal(events.at(-1)!.value, 1);
    controls.setEnabled(false);
    assert.equal(events.at(-1)!.cancelled, true);
    assert.equal(controls.value('north'), 0);
    view.canvas.dispatchEvent(new Key('keydown', 'KeyF'));
    host.frame(64);
    assert.equal(interactions, 0);
    controls.setEnabled(true);
    controls.setEnabled(true);
    controls.activate();
    view.canvas.dispatchEvent(new Key('keydown', 'KeyF'));
    view.canvas.dispatchEvent(new Key('keyup', 'KeyF'));
    host.frame(80);
    assert.equal(interactions, 1);
    controls.map('interact', 'KeyG');
    view.canvas.dispatchEvent(new Key('keydown', 'KeyF'));
    host.frame(96);
    assert.equal(interactions, 1);
    view.canvas.dispatchEvent(new Key('keydown', 'KeyG'));
    host.frame(112);
    assert.equal(interactions, 2);
    assert.throws(
      () => controls.map('north', { negative: 'KeyS', positive: [] }),
      /Empty/,
    );
    view.canvas.dispatchEvent(new Key('keydown', 'KeyW'));
    host.frame(128);
    assert.equal(controls.value('north'), 1);
    // Explicit custom mouse mapping tests routing; the default leaves it unbound.
    controls.map('fire', 'Mouse0');
    const pointerDown = new Pointer('pointerdown');
    view.canvas.dispatchEvent(pointerDown);
    assert.equal(
      pointerDown.defaultPrevented,
      false,
      'mouse action bindings must not suppress browser compatibility mouse events',
    );
    view.canvas.dispatchEvent(
      Object.assign(new Event('mousedown', { cancelable: true }), {
        button: 0,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      }),
    );
    host.frame(144);
    assert.equal(controls.value('fire'), 1);
    host.document.dispatchEvent(
      Object.assign(new Event('mouseup', { cancelable: true }), {
        button: 0,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      }),
    );
    host.frame(160);
    assert.equal(controls.value('fire'), 0);
    view.canvas.dispatchEvent(new Key('keydown', 'KeyW'));
    host.frame(176);
    assert.equal(controls.value('north'), 1);
    host.document.defaultView.dispatchEvent(new Event('blur'));
    assert.equal(controls.value('north'), 0);
    await app.dispose();
    assert.throws(() => controls.value('north'), /disposed/);
  }));
void test('first-person preset uses explicit capture by default, chord precedence and exact event-time edges', () =>
  withHost(async (host) => {
    const app = new Rocket(),
      scene = app.scene(new Scene2D()),
      controls = app.use(Input).actions(scene).use(firstPersonInput);
    const events: ActionEvent[] = [];
    for (const name of ['reload', 'reset', 'fire'])
      controls.on(name, (event) => {
        events.push(event);
      });
    const view = app.view({ target: host.target, scene });
    const doc = Object.assign(host.document, {
      pointerLockElement: null as HTMLCanvasElement | null,
      exitPointerLock() {
        this.pointerLockElement = null;
        host.document.dispatchEvent(new Event('pointerlockchange'));
      },
    });
    Object.assign(view.canvas, {
      requestPointerLock() {
        doc.pointerLockElement = view.canvas;
        doc.dispatchEvent(new Event('pointerlockchange'));
        return Promise.resolve();
      },
    });
    const binding = controls.bind(view);
    assert.ok(binding.capture);
    await app.start();
    view.canvas.dispatchEvent(new Event('click'));
    await Promise.resolve();
    assert.equal(binding.capture!.active, true);
    doc.dispatchEvent(new Key('keydown', 'ControlLeft', { ctrlKey: true }));
    doc.dispatchEvent(new Key('keydown', 'KeyR', { ctrlKey: true }));
    host.frame(0);
    assert.equal(events.filter((e) => e.action === 'reset').length, 1);
    assert.equal(events.filter((e) => e.action === 'reload').length, 0);
    doc.dispatchEvent(new Key('keyup', 'ControlLeft'));
    host.frame(16);
    assert.equal(events.filter((e) => e.action === 'reload').length, 0);
    doc.dispatchEvent(new Key('keyup', 'KeyR'));
    doc.dispatchEvent(new Key('keydown', 'KeyR'));
    doc.dispatchEvent(new Key('keyup', 'KeyR'));
    host.frame(32);
    assert.equal(events.filter((e) => e.action === 'reload').length, 1);
    doc.dispatchEvent(
      Object.assign(new Event('mousemove'), { movementX: 10, movementY: -5 }),
    );
    host.frame(48);
    assert.equal(controls.value('lookX'), 0.03);
    assert.equal(controls.value('lookY'), -0.015);
    host.frame(64);
    assert.equal(controls.value('lookX'), 0);
    const mouse = (type: string) =>
      doc.dispatchEvent(
        Object.assign(new Event(type, { cancelable: true }), {
          button: 0,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          metaKey: false,
        }),
      );
    mouse('mousedown');
    host.frame(80);
    assert.equal(controls.value('fire'), 1);
    mouse('mouseup');
    host.frame(96);
    assert.equal(controls.value('fire'), 0);
    mouse('mousedown');
    mouse('mouseup');
    host.frame(112);
    assert.deepEqual(
      events
        .filter((e) => e.action === 'fire')
        .slice(-2)
        .map((e) => e.value),
      [1, 0],
    );
    doc.dispatchEvent(new Key('keydown', 'KeyW'));
    host.frame(128);
    binding.capture!.release();
    host.frame(144);
    assert.equal(controls.value('forward'), 0);
    await app.dispose();
  }));
void test('registry validation is explicit and contexts cancel on scene changes, disposal and handler failures', () =>
  withHost(async (host) => {
    const app = new Rocket(),
      scene = app.scene(new Scene2D()),
      input = app.use(Input),
      controls = input.actions(scene);
    controls.register('go', 'hold').map('go', 'KeyW');
    assert.throws(() => controls.register('go', 'press'), /duplicate/);
    assert.throws(() => controls.map('missing', 'KeyR'), /Unknown/);
    assert.throws(
      () => controls.on('go', (async () => {}) as unknown as ActionHandler),
      /synchronous/,
    );
    assert.throws(() => controls.map('go', { pointer: 'x' }), /Invalid/);
    assert.throws(
      () => controls.map('go', { negative: 'KeyS', positive: 'KeyW' }),
      /Button/,
    );
    const view = app.view({ target: host.target, scene });
    controls.bind(view, { capture: 'focus' });
    assert.throws(() => controls.bind(view), /One viewport/);
    assert.throws(() => controls.use(topDownInput), /before binding/);
    view.canvas.focus();
    await app.start();
    let cancelled = false;
    controls.on('go', (event) => {
      if (event.cancelled) cancelled = true;
    });
    view.canvas.dispatchEvent(new Key('keydown', 'KeyW'));
    host.frame(0);
    controls.update(0.016, false);
    assert.equal(cancelled, true);
    view.canvas.dispatchEvent(new Key('keyup', 'KeyW'));
    host.frame(16);
    view.canvas.dispatchEvent(new Key('keydown', 'KeyW'));
    host.frame(32);
    controls.on('go', () => {
      throw new Error('handler failure');
    });
    assert.throws(() => controls.setEnabled(false), /cancellation/);
    assert.equal(controls.enabled, false);
    controls.dispose();
    controls.dispose();
    await app.dispose();
  }));
