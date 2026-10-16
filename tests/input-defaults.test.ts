import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Rocket,
  Scene2D,
  Input,
  firstPersonInput,
  topDownInput,
  platformerInput,
  beltScrollerInput,
  flightInput,
} from '../src/index.js';
import { Key, withHost } from './helpers/inputHost.js';

for (const [name, preset] of Object.entries({
  firstPersonInput,
  topDownInput,
  platformerInput,
  beltScrollerInput,
  flightInput,
})) {
  void test(`${name}: F interacts, Tab emits one health intent and UI context retains normal Tab handling`, () =>
    withHost(async (host) => {
      const app = new Rocket(),
        scene = app.scene(new Scene2D());
      const controls = app.use(Input).actions(scene).use(preset);
      let interactions = 0,
        health = 0;
      controls.on('interact', () => {
        interactions++;
      });
      controls.on('health', () => {
        health++;
      });
      const view = app.view({ target: host.target, scene });
      controls.bind(view, { capture: 'focus' });
      view.canvas.focus();
      await app.start();
      view.canvas.dispatchEvent(new Key('keydown', 'KeyF'));
      view.canvas.dispatchEvent(new Key('keyup', 'KeyF'));
      const tab = new Key('keydown', 'Tab');
      view.canvas.dispatchEvent(tab);
      assert.equal(
        tab.defaultPrevented,
        true,
        'game Tab does not move DOM focus',
      );
      host.frame(0);
      assert.equal(interactions, 1);
      assert.equal(health, 1);
      view.canvas.dispatchEvent(new Key('keydown', 'Tab', { repeat: true }));
      host.frame(16);
      assert.equal(health, 1);
      controls.setEnabled(false);
      const uiTab = new Key('keydown', 'Tab');
      view.canvas.dispatchEvent(uiTab);
      assert.equal(
        uiTab.defaultPrevented,
        false,
        'disabled game bindings leave UI navigation alone',
      );
      view.canvas.dispatchEvent(new Key('keydown', 'KeyF'));
      host.frame(32);
      assert.equal(interactions, 1);
      assert.equal(health, 1);
      await app.dispose();
    }));
}
for (const [name, preset] of Object.entries({
  platformerInput,
  beltScrollerInput,
})) {
  void test(`${name}: Right Ctrl attacks without jumping or sprinting; Left Ctrl stays separate`, () =>
    withHost(async (host) => {
      const app = new Rocket(),
        scene = app.scene(new Scene2D());
      const controls = app.use(Input).actions(scene).use(preset);
      let attacks = 0,
        jumps = 0;
      controls.on('attack', () => {
        attacks++;
      });
      controls.on('jump', () => {
        jumps++;
      });
      const view = app.view({ target: host.target, scene });
      controls.bind(view);
      view.canvas.focus();
      await app.start();
      view.canvas.dispatchEvent(
        new Key('keydown', 'ControlRight', { ctrlKey: true }),
      );
      view.canvas.dispatchEvent(
        new Key('keydown', 'ArrowRight', { ctrlKey: true }),
      );
      host.frame(0);
      assert.equal(attacks, 1);
      assert.equal(jumps, 0);
      assert.equal(controls.value('sprint'), 0);
      assert.equal(
        controls.value('horizontal'),
        1,
        'can move while holding attack modifier',
      );
      view.canvas.dispatchEvent(new Key('keyup', 'ControlRight'));
      view.canvas.dispatchEvent(
        new Key('keydown', 'ControlLeft', { ctrlKey: true }),
      );
      host.frame(16);
      assert.equal(attacks, 1);
      view.canvas.dispatchEvent(new Key('keyup', 'ControlLeft'));
      view.canvas.dispatchEvent(new Key('keydown', 'Space'));
      host.frame(32);
      assert.equal(jumps, 1);
      assert.equal(attacks, 1);
      view.canvas.dispatchEvent(
        Object.assign(new Event('mousedown', { cancelable: true }), {
          button: 0,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          metaKey: false,
        }),
      );
      host.frame(48);
      assert.equal(attacks, 2, 'left mouse is an alternative attack binding');
      await app.dispose();
    }));
}
void test('top-down Space fires; flight Left Alt lifts independently of Space fire and Ctrl down', () =>
  withHost(async (host) => {
    const app = new Rocket(),
      scene = app.scene(new Scene2D());
    const flight = app.use(Input).actions(scene).use(flightInput);
    const view = app.view({ target: host.target, scene });
    flight.bind(view);
    view.canvas.focus();
    await app.start();
    view.canvas.dispatchEvent(new Key('keydown', 'Space'));
    host.frame(0);
    assert.equal(flight.value('fire'), 1);
    assert.equal(flight.value('up'), 0);
    view.canvas.dispatchEvent(
      Object.assign(new Key('keydown', 'AltLeft'), { altKey: true }),
    );
    host.frame(16);
    assert.equal(flight.value('up'), 1);
    assert.equal(flight.value('fire'), 1);
    view.canvas.dispatchEvent(new Key('keyup', 'AltLeft'));
    view.canvas.dispatchEvent(
      new Key('keydown', 'ControlRight', { ctrlKey: true }),
    );
    host.frame(32);
    assert.equal(flight.value('up'), -1);
    await app.stop();
    flight.dispose();
    const topDown = app.use(Input).actions(scene).use(topDownInput);
    topDown.bind(view);
    topDown.activate();
    await app.start();
    const selectionClick = Object.assign(
      new Event('mousedown', { cancelable: true }),
      {
        button: 0,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        metaKey: false,
      },
    );
    view.canvas.dispatchEvent(selectionClick);
    host.frame(48);
    assert.equal(topDown.value('fire'), 0, 'default left click never fires');
    assert.equal(
      selectionClick.defaultPrevented,
      false,
      'unbound mouse event remains available to game selection',
    );
    view.canvas.dispatchEvent(new Key('keydown', 'Space'));
    host.frame(64);
    assert.equal(topDown.value('fire'), 1);
    await app.dispose();
  }));
