import test from 'node:test';
import assert from 'node:assert/strict';
import { ChunkStream, MemoryEdits } from '../examples/streaming/ChunkStream.js';
import { StreamedWalker } from '../examples/navigation/StreamedWalker.js';
void test('chunk readiness around the wall detour never pulls the walker back to a passed tile centre', () => {
  const base = (cell: { x: number; y: number }): 0 | 1 | 2 =>
    (cell.x === 12 || cell.x === 13) && cell.y >= -3 && cell.y < 8
      ? 1
      : cell.y >= 4
        ? 2
        : 0;
  const stream = new ChunkStream(new MemoryEdits(base), 64, 0),
    actor = new StreamedWalker(stream);
  let movingReplans = 0;
  try {
    actor.go({ x: 816, y: 48 });
    for (let frame = 0; frame < 1200; frame++) {
      const before = actor.snapshot().journey;
      stream.advance(1);
      actor.update(1 / 60);
      const after = actor.snapshot().journey!;
      if (before?.status === 'moving') {
        const waypoint = before.route[before.nextWaypoint]!;
        const dx = after.position.x - before.position.x,
          dy = after.position.y - before.position.y;
        assert.ok(
          dx * (waypoint.x - before.position.x) +
            dy * (waypoint.y - before.position.y) >=
            -1e-8,
          `backstep at ${JSON.stringify(before.position)}`,
        );
        if (after.worldRevision !== before.worldRevision) movingReplans++;
      }
      if (after.status === 'arrived') break;
    }
    assert.equal(actor.snapshot().journey!.status, 'arrived');
    assert.ok(
      movingReplans > 0,
      'exercise readiness-driven replanning while moving',
    );
  } finally {
    actor.dispose();
    stream.dispose();
  }
});
void test('actor demand survives distant camera demand/removal and signed chunk crossings remain bounded', () => {
  const stream = new ChunkStream(new MemoryEdits(() => 0), 64, 0),
    actor = new StreamedWalker(stream);
  const camera = stream.createDemand();
  try {
    camera.set({ minX: 40, minY: -4, maxX: 60, maxY: 8 });
    for (let i = 0; i < 4; i++) {
      actor.go({ x: actor.position.x - 256, y: 48 });
      stream.advance(64);
      actor.update(3);
      assert.equal(actor.snapshot().journey!.status, 'arrived');
      assert.ok(stream.stats.retained <= 64);
      assert.equal(
        stream.read({ x: Math.floor(actor.position.x / 32), y: 1 }).state,
        'ready',
      );
    }
    camera.dispose();
    assert.equal(stream.stats.owners, 1);
    assert.ok(stream.stats.retained <= 9);
    actor.go({ x: actor.position.x + 256, y: 48 });
    stream.advance(64);
    actor.update(3);
    assert.equal(actor.snapshot().journey!.status, 'arrived');
    actor.dispose();
    assert.equal(stream.stats.owners, 0);
    assert.equal(stream.stats.retained, 0);
  } finally {
    camera.dispose();
    actor.dispose();
    stream.dispose();
  }
});
void test('cancellation releases only leg demand; invalid long destinations preserve the active journey and stream union', () => {
  const stream = new ChunkStream(new MemoryEdits(() => 0), 64, 0),
    actor = new StreamedWalker(stream, { x: 240, y: 48 });
  try {
    stream.advance(64);
    actor.go({ x: 496, y: 48 });
    const snapshot = actor.snapshot(),
      stats = stream.stats;
    assert.throws(() => actor.go({ x: 3000, y: 48 }), /outside/);
    assert.deepEqual(actor.snapshot(), snapshot);
    assert.equal(stream.stats.retained, stats.retained);
    actor.cancel();
    assert.equal(actor.snapshot().journey!.status, 'cancelled');
    assert.equal(stream.stats.owners, 1);
    assert.equal(actor.snapshot().routeDemand, false);
    assert.equal(stream.read({ x: 16, y: 1 }).state, 'missing');
    assert.equal(stream.read({ x: 7, y: 1 }).state, 'ready');
    actor.dispose();
    actor.dispose();
    assert.throws(() => actor.update(0.1), /disposed/);
  } finally {
    actor.dispose();
    stream.dispose();
  }
});
void test('async readiness never permits movement into missing data; bounded jobs and stale cancelled results cannot resurrect demand', async () => {
  const tasks: {
    chunk: { x: number; y: number };
    signal: AbortSignal;
    resolve: (tiles: Uint8Array) => void;
    done: boolean;
  }[] = [];
  const stream = new ChunkStream(new MemoryEdits(() => 0), 64, 0, {
    maxJobs: 2,
    load: (chunk, signal) =>
      new Promise((resolve) => {
        tasks.push({ chunk, signal, resolve, done: false });
      }),
  });
  const actor = new StreamedWalker(stream, { x: 240, y: 48 });
  const flush = async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  };
  async function warm() {
    for (let i = 0; i < 12; i++) {
      stream.advance(64);
      await flush();
      for (const task of tasks)
        if (!task.done) {
          task.done = true;
          task.resolve(new Uint8Array(64));
        }
      await flush();
    }
    stream.advance(64);
  }
  try {
    actor.go({ x: 496, y: 48 });
    stream.advance(64);
    await flush();
    actor.update(1);
    assert.equal(actor.position.x, 240);
    assert.equal(actor.snapshot().journey!.status, 'blocked');
    assert.ok(stream.stats.running <= 2);
    await warm();
    actor.update(3);
    assert.equal(actor.position.x, 496);
    assert.equal(actor.snapshot().journey!.status, 'arrived');
    await warm(); // Fill the new local halo before launching the extra journey chunk.
    actor.go({ x: 752, y: 48 });
    stream.advance(64);
    await flush();
    const current = tasks.filter((t) => !t.done);
    assert.ok(current.length > 0);
    actor.cancel();
    assert.ok(current.some((t) => t.signal.aborted));
    for (const t of current) {
      t.done = true;
      t.resolve(new Uint8Array(64));
    }
    await flush();
    stream.advance(64);
    assert.equal(stream.read({ x: 24, y: 1 }).state, 'missing');
    assert.ok(stream.stats.running <= 2);
    assert.equal(actor.snapshot().journey!.status, 'cancelled');
  } finally {
    actor.dispose();
    stream.dispose();
    for (const task of tasks) if (!task.done) task.resolve(new Uint8Array(64));
    await flush();
  }
});
void test('saved terrain edits are applied before navigation sees ready cells, not bypassed by actor demand', () => {
  const edits = new MemoryEdits(() => 0);
  edits.set({ x: 9, y: 1 }, 1);
  const stream = new ChunkStream(edits, 64, 0),
    actor = new StreamedWalker(stream);
  try {
    actor.go({ x: 304, y: 48 });
    stream.advance(64);
    actor.update(1);
    assert.equal(actor.snapshot().journey!.status, 'unreachable');
    assert.equal(actor.position.x, 48);
    assert.equal(actor.snapshot().routeDemand, false);
  } finally {
    actor.dispose();
    stream.dispose();
  }
});
