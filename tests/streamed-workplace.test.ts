import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ChunkStream,
  MemoryEdits,
  type ChunkLoader,
} from '../examples/streaming/ChunkStream.js';
import { StreamedWalker } from '../examples/navigation/StreamedWalker.js';
import { WorkplaceOperator } from '../examples/workshop/WorkplaceOperator.js';
import { FactoryDemo } from '../examples/workshop/FactoryDemo.js';

function fixture(load?: ChunkLoader) {
  const edits = new MemoryEdits((cell) =>
      (cell.x === 12 || cell.x === 13) && cell.y >= -3 ? 1 : 0,
    ),
    stream = new ChunkStream(edits, 64, 0, load ? { load, maxJobs: 2 } : {}),
    walker = new StreamedWalker(stream),
    factory = new FactoryDemo(1, true, true),
    smelter = factory.ids[1]!,
    press = factory.ids[2]!;
  const places = new Map([
    [smelter, { x: 240, y: 48 }],
    [press, { x: 816, y: 48 }],
  ]);
  const operator = new WorkplaceOperator(walker, {
    workplace: (id) => places.get(id),
    canStand: (point) => walker.canStand(point),
    setPresent(id, present) {
      factory.operatorOnSite(id, present);
    },
  });
  const step = () => {
    stream.advance(1);
    operator.reconcile();
    factory.advance(1 / 60);
    operator.update(1 / 60);
  };
  const run = (seconds: number) => {
    for (let i = 0; i < seconds * 60; i++) step();
  };
  const facility = (id: string) =>
    factory.read().facilities.find((f) => f.id === id)!;
  return {
    edits,
    stream,
    walker,
    factory,
    smelter,
    press,
    operator,
    places,
    step,
    run,
    facility,
    dispose() {
      operator.dispose();
      factory.dispose();
      stream.dispose();
    },
  };
}
void test('failed asynchronous actor terrain grants no attendance until retry publishes ready chunks', async () => {
  let fail = true;
  const pending: (() => void)[] = [];
  const f = fixture((chunk) => {
    if (fail && chunk.x === 0 && chunk.y === 0) {
      fail = false;
      return Promise.reject(new Error('test failure'));
    }
    return new Promise((resolve) => {
      pending.push(() => resolve(new Uint8Array(64)));
    });
  });
  const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  const warm = async () => {
    for (let i = 0; i < 30; i++) {
      f.step();
      await flush();
      pending.splice(0).forEach((resolve) => {
        resolve();
      });
      await flush();
    }
    f.step();
  };
  try {
    f.operator.assign(f.smelter);
    await warm();
    f.run(3);
    assert.ok(f.stream.stats.failed > 0);
    assert.equal(f.operator.snapshot().journey!.status, 'blocked');
    assert.equal(f.operator.snapshot().present, null);
    assert.equal(f.facility(f.smelter).jobs[0]!.progress, 0);
    f.stream.retryFailures();
    await warm();
    f.run(10);
    assert.equal(f.operator.snapshot().present, f.smelter);
    assert.ok(f.facility(f.smelter).jobs[0]!.batchesCompleted > 0);
    assert.ok(f.stream.stats.running <= 2);
  } finally {
    f.dispose();
    pending.splice(0).forEach((resolve) => {
      resolve();
    });
    await flush();
  }
});
void test('streamed arrival gates Workshop; reassignment clears attendance before travel and never staffs two workplaces', () => {
  const f = fixture();
  try {
    f.operator.assign(f.smelter);
    assert.equal(f.operator.snapshot().journey!.status, 'blocked');
    f.run(1);
    assert.equal(f.operator.snapshot().present, null);
    assert.equal(f.facility(f.smelter).jobs[0]!.progress, 0);
    f.run(7);
    assert.equal(f.operator.snapshot().present, f.smelter);
    assert.ok(f.facility(f.smelter).jobs[0]!.batchesCompleted > 0);
    const before = f.facility(f.smelter).jobs[0]!.progress;
    f.operator.assign(f.press);
    assert.equal(f.facility(f.smelter).attendance.operator, undefined);
    f.run(1);
    assert.equal(f.operator.snapshot().present, null);
    assert.equal(f.facility(f.press).attendance.operator, undefined);
    f.run(15);
    assert.equal(f.operator.snapshot().present, f.press);
    assert.equal(f.facility(f.smelter).jobs[0]!.progress, before);
    assert.ok(f.factory.read().completed > 0);
    assert.equal(f.walker.snapshot().routeDemand, false);
  } finally {
    f.dispose();
  }
});
void test('streamed movement handles isolate replacement routes and reject invalid requests before changing demand', () => {
  const f = fixture();
  try {
    const request = {
      destination: { x: 240, y: 48 },
      speed: 90,
      arrivalTolerance: 0.1,
      replan: 'on-change' as const,
    };
    const old = f.walker.move(request);
    const current = f.walker.move({
      ...request,
      destination: { x: 816, y: 48 },
    });
    const before = f.walker.snapshot(),
      owners = f.stream.stats.owners;
    assert.throws(() => f.walker.move({ ...request, speed: NaN }), /Invalid/);
    assert.deepEqual(f.walker.snapshot(), before);
    old.cancel();
    assert.equal(f.walker.snapshot().routeDemand, true);
    assert.equal(f.stream.stats.owners, owners);
    current.cancel();
    assert.equal(f.walker.snapshot().routeDemand, false);
    assert.equal(f.stream.stats.owners, 1);
  } finally {
    f.dispose();
  }
});
void test('on-site terrain edits revoke attendance before production and restore it without rebuilding navigation', () => {
  const f = fixture();
  try {
    f.operator.assign(f.smelter);
    f.run(2.5);
    assert.equal(f.operator.snapshot().present, f.smelter);
    assert.equal(f.stream.set({ x: 7, y: 1 }, 1), true);
    const before = f.facility(f.smelter).jobs[0]!.progress;
    f.run(2);
    assert.equal(f.operator.snapshot().present, null);
    assert.equal(f.facility(f.smelter).jobs[0]!.progress, before);
    assert.equal(f.stream.set({ x: 7, y: 1 }, 0), true);
    f.operator.reconcile();
    assert.equal(f.operator.snapshot().present, f.smelter);
    f.operator.cancel();
    assert.equal(f.facility(f.smelter).attendance.operator, undefined);
  } finally {
    f.dispose();
  }
});
void test('sealed streamed routes never grant attendance; cancellation and disposal release only actor demand', () => {
  const f = fixture(),
    camera = f.stream.createDemand();
  try {
    camera.set({ minX: -8, minY: -8, maxX: 8, maxY: 8 });
    for (let y = -8; y < -3; y++)
      for (const x of [12, 13]) f.edits.set({ x, y }, 1);
    f.operator.assign(f.press);
    f.run(4);
    assert.equal(f.operator.snapshot().present, null);
    assert.equal(f.operator.snapshot().journey!.status, 'unreachable');
    assert.equal(f.facility(f.press).jobs[0]!.progress, 0);
    f.operator.cancel();
    assert.equal(f.walker.snapshot().routeDemand, false);
    assert.equal(f.stream.stats.owners, 2);
    for (let y = -8; y < -3; y++)
      for (const x of [12, 13]) f.stream.set({ x, y }, 0);
    f.operator.assign(f.press);
    camera.dispose();
    f.run(16);
    assert.equal(f.operator.snapshot().present, f.press);
    assert.equal(f.stream.stats.owners, 1);
    f.operator.assign(f.smelter);
    assert.equal(f.facility(f.press).attendance.operator, undefined);
    f.operator.dispose();
    f.operator.dispose();
    assert.equal(f.stream.stats.owners, 0);
    const tick = f.factory.read().summary.tick;
    f.factory.advance(1);
    assert.ok(f.factory.read().summary.tick > tick);
  } finally {
    camera.dispose();
    f.dispose();
  }
});
