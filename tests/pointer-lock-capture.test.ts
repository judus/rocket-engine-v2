import test from 'node:test';
import assert from 'node:assert/strict';
import { PointerLockCapture, Rocket, Scene2D, Input } from '../src/index.js';
import { Target, Key, canvas, withHost } from './helpers/inputHost.js';

function fixture() {
  const window = new Target();
  const document = Object.assign(new Target(), {
    pointerLockElement: null as HTMLCanvasElement | null,
    hidden: false,
    defaultView: window,
    exitPointerLock() {
      this.pointerLockElement = null;
      document.dispatchEvent(new Event('pointerlockchange'));
    },
  });
  const canvas = Object.assign(new Target(), {
    ownerDocument: document,
    focus() {},
    requestPointerLock() {
      document.pointerLockElement = this as unknown as HTMLCanvasElement;
      document.dispatchEvent(new Event('pointerlockchange'));
      return Promise.resolve();
    },
  });
  const capture = new PointerLockCapture(
    canvas as unknown as HTMLCanvasElement,
  );
  return { document, window, canvas, capture };
}
void test('capture requires explicit activation, accumulates relative motion, releases on Escape and ignores incidental canvas blur', async () => {
  const f = fixture();
  assert.equal(f.capture.state, 'released');
  f.document.dispatchEvent(
    Object.assign(new Event('mousemove'), { movementX: 8, movementY: -4 }),
  );
  assert.deepEqual(f.capture.consumeMovement(), { x: 0, y: 0 });
  await f.capture.request();
  await f.capture.request();
  assert.equal(f.capture.active, true);
  f.canvas.dispatchEvent(new Event('blur'));
  assert.equal(f.capture.active, true);
  for (const [x, y] of [
    [8, -4],
    [2, 3],
    [NaN, 0],
  ])
    f.document.dispatchEvent(
      Object.assign(new Event('mousemove'), { movementX: x, movementY: y }),
    );
  assert.deepEqual(f.capture.consumeMovement(), { x: 10, y: -1 });
  assert.deepEqual(f.capture.consumeMovement(), { x: 0, y: 0 });
  f.document.dispatchEvent(new Key('keydown', 'Escape'));
  assert.equal(f.capture.state, 'released');
  assert.equal(f.document.pointerLockElement, null);
  for (const event of ['blur', 'visibilitychange', 'webglcontextlost']) {
    await f.capture.request();
    if (event === 'blur') f.window.dispatchEvent(new Event(event));
    else if (event === 'visibilitychange') {
      f.document.hidden = true;
      f.document.dispatchEvent(new Event(event));
      f.document.hidden = false;
    } else f.canvas.dispatchEvent(new Event(event));
    assert.equal(f.capture.active, false);
  }
  f.document.dispatchEvent(new Event('visibilitychange'));
  await f.capture.request();
  f.capture.dispose();
  f.capture.dispose();
  await f.capture.request();
  assert.equal(f.document.pointerLockElement, null);
  assert.equal(
    f.document.listenerCount + f.window.listenerCount + f.canvas.listenerCount,
    0,
  );
});
void test('capture handles refusal, unsupported browsers, pending cancellation and late grants after disposal', async () => {
  const f = fixture();
  f.canvas.requestPointerLock = () =>
    Promise.reject(new Error('NotAllowedError'));
  await f.capture.request();
  assert.equal(f.capture.state, 'error');
  assert.ok(f.capture.reason.length > 0);
  let grant = () => {};
  f.canvas.requestPointerLock = () =>
    new Promise<void>((resolve) => {
      grant = () => {
        f.document.pointerLockElement =
          f.canvas as unknown as HTMLCanvasElement;
        f.document.dispatchEvent(new Event('pointerlockchange'));
        resolve();
      };
    });
  const pending = f.capture.request();
  await f.capture.request();
  assert.equal(f.capture.state, 'requesting');
  f.document.dispatchEvent(new Event('pointerlockerror'));
  assert.equal(f.capture.state, 'error');
  grant();
  await pending;
  assert.equal(f.document.pointerLockElement, null);
  const late = f.capture.request();
  f.capture.dispose();
  grant();
  await late;
  assert.equal(f.document.pointerLockElement, null);
  const g = fixture();
  Reflect.deleteProperty(g.canvas, 'requestPointerLock');
  const unsupported = new PointerLockCapture(
    g.canvas as unknown as HTMLCanvasElement,
  );
  assert.equal(unsupported.state, 'unavailable');
  await unsupported.request();
  unsupported.dispose();
  g.capture.dispose();
  const h = fixture();
  h.canvas.requestPointerLock = () =>
    new Promise<void>((resolve) => {
      grant = () => resolve();
    });
  const refused = h.capture.request();
  h.capture.release();
  h.document.dispatchEvent(new Event('pointerlockerror'));
  grant();
  await refused;
  assert.equal(h.capture.state, 'released');
  h.capture.dispose();
});
void test('locked input routes bound actions through the document, clears held keys on release and never captures normal page keys', () =>
  withHost(async (host) => {
    const app = new Rocket(),
      scene = app.scene(new Scene2D()),
      scope = scene.own(app.use(Input).scope(scene, { thrust: 'KeyW' }));
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
    const binding = scope.bind(view, { pointerLock: true });
    await app.start();
    doc.dispatchEvent(new Key('keydown', 'KeyW'));
    host.frame(0);
    assert.equal(scope.down('thrust'), false);
    await binding.capture!.request();
    doc.dispatchEvent(new Key('keydown', 'KeyW'));
    host.frame(16);
    assert.equal(scope.down('thrust'), true);
    canvas(binding).dispatchEvent(new Event('blur'));
    host.frame(32);
    assert.equal(scope.down('thrust'), true);
    doc.dispatchEvent(new Key('keyup', 'KeyW'));
    host.frame(48);
    assert.equal(scope.down('thrust'), false);
    const editable = Object.assign(new EventTarget(), { tagName: 'INPUT' });
    editable.addEventListener('keydown', (event) => doc.dispatchEvent(event));
    // Direct event targets cannot be reparented in this stub; supply the input target explicitly.
    const typing = new Key('keydown', 'KeyW');
    Object.defineProperty(typing, 'target', { value: editable });
    doc.dispatchEvent(typing);
    host.frame(64);
    assert.equal(scope.down('thrust'), false);
    doc.dispatchEvent(new Key('keydown', 'KeyW'));
    host.frame(80);
    assert.equal(scope.down('thrust'), true);
    binding.capture!.release();
    assert.equal(scope.down('thrust'), false);
    host.frame(96);
    assert.equal(scope.pressed('thrust'), false);
    await app.dispose();
    assert.equal(doc.pointerLockElement, null);
  }));
