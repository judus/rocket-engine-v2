import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ChunkStream,
  MemoryEdits,
  chunkSize,
  type ChunkLoader,
} from '../examples/streaming/ChunkStream.js';
import { StreamedWalker } from '../examples/navigation/StreamedWalker.js';
const wall = (cell: { x: number; y: number }): 0 | 1 =>
  (cell.x === 12 || cell.x === 13) && cell.y >= -3 && cell.y < 8 ? 1 : 0;
function fixture(
  base: (cell: { x: number; y: number }) => 0 | 1 = wall,
  capacity = 64,
) {
  const stream = new ChunkStream(new MemoryEdits(base), capacity, 0),
    actor = new StreamedWalker(stream);
  return {
    stream,
    actor,
    step(dt = 0.1) {
      stream.advance(capacity);
      actor.update(dt);
    },
    dispose() {
      actor.dispose();
      stream.dispose();
    },
  };
}
void test('one distant journey expands ready corridor, detours around a wall and retires passed route chunks', () => {
  const f = fixture();
  try {
    f.actor.go({ x: 816, y: 48 });
    assert.equal(f.actor.snapshot().journey!.status, 'blocked');
    assert.equal(f.actor.snapshot().planning.expansions, 0);
    f.step(0);
    assert.equal(f.actor.snapshot().planning.expansions, 1);
    assert.equal(f.actor.position.x, 48);
    f.step(0);
    const path = f.actor.snapshot().journey!;
    assert.equal(path.status, 'moving');
    assert.ok(path.route.some((p) => p.y <= -112));
    let retired = false;
    for (
      let i = 0;
      i < 180 && f.actor.snapshot().journey!.status !== 'arrived';
      i++
    ) {
      f.step();
      assert.ok(f.stream.stats.retained <= 64);
      assert.ok(f.actor.snapshot().planning.requestedChunks <= 24);
      if (f.actor.position.x > 650)
        retired ||= f.stream.read({ x: 0, y: 1 }).state === 'missing';
    }
    assert.equal(f.actor.snapshot().journey!.status, 'arrived');
    assert.equal(f.actor.position.x, 816);
    assert.ok(retired);
    assert.equal(f.stream.stats.owners, 1);
    assert.equal(f.actor.snapshot().routeDemand, false);
  } finally {
    f.dispose();
  }
});
void test('corridor and visited-cell budgets never turn incomplete search into unreachable and need a new budgeted request', () => {
  const f = fixture();
  try {
    f.actor.go(
      { x: 816, y: 48 },
      { maxChunks: 4, maxExpansions: 4, maxVisited: 4096 },
    );
    f.step(0);
    assert.equal(f.actor.snapshot().journey!.status, 'blocked');
    assert.equal(f.actor.snapshot().journey!.reason, 'corridor-limit');
    assert.equal(f.actor.snapshot().planning.phase, 'budget-exhausted');
    assert.equal(f.actor.position.x, 48);
    f.actor.go(
      { x: 816, y: 48 },
      { maxChunks: 24, maxExpansions: 4, maxVisited: 1 },
    );
    f.step(0);
    assert.equal(f.actor.snapshot().journey!.reason, 'search-limit');
    const before = f.actor.snapshot();
    for (let i = 0; i < 20; i++) f.step(0);
    assert.deepEqual(f.actor.snapshot(), before);
    assert.throws(
      () =>
        f.actor.go(
          { x: 816, y: 48 },
          { maxChunks: 25, maxExpansions: 4, maxVisited: 4096 },
        ),
      /budget/,
    );
    assert.deepEqual(f.actor.snapshot(), before);
    f.actor.go({ x: 816, y: 48 });
    f.step(0);
    f.step(0);
    assert.equal(f.actor.snapshot().journey!.status, 'moving');
  } finally {
    f.dispose();
  }
});
void test('no-route becomes terminal only when the complete finite domain is known and searched', () => {
  const f = fixture((cell) => (cell.x === 12 || cell.x === 13 ? 1 : 0));
  try {
    f.actor.go({ x: 816, y: 48 });
    for (
      let i = 0;
      i < 10 && f.actor.snapshot().journey!.status !== 'unreachable';
      i++
    )
      f.step(0);
    assert.equal(f.actor.snapshot().journey!.status, 'unreachable');
    assert.equal(f.actor.snapshot().journey!.reason, 'no-route');
    assert.equal(f.actor.snapshot().planning.expansions, 4);
    assert.equal(f.stream.stats.owners, 1);
  } finally {
    f.dispose();
  }
});
void test('shared stream capacity is respected without stealing camera/actor demand or leaking a rejected route owner', () => {
  const f = fixture((cell) => (cell.x === 12 || cell.x === 13 ? 1 : 0), 24),
    camera = f.stream.createDemand();
  try {
    camera.set({ minX: 80, minY: -8, maxX: 112, maxY: 8 });
    f.actor.go({ x: 816, y: 48 });
    for (let i = 0; i < 6; i++) f.step(0);
    assert.equal(f.actor.snapshot().journey!.reason, 'demand-limit');
    assert.equal(f.actor.snapshot().journey!.status, 'blocked');
    assert.equal(f.actor.snapshot().routeDemand, false);
    assert.equal(f.stream.stats.owners, 2);
    assert.ok(f.stream.stats.retained <= 24);
    assert.equal(f.stream.read({ x: 80, y: 0 }).state, 'ready');
    assert.equal(f.stream.read({ x: 1, y: 1 }).state, 'ready');
  } finally {
    camera.dispose();
    f.dispose();
  }
});
void test('retargeting releases obsolete corridor data; cancellation retains local terrain and edited geometry replans through the same search', () => {
  const f = fixture(() => 0);
  try {
    f.actor.go({ x: 816, y: 48 });
    f.step(0);
    assert.equal(f.stream.read({ x: 24, y: 1 }).state, 'ready');
    const old = f.actor.snapshot().journey!.id;
    f.actor.go({ x: -208, y: 48 });
    assert.notEqual(f.actor.snapshot().journey!.id, old);
    assert.equal(f.stream.read({ x: 24, y: 1 }).state, 'missing');
    f.actor.cancel();
    assert.equal(f.stream.stats.owners, 1);
    assert.equal(f.actor.snapshot().planning.requestedChunks, 0);
    f.actor.go({ x: 816, y: 48 });
    f.step(0);
    for (let y = -3; y < 8; y++)
      for (const x of [12, 13]) {
        const cell = { x, y },
          live = f.stream.read(cell);
        if (live.state === 'ready') {
          assert.equal(live.value, 0);
          f.stream.cycle(cell); // One authoritative write-through edit command.
        } else f.stream.edits.set(cell, 1);
      }
    f.step(0);
    f.step(0);
    assert.equal(f.actor.snapshot().journey!.status, 'moving');
    assert.ok(f.actor.snapshot().journey!.route.some((p) => p.y <= -112));
  } finally {
    f.dispose();
  }
});
void test('delayed corridor expansion never moves early; cancelled expanded jobs stay bounded and cannot publish stale data', async () => {
  const tasks: {
    cell: { x: number; y: number };
    signal: AbortSignal;
    resolve: (value: Uint8Array) => void;
    done: boolean;
  }[] = [];
  const load: ChunkLoader = (cell, signal) =>
    new Promise((resolve) => {
      tasks.push({ cell, signal, resolve, done: false });
    });
  const stream = new ChunkStream(new MemoryEdits(wall), 64, 0, {
      load,
      maxJobs: 2,
    }),
    actor = new StreamedWalker(stream);
  const flush = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };
  const settle = (task: (typeof tasks)[number]) => {
    task.done = true;
    const data = new Uint8Array(64);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++)
        data[y * 8 + x] = wall({
          x: task.cell.x * chunkSize + x,
          y: task.cell.y * chunkSize + y,
        });
    task.resolve(data);
  };
  try {
    actor.go({ x: 816, y: 48 });
    for (let i = 0; i < 30 && actor.snapshot().planning.expansions === 0; i++) {
      stream.advance(64);
      await flush();
      actor.update(0);
      assert.equal(actor.position.x, 48);
      assert.ok(stream.stats.running <= 2);
      const pending = tasks.filter((t) => !t.done).reverse();
      for (const task of pending) settle(task);
      await flush();
    }
    assert.equal(actor.snapshot().planning.expansions, 1);
    stream.advance(64);
    await flush();
    const pending = tasks.filter((t) => !t.done);
    assert.ok(pending.length > 0);
    actor.cancel();
    assert.ok(pending.some((t) => t.signal.aborted));
    for (const task of pending) settle(task);
    await flush();
    stream.advance(64);
    assert.equal(actor.snapshot().journey!.status, 'cancelled');
    assert.equal(stream.read({ x: 16, y: -8 }).state, 'missing');
    assert.ok(stream.stats.running <= 2);
    assert.equal(stream.stats.owners, 1);
  } finally {
    actor.dispose();
    stream.dispose();
    for (const task of tasks) if (!task.done) settle(task);
    await flush();
  }
});
