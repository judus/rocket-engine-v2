import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Rocket,
  Scene2D,
  Input,
  platformerInput,
  flightInput,
  firstPersonInput,
  topDownInput,
  beltScrollerInput,
  virtualInputLayouts,
  virtualCornerLayouts,
  createVirtualCornerPreset,
} from '../src/index.js';
import type { ActionEvent, VirtualLayout } from '../src/index.js';
import { Target, Key, withHost } from './helpers/inputHost.js';

class Element extends Target {
  children: Element[] = [];
  style: Record<string, unknown> & {
    setProperty: (name: string, value: string) => void;
  } = {
    setProperty(name: string, value: string) {
      this[name] = value;
    },
  };
  attributes = new Map<string, string>();
  captures = new Set<number>();
  className = '';
  textContent = '';
  type = '';
  removed = false;
  constructor(
    readonly ownerDocument: Document,
    readonly tag = 'div',
  ) {
    super();
  }
  append(...children: Element[]) {
    this.children.push(...children);
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  getAttribute(name: string) {
    return this.attributes.get(name);
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
  setPointerCapture(id: number) {
    this.captures.add(id);
  }
  hasPointerCapture(id: number) {
    return this.captures.has(id);
  }
  releasePointerCapture(id: number) {
    this.captures.delete(id);
  }
  remove() {
    this.removed = true;
  }
}
function pointer(
  type: string,
  id: number,
  x = 50,
  y = 50,
  pointerType = 'touch',
  button = 0,
) {
  return Object.assign(new Event(type, { cancelable: true }), {
    pointerId: id,
    clientX: x,
    clientY: y,
    pointerType,
    button,
  });
}

void test('device action sources compose with keys, preserve taps, cancel and dispose without stuck input', () =>
  withHost(async (host) => {
    const app = new Rocket(),
      scene = app.scene(new Scene2D());
    const controls = app.use(Input).actions(scene).use(platformerInput);
    const view = app.view({ target: host.target, scene });
    controls.bind(view);
    const events: ActionEvent[] = [];
    controls.on('sprint', (event) => {
      events.push(event);
    });
    let jumps = 0;
    controls.on('jump', () => {
      jumps++;
    });
    const a = controls.source(),
      b = controls.source();
    assert.throws(() => a.set('unknown', 1), /Unknown/);
    assert.throws(() => a.set('horizontal', NaN), /normalized/);
    assert.throws(() => a.set('jump', -1), /normalized/);
    a.set('horizontal', 1); // before startup is ignored
    await app.start();
    host.frame(0);
    assert.equal(controls.value('horizontal'), 0);
    a.set('horizontal', 0.5);
    b.set('horizontal', 0.8);
    host.frame(16);
    assert.equal(controls.value('horizontal'), 1);
    b.set('horizontal', -0.5);
    host.frame(32);
    assert.equal(controls.value('horizontal'), 0);
    b.release();
    host.frame(48);
    assert.equal(controls.value('horizontal'), 0.5);
    view.canvas.focus();
    view.canvas.dispatchEvent(new Key('keydown', 'KeyD'));
    host.frame(64);
    assert.equal(controls.value('horizontal'), 1);
    a.set('jump', 1);
    a.release();
    host.frame(80);
    assert.equal(jumps, 1);
    a.set('sprint', 1);
    a.release();
    host.frame(96);
    assert.deepEqual(
      events.slice(-2).map((e) => e.value),
      [1, 0],
    );
    a.set('sprint', 1);
    b.set('sprint', 1);
    host.frame(112);
    a.release();
    host.frame(128);
    assert.equal(controls.value('sprint'), 1);
    controls.setEnabled(false);
    assert.equal(events.at(-1)!.cancelled, true);
    b.set('sprint', 1);
    controls.setEnabled(true);
    host.frame(144);
    assert.equal(controls.value('sprint'), 0);
    a.set('horizontal', 1);
    host.frame(160);
    host.document.defaultView.dispatchEvent(new Event('blur'));
    assert.equal(controls.value('horizontal'), 0);
    host.frame(176);
    a.set('horizontal', 1);
    controls.map('horizontal', { negative: 'KeyA', positive: 'KeyD' });
    host.frame(192);
    assert.equal(controls.value('horizontal'), 0);
    a.set('jump', 1);
    controls.update(0.016, false);
    controls.update(0.016, true);
    assert.equal(jumps, 1, 'inactive scene clears pending taps');
    a.dispose();
    a.dispose();
    assert.throws(() => a.set('jump', 1), /disposed/);
    await app.dispose();
    assert.throws(() => b.set('jump', 1), /disposed/);
  }));

void test('virtual flight supports simultaneous pointers, radial dead zone, cancellation and cleanup', () =>
  withHost(async (host) => {
    const original = host.document.createElement.bind(host.document);
    Object.defineProperty(host.document, 'createElement', {
      value: (tag: string) =>
        tag === 'canvas'
          ? original()
          : new Element(host.document as unknown as Document, tag),
    });
    const target = new Element(host.document as unknown as Document);
    const app = new Rocket(),
      scene = app.scene(new Scene2D());
    const controls = app.use(Input).actions(scene).use(flightInput);
    assert.throws(
      () =>
        controls.virtual({
          target: target as unknown as HTMLElement,
          ...virtualInputLayouts.flight,
        }),
      /Bind/,
    );
    const view = app.view({ target: host.target, scene });
    controls.bind(view);
    assert.throws(
      () =>
        controls.virtual({
          target: new Element({} as Document) as unknown as HTMLElement,
          ...virtualInputLayouts.flight,
        }),
      /document/,
    );
    const mount = (layout: VirtualLayout) =>
      controls.virtual({ target: target as unknown as HTMLElement, ...layout });
    assert.throws(
      () => mount({ sticks: [{ label: 'Bad' }], buttons: [] }),
      /Stick/,
    );
    assert.throws(
      () =>
        mount({
          sticks: [{ label: 'Bad', x: 'right', deadZone: 1 }],
          buttons: [],
        }),
      /Stick/,
    );
    assert.throws(
      () => mount({ sticks: [{ label: 'Bad', x: 'fire' }], buttons: [] }),
      /axis/,
    );
    assert.throws(
      () =>
        mount({
          sticks: [],
          buttons: [{ label: 'Bad', action: 'fire', value: -1 }],
        }),
      /Invalid/,
    );
    const controller = mount(virtualInputLayouts.flight);
    const root = controller.element as unknown as Element;
    const click = new Event('click', { cancelable: true });
    root.dispatchEvent(click);
    assert.equal(
      click.defaultPrevented,
      true,
      'compatibility click is consumed by the controller only',
    );
    const [thrust, rotate, buttons] = root.children;
    const up = buttons!.children[0]!,
      down = buttons!.children[1]!,
      fire = buttons!.children[5]!;
    await app.start();
    host.frame(0);
    thrust!.dispatchEvent(pointer('pointerdown', 1, 51, 50));
    host.frame(16);
    assert.equal(controls.value('right'), 0, 'dead zone');
    thrust!.dispatchEvent(pointer('pointermove', 1, 90, 10));
    rotate!.dispatchEvent(pointer('pointerdown', 2, 90, 50));
    fire.dispatchEvent(pointer('pointerdown', 3));
    host.frame(32);
    assert.ok(Math.abs(controls.value('right') - Math.SQRT1_2) < 1e-8);
    assert.ok(controls.value('forward') > 0);
    assert.equal(controls.value('yaw'), 1);
    assert.equal(controls.value('fire'), 1);
    // A second finger cannot steal the first pad's capture.
    thrust!.dispatchEvent(pointer('pointerdown', 9, 10, 50));
    thrust!.dispatchEvent(pointer('pointerup', 9));
    host.frame(48);
    assert.ok(controls.value('right') > 0);
    thrust!.dispatchEvent(pointer('pointerup', 1));
    host.frame(64);
    assert.equal(controls.value('right'), 0);
    assert.equal(controls.value('fire'), 1);
    assert.equal(controls.value('yaw'), 1);
    rotate!.dispatchEvent(pointer('pointercancel', 2));
    fire.dispatchEvent(pointer('lostpointercapture', 3));
    host.frame(80);
    assert.equal(controls.value('yaw'), 0);
    assert.equal(controls.value('fire'), 0);
    up.dispatchEvent(pointer('pointerdown', 4));
    down.dispatchEvent(pointer('pointerdown', 5));
    host.frame(96);
    assert.equal(controls.value('up'), 0);
    down.dispatchEvent(pointer('pointerup', 5));
    host.frame(112);
    assert.equal(controls.value('up'), 1);
    host.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(controls.value('up'), 0);
    assert.equal(up.captures.size, 0);
    assert.equal(up.getAttribute('aria-pressed'), 'false');
    up.dispatchEvent(pointer('pointermove', 4));
    host.frame(128);
    assert.equal(controls.value('up'), 0);
    fire.dispatchEvent(pointer('pointerdown', 7, 50, 50, 'mouse', 2));
    host.frame(144);
    assert.equal(controls.value('fire'), 0);
    fire.dispatchEvent(new Key('keydown', 'Space'));
    host.frame(160);
    assert.equal(controls.value('fire'), 1);
    fire.dispatchEvent(new Key('keyup', 'Space'));
    host.frame(176);
    assert.equal(controls.value('fire'), 0);
    fire.dispatchEvent(new Key('keydown', 'KeyF'));
    fire.dispatchEvent(new Event('blur'));
    up.dispatchEvent(pointer('pointerdown', 8));
    host.frame(192);
    controls.setEnabled(false);
    up.dispatchEvent(pointer('pointerdown', 10));
    controls.setEnabled(true);
    host.frame(208);
    assert.equal(controls.value('up'), 0);
    await app.stop();
    up.dispatchEvent(pointer('pointerdown', 11));
    await app.start();
    host.frame(224);
    assert.equal(controls.value('up'), 0);
    view.dispose();
    assert.equal(root.removed, true);
    assert.equal(up.listenerCount, 0);
    controller.dispose();
    await app.dispose();
  }));

void test('all touch layouts bind actual preset actions; short jump/attack taps survive release', () =>
  withHost(async (host) => {
    const original = host.document.createElement.bind(host.document);
    Object.defineProperty(host.document, 'createElement', {
      value: (tag: string) =>
        tag === 'canvas'
          ? original()
          : new Element(host.document as unknown as Document, tag),
    });
    const presets = {
      'first-person': firstPersonInput,
      'top-down': topDownInput,
      platformer: platformerInput,
      'belt-scroller': beltScrollerInput,
      flight: flightInput,
    };
    for (const name of Object.keys(presets) as (keyof typeof presets)[]) {
      const app = new Rocket(),
        scene = app.scene(new Scene2D());
      const controls = app.use(Input).actions(scene).use(presets[name]);
      const view = app.view({ target: host.target, scene });
      controls.bind(view, { capture: 'focus' });
      const target = new Element(host.document as unknown as Document);
      const controller = controls.virtual({
        target: target as unknown as HTMLElement,
        ...virtualInputLayouts[name],
      });
      const root = controller.element as unknown as Element;
      const buttonGroup = root.children.at(-1)!;
      let presses = 0;
      for (const action of controls.names)
        if (controls.kind(action) === 'press')
          controls.on(action, () => {
            presses++;
          });
      await app.start();
      host.frame(0);
      for (const [i, spec] of virtualInputLayouts[name].buttons.entries()) {
        if (controls.kind(spec.action) !== 'press') continue;
        buttonGroup.children[i]!.dispatchEvent(pointer('pointerdown', 1));
        buttonGroup.children[i]!.dispatchEvent(pointer('pointerup', 1));
      }
      host.frame(16);
      assert.equal(
        presses,
        virtualInputLayouts[name].buttons.filter(
          (spec) => controls.kind(spec.action) === 'press',
        ).length,
      );
      await app.dispose();
      assert.equal(root.removed, true);
    }
  }));

void test('games compose independent stick and button containers in separate DOM regions', () =>
  withHost(async (host) => {
    const original = host.document.createElement.bind(host.document);
    Object.defineProperty(host.document, 'createElement', {
      value: (tag: string) =>
        tag === 'canvas'
          ? original()
          : new Element(host.document as unknown as Document, tag),
    });
    const app = new Rocket(),
      scene = app.scene(new Scene2D());
    const controls = app.use(Input).actions(scene).use(platformerInput);
    const view = app.view({ target: host.target, scene });
    controls.bind(view);
    const left = new Element(host.document as unknown as Document),
      right = new Element(host.document as unknown as Document);
    const stick = controls.virtual({
      target: left as unknown as HTMLElement,
      sticks: [{ label: 'Move', x: 'horizontal' }],
    });
    const buttons = controls.virtual({
      target: right as unknown as HTMLElement,
      buttons: [{ label: 'Run', action: 'sprint' }],
    });
    const pad = (stick.element as unknown as Element).children[0]!;
    const run = (buttons.element as unknown as Element).children[0]!
      .children[0]!;
    await app.start();
    host.frame(0);
    pad.dispatchEvent(pointer('pointerdown', 1, 90, 50));
    run.dispatchEvent(pointer('pointerdown', 2));
    host.frame(16);
    assert.equal(controls.value('horizontal'), 1);
    assert.equal(controls.value('sprint'), 1);
    buttons.dispose();
    host.frame(32);
    assert.equal(controls.value('sprint'), 0);
    assert.equal(controls.value('horizontal'), 1);
    await app.dispose();
    assert.equal((stick.element as unknown as Element).removed, true);
  }));

void test('digital pads emit exact directions while analog pads retain proportional travel', () =>
  withHost(async (host) => {
    const original = host.document.createElement.bind(host.document);
    Object.defineProperty(host.document, 'createElement', {
      value: (tag: string) =>
        tag === 'canvas'
          ? original()
          : new Element(host.document as unknown as Document, tag),
    });
    const app = new Rocket(),
      scene = app.scene(new Scene2D());
    const controls = app.use(Input).actions(scene).use(flightInput);
    const view = app.view({ target: host.target, scene });
    controls.bind(view);
    const target = new Element(host.document as unknown as Document);
    const analog = controls.virtual({
      target: target as unknown as HTMLElement,
      sticks: [{ label: 'Analog', x: 'right', y: 'forward' }],
    });
    const digital = controls.virtual({
      target: target as unknown as HTMLElement,
      sticks: [
        {
          label: 'Digital',
          x: 'yaw',
          y: 'pitch',
          mode: 'digital',
          deadZone: 0.2,
        },
      ],
    });
    const a = (analog.element as unknown as Element).children[0]!,
      d = (digital.element as unknown as Element).children[0]!;
    await app.start();
    host.frame(0);
    a.dispatchEvent(pointer('pointerdown', 1, 70, 50));
    d.dispatchEvent(pointer('pointerdown', 2, 70, 50));
    host.frame(16);
    assert.ok(controls.value('right') > 0 && controls.value('right') < 1);
    assert.equal(controls.value('yaw'), 1);
    assert.equal(controls.value('pitch'), 0);
    d.dispatchEvent(pointer('pointermove', 2, 90, 10));
    host.frame(32);
    assert.equal(controls.value('yaw'), 1);
    assert.equal(controls.value('pitch'), 1);
    d.dispatchEvent(pointer('pointermove', 2, 10, 90));
    host.frame(48);
    assert.equal(controls.value('yaw'), -1);
    assert.equal(controls.value('pitch'), -1);
    d.dispatchEvent(pointer('pointermove', 2, 50, 50));
    host.frame(64);
    assert.equal(controls.value('yaw'), 0);
    assert.equal(d.getAttribute('data-x'), '0');
    d.dispatchEvent(pointer('pointercancel', 2));
    a.dispatchEvent(pointer('pointerup', 1));
    host.frame(80);
    assert.equal(controls.value('right'), 0);
    await app.dispose();
  }));

void test('mirrored corner presets stack groups, customize theme live, and keep independent sources', () =>
  withHost(async (host) => {
    const original = host.document.createElement.bind(host.document);
    Object.defineProperty(host.document, 'createElement', {
      value: (tag: string) =>
        tag === 'canvas'
          ? original()
          : new Element(host.document as unknown as Document, tag),
    });
    const app = new Rocket(),
      scene = app.scene(new Scene2D());
    const controls = app.use(Input).actions(scene).use(flightInput);
    const view = app.view({ target: host.target, scene });
    controls.bind(view);
    const target = new Element(host.document as unknown as Document);
    const mount = (options: Parameters<typeof controls.virtual>[0]) =>
      controls.virtual(options);
    const base = { target: target as unknown as HTMLElement };
    assert.throws(() => createVirtualCornerPreset({}), /movement pad/);
    const noButtons = createVirtualCornerPreset({
      sticks: [{ label: 'Move', x: 'right' }],
    });
    assert.equal(noButtons.right.face!.buttons.length, 0);
    assert.throws(
      () => mount({ ...base, corner: { side: 'left' } }),
      /exactly one/,
    );
    assert.throws(
      () => mount({ ...base, groups: [{ buttons: [], columns: 5 }] }),
      /columns/,
    );
    assert.throws(() => mount({ ...base, theme: { opacity: 1.1 } }), /theme/);
    assert.throws(() => mount({ ...base, theme: { size: 20 } }), /theme/);
    assert.throws(() => mount({ ...base, theme: { color: '' } }), /theme/);
    const left = mount({
      ...base,
      corner: {
        ...virtualCornerLayouts.flight.left,
        above: [
          ...virtualCornerLayouts.flight.left.above!,
          {
            label: 'Extra',
            columns: 1,
            buttons: [{ label: 'Fire', action: 'fire' }],
          },
        ],
      },
      theme: { color: '#ffffff', opacity: 0.7, size: 120 },
    });
    const right = mount({ ...base, corner: virtualCornerLayouts.flight.right });
    const root = left.element as unknown as Element,
      mirrored = right.element as unknown as Element;
    assert.equal(root.getAttribute('data-side'), 'left');
    assert.equal(mirrored.getAttribute('data-side'), 'right');
    assert.equal(
      root.children[0]!.children.length,
      2,
      'multiple above groups stack',
    );
    assert.equal(
      root.children[2]!.children[0]!.style['--virtual-columns'],
      '1',
    );
    left.setTheme({ opacity: 0.4 });
    assert.equal(root.style['--virtual-color'], '#ffffff');
    assert.equal(root.style['--virtual-opacity'], '0.4');
    assert.equal(root.style['--virtual-size'], '120px');
    // Above/inside groups remain ordinary independent action controls.
    const fire = root.children[0]!.children[1]!.children[0]!;
    await app.start();
    host.frame(0);
    fire.dispatchEvent(pointer('pointerdown', 1));
    host.frame(16);
    assert.equal(controls.value('fire'), 1);
    left.dispose();
    host.frame(32);
    assert.equal(controls.value('fire'), 0);
    assert.throws(() => left.setTheme({ opacity: 0.5 }), /disposed/);
    right.dispose();
    await app.dispose();
    assert.equal(root.removed && mirrored.removed, true);
  }));

void test('all corner templates validate against their presets, including face-only action blocks', () =>
  withHost(async (host) => {
    const original = host.document.createElement.bind(host.document);
    Object.defineProperty(host.document, 'createElement', {
      value: (tag: string) =>
        tag === 'canvas'
          ? original()
          : new Element(host.document as unknown as Document, tag),
    });
    const presets = {
      'first-person': firstPersonInput,
      'top-down': topDownInput,
      platformer: platformerInput,
      'belt-scroller': beltScrollerInput,
      flight: flightInput,
    };
    for (const name of Object.keys(presets) as (keyof typeof presets)[]) {
      const app = new Rocket(),
        scene = app.scene(new Scene2D());
      const controls = app.use(Input).actions(scene).use(presets[name]);
      const view = app.view({ target: host.target, scene });
      controls.bind(view, { capture: 'focus' });
      const target = new Element(host.document as unknown as Document);
      for (const corner of [
        virtualCornerLayouts[name].left,
        virtualCornerLayouts[name].right,
      ]) {
        const controller = controls.virtual({
          target: target as unknown as HTMLElement,
          corner,
        });
        assert.match(controller.element.className, /corner/);
      }
      controls.virtual({
        target: target as unknown as HTMLElement,
        groups: [
          {
            label: 'Custom',
            columns: 1,
            buttons: [{ label: 'Interact', action: 'interact' }],
          },
        ],
      });
      await app.start();
      host.frame(0);
      await app.dispose();
    }
  }));
