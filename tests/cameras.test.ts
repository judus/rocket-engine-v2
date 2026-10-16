import { pickFactory } from '../examples/workshop/FactoryPicking.js';
import { FacilityVisuals } from '../examples/workshop/FacilityVisuals.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Construction } from '../examples/workshop/Construction.js';
import { FactoryDemo } from '../examples/workshop/FactoryDemo.js';
import { Camera2D } from '../src/Camera2D.js';
import { Cameras } from '../src/Cameras.js';
import { View } from '../src/View.js';
import type { Matrix2D } from '../src/types.js';
import { ChunkStream, MemoryEdits } from '../examples/streaming/ChunkStream.js';

class Canvas extends EventTarget {
  width = 0;
  height = 0;
  style: Record<string, string> = {};
  wheels = new Set<EventListenerOrEventListenerObject>();
  matrix: Matrix2D = [1, 0, 0, 1, 0, 0];
  override addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: AddEventListenerOptions | boolean,
  ) {
    if (type === 'wheel' && listener) this.wheels.add(listener);
    super.addEventListener(type, listener, options);
  }
  override removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: EventListenerOptions | boolean,
  ) {
    if (type === 'wheel' && listener) this.wheels.delete(listener);
    super.removeEventListener(type, listener, options);
  }
  remove() {}
  getBoundingClientRect() {
    return { left: 10, top: 20, width: 320, height: 180 };
  }
  getContext() {
    return {
      setTransform: (...matrix: Matrix2D) => {
        this.matrix = matrix;
      },
      clearRect() {},
      save() {},
      restore() {},
      beginPath() {},
    };
  }
}
function fixture(snap = false) {
  const canvas = new Canvas();
  const container = {
    ownerDocument: { createElement: () => canvas },
    appendChild() {},
  };
  const view = new View({
    target: container as unknown as Element,
    scene: {},
    width: 640,
    height: 360,
    pixelRatio: 1.5,
    pixelSnap: snap,
  });
  return { view, canvas };
}
function close(actual: number, expected: number, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
}
function wheel(canvas: Canvas, deltaY: number, deltaMode = 0) {
  const event = Object.assign(new Event('wheel', { cancelable: true }), {
    clientX: 110,
    clientY: 80,
    deltaY,
    deltaMode,
  });
  canvas.dispatchEvent(event);
  return event;
}

void test('cursor zoom and picking use the rendered inverse with CSS scaling, DPR and pixel snapping', () => {
  for (const snap of [false, true]) {
    const { view, canvas } = fixture(snap),
      service = new Cameras();
    const controller = service.bind(view);
    service.start();
    try {
      view.camera.x = -12.37;
      view.camera.y = 21.83;
      view.camera.zoom = 1.3;
      const screen = view.clientToScreen({ x: 110, y: 80 });
      assert.deepEqual(screen, { x: 200, y: 120 });
      const anchor = view.screenToWorld(screen);
      controller.zoomAt(2.4, screen);
      const after = view.worldToScreen(anchor);
      close(after.x, screen.x, snap ? 1 / 1.5 : 1e-9);
      close(after.y, screen.y, snap ? 1 / 1.5 : 1e-9);
      assert.deepEqual(
        view.clientToWorld({ x: 110, y: 80 }),
        view.screenToWorld(screen),
      );
      view.render({ dt: 0, time: 0 });
      const world = view.clientToWorld({ x: 110, y: 80 });
      const [a, b, c, d, e, f] = canvas.matrix;
      close(a * world.x + c * world.y + e, screen.x * 1.5);
      close(b * world.x + d * world.y + f, screen.y * 1.5);
      controller.zoomAt(100, screen);
      assert.equal(view.camera.zoom, 4);
      controller.zoomAt(0.01, screen);
      assert.equal(view.camera.zoom, 0.5);
      assert.throws(() => controller.zoomAt(0, screen), /positive/);
    } finally {
      view.dispose();
      service.dispose();
    }
  }
});
void test('pan inertia is frame partition independent, normalizes diagonal movement and resets on stop', () => {
  const one = fixture(),
    split = fixture(),
    diagonal = fixture();
  const service = new Cameras();
  service.start();
  const a = service.bind(one.view),
    b = service.bind(split.view),
    c = service.bind(diagonal.view);
  try {
    one.view.camera.zoom =
      split.view.camera.zoom =
      diagonal.view.camera.zoom =
        2;
    a.update(1, { x: 1, y: 0 });
    for (let i = 0; i < 100; i++) b.update(0.01, { x: 1, y: 0 });
    close(one.view.camera.x, split.view.camera.x);
    c.update(1, { x: 1, y: 1 });
    close(
      Math.hypot(diagonal.view.camera.x, diagonal.view.camera.y),
      one.view.camera.x,
    );
    const before = one.view.camera.x;
    a.update(0.1);
    assert.ok(one.view.camera.x > before);
    service.stop();
    const stopped = one.view.camera.x;
    a.update(1, { x: 1, y: 0 });
    assert.equal(one.view.camera.x, stopped);
    service.start();
    a.update(1);
    assert.equal(one.view.camera.x, stopped);
    assert.throws(() => a.update(-1), /nonnegative/);
    assert.throws(() => service.bind(one.view), /already/);
  } finally {
    one.view.dispose();
    split.view.dispose();
    diagonal.view.dispose();
    service.dispose();
  }
});
void test('wheel requests apply before demand, coalesce, and clean up independently with views', () => {
  const a = fixture(),
    b = fixture(),
    service = new Cameras();
  const ca = service.bind(a.view),
    cb = service.bind(b.view, { inertia: 0 });
  try {
    assert.equal(wheel(a.canvas, 100).defaultPrevented, false);
    service.start();
    const anchor = a.view.clientToWorld({ x: 110, y: 80 });
    assert.equal(wheel(a.canvas, 10, 1).defaultPrevented, true);
    wheel(a.canvas, 100);
    assert.equal(a.view.camera.zoom, 1);
    ca.update(0);
    close(a.view.camera.zoom, Math.exp(-260 * 0.0015));
    assert.deepEqual(b.view.camera.zoom, 1);
    close(a.view.worldToScreen(anchor).x, 200);
    cb.update(0.5, { x: 1, y: 0 });
    close(b.view.camera.x, 160);
    wheel(a.canvas, 100);
    service.stop();
    service.start();
    ca.update(0);
    close(a.view.camera.zoom, Math.exp(-260 * 0.0015));
    service.beforeUpdate({ dt: 0, time: 0 }, new Set());
    assert.equal(wheel(b.canvas, 100).defaultPrevented, false);
    service.beforeUpdate(
      { dt: 0, time: 0 },
      new Set([a.view.scene!, b.view.scene!]),
    );
    a.view.dispose();
    assert.equal(service.size, 1);
    assert.equal(a.canvas.wheels.size, 0);
    assert.throws(() => ca.update(0), /disposed/);
    assert.equal(wheel(b.canvas, 100).defaultPrevented, true);
    service.dispose();
    assert.equal(service.size, 0);
    assert.equal(b.canvas.wheels.size, 0);
    assert.throws(() => service.bind(b.view), /disposed/);
  } finally {
    a.view.dispose();
    b.view.dispose();
    service.dispose();
  }
});
void test('zoomed viewport demand covers picked boundary cells and fits two independent views at minimum zoom', () => {
  const a = fixture(true),
    b = fixture(),
    service = new Cameras();
  service.start();
  const stream = new ChunkStream(new MemoryEdits(() => 0), 256, 1);
  const first = stream.createDemand(),
    second = stream.createDemand();
  const ca = service.bind(a.view),
    cb = service.bind(b.view);
  const bounds = (view: View) => {
    const p = view.worldBounds;
    return {
      minX: Math.floor(p.minX / 16),
      minY: Math.floor(p.minY / 16),
      maxX: Math.ceil(p.maxX / 16),
      maxY: Math.ceil(p.maxY / 16),
    };
  };
  try {
    for (const zoom of [0.5, 1, 2, 4]) {
      ca.zoomAt(zoom, { x: 317, y: 181 });
      cb.zoomAt(zoom, { x: 0, y: 0 });
      a.view.camera.x = -131.31;
      a.view.camera.y = -17.9;
      b.view.camera.x = 16017.31;
      b.view.camera.y = -16131.7;
      stream.setDemands([
        { handle: first, bounds: bounds(a.view) },
        { handle: second, bounds: bounds(b.view) },
      ]);
      assert.ok(stream.stats.retained <= 256);
      for (const view of [a.view, b.view])
        for (const point of [
          { x: 0, y: 0 },
          { x: 639.99, y: 359.99 },
        ]) {
          const p = view.screenToWorld(point),
            cell = { x: Math.floor(p.x / 16), y: Math.floor(p.y / 16) };
          assert.notEqual(stream.read(cell).state, 'missing');
        }
    }
    first.dispose();
    assert.equal(stream.stats.owners, 1);
    const before = bounds(b.view);
    ca.dispose();
    assert.deepEqual(bounds(b.view), before);
  } finally {
    a.view.dispose();
    b.view.dispose();
    service.dispose();
    stream.dispose();
  }
});

void test('zoomed and snapped factory picking selects footprints and places at the visible cell without mutating simulation from draw', () => {
  const f = new FactoryDemo(1, true),
    service = new Cameras();
  const { view } = fixture(true);
  const controller = service.bind(view, { minZoom: 0.75 });
  service.start();
  const construction = new Construction(
    f.ids.map((facilityId, i) => ({
      facilityId,
      label: 'Building',
      cell: { x: i * 8 - 5, y: 3 },
    })),
  );
  const visuals = new FacilityVisuals(construction.placements);
  visuals.update(() => true);
  try {
    view.camera.x = -200.37;
    view.camera.y = -100.83;
    for (const zoom of [0.75, 1, 1.5, 2, 4]) {
      const world = { x: -4.5 * 16, y: 3.5 * 16 };
      const oldPointerWorld = view.screenToWorld(view.worldToScreen(world));
      const screen = view.worldToScreen(oldPointerWorld);
      controller.zoomAt(zoom, screen);
      const picked = view.screenToWorld(screen);
      const cell = {
        x: Math.floor(picked.x / 16),
        y: Math.floor(picked.y / 16),
      };
      assert.equal(construction.at(cell)?.facilityId, f.ids[0]);
      assert.equal(construction.preview(cell, () => 'land').valid, false);
      const roofWorld = { x: -4.5 * 16, y: 4 };
      const roofScreen = view.worldToScreen(roofWorld);
      const roofPick = view.clientToWorld({
        x: 10 + roofScreen.x / 2,
        y: 20 + roofScreen.y / 2,
      });
      assert.equal(
        pickFactory(roofPick, visuals, { candidates: () => [] })?.id,
        f.ids[0],
      );
    }
    const target = { x: -20, y: -5 };
    const rendered = view.worldToScreen({
      x: (target.x + 0.5) * 16,
      y: (target.y + 0.5) * 16,
    });
    const picked = view.clientToWorld({
      x: 10 + rendered.x / 2,
      y: 20 + rendered.y / 2,
    });
    const cell = { x: Math.floor(picked.x / 16), y: Math.floor(picked.y / 16) };
    const placed = construction.place(
      'press',
      cell,
      () => 'land',
      (kind) => f.addFacility(kind),
    );
    assert.deepEqual(placed?.cell, target);
    assert.equal(f.ids.length, 4);
    assert.equal(construction.at(target)?.facilityId, placed?.facilityId);
  } finally {
    visuals.dispose();
    f.dispose();
    view.dispose();
    service.dispose();
  }
});

void test('camera replacement discards outgoing inertia and wheel requests while preserving retained poses', () => {
  const { view, canvas } = fixture();
  const service = new Cameras();
  const controller = service.bind(view);
  service.start();
  try {
    const retained = view.camera;
    controller.update(0.1, { x: 1, y: 0 });
    const pose = retained.x;
    assert.ok(pose > 0);
    wheel(canvas, 100);
    view.camera = new Camera2D();
    service.scenesChanged(new Set([view.scene!]));
    controller.update(0.1);
    assert.equal(view.camera.x, 0);
    assert.equal(view.camera.zoom, 1);
    // A wheel event after replacement belongs to the new camera, even before RAF.
    controller.update(0.1, { x: 1, y: 0 });
    wheel(canvas, 200);
    view.camera = retained;
    wheel(canvas, -100);
    controller.update(0);
    close(retained.zoom, Math.exp(100 * 0.0015));
    // Zoom can move the anchor, but no old pan velocity may move it afterward.
    const zoomedPose = retained.x;
    controller.update(0.1);
    assert.equal(retained.x, zoomedPose);
    // Direct replacement must also reconcile without a service notification.
    view.camera = new Camera2D();
    controller.update(0.1);
    assert.equal(view.camera.x, 0);
    assert.equal(view.camera.zoom, 1);
  } finally {
    view.dispose();
    service.dispose();
  }
});
