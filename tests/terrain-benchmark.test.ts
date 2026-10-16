import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TerrainBenchmark,
  demandedChunks,
  benchmarkStops,
  stopMs,
  settleMs,
} from '../examples/terrain/TerrainBenchmark.js';
import { generateTerrain, validInput } from '../examples/workers/task.js';
import { TerrainGenerator } from '../examples/terrain/TerrainGenerator.js';
const area = { minX: -8, minY: -8, maxX: 0, maxY: 0 };
void test('benchmark chunk union floors signed bounds and deduplicates views', () => {
  assert.deepEqual(demandedChunks([area, area]), [{ x: -1, y: -1 }]);
  assert.equal(
    demandedChunks([{ minX: -1, minY: -1, maxX: 1, maxY: 1 }]).length,
    4,
  );
});
void test('generation passes change CPU workload, never the resulting terrain or identity', () => {
  const g = new TerrainGenerator({ seed: 42, scale: 96 });
  const input = { ...g.config, identity: g.identity, x: -2, y: 1, passes: 1 };
  assert.deepEqual(
    generateTerrain({ ...input, passes: 64 }).bytes,
    generateTerrain(input).bytes,
  );
  for (const passes of [0, 1.2, 1025, NaN, Infinity])
    assert.equal(validInput({ ...input, passes }), false);
});
void test('route uses actual wall clock, reports raw spikes and demand-to-publication latency', () => {
  const b = new TerrainBenchmark();
  assert.equal(b.advance(100), 0);
  b.demand([area]);
  b.observe(100, () => ({ state: 'pending' }));
  b.advance(350);
  b.observe(350, () => ({ state: 'ready', value: 0 }));
  assert.equal(b.result.maxFrameMs, 250);
  assert.equal(b.result.over50ms, 1);
  assert.equal(b.result.p95FrameMsUpper, 250);
  assert.equal(b.result.meanReadyMs, 250);
  assert.equal(b.result.ready, 1);
  const detached = b.result;
  detached.stops[0]!.ready = 99;
  assert.equal(b.result.stops[0]?.ready, 1);
  for (let i = 1; i < benchmarkStops.length; i++) {
    assert.equal(b.advance(100 + i * stopMs), i);
    b.demand([area]);
    b.observe(100 + i * stopMs + 20, () => ({ state: 'ready', value: 0 }));
  }
  b.advance(100 + benchmarkStops.length * stopMs);
  b.observe(100 + benchmarkStops.length * stopMs, () => ({
    state: 'ready',
    value: 0,
  }));
  assert.equal(b.result.state, 'complete');
  assert.equal(b.result.p95FrameMsUpper, null);
  assert.equal(b.result.p95Over499ms, true);
  assert.equal(b.result.requested, 6);
  assert.equal(b.result.ready, 6);
  const frames = b.result.frames;
  b.advance(999999);
  assert.equal(b.result.frames, frames);
});
void test('unfinished demand stays in denominators and failure/hidden/cancel/timeout invalidate', () => {
  const b = new TerrainBenchmark();
  b.advance(0);
  b.demand([area]);
  b.observe(1, () => ({ state: 'pending' }));
  b.advance(stopMs);
  b.demand([area]);
  assert.equal(b.result.unfinishedAtStop, 1);
  assert.equal(b.result.requested, 2);
  b.observe(stopMs + 1, () => ({ state: 'failed', error: 'load' }));
  assert.equal(b.result.state, 'invalid');
  for (const reason of ['Tab hidden during run', 'Cancelled by user']) {
    const c = new TerrainBenchmark();
    c.advance(0);
    c.invalidate(reason);
    assert.equal(c.result.reason, reason);
  }
  const timeout = new TerrainBenchmark();
  for (let i = 0; i < benchmarkStops.length; i++) {
    timeout.advance(i * stopMs);
    timeout.demand([area]);
  }
  timeout.advance(benchmarkStops.length * stopMs + settleMs);
  timeout.observe(benchmarkStops.length * stopMs + settleMs, () => ({
    state: 'pending',
  }));
  assert.equal(timeout.result.reason, 'Final stop readiness timed out');
  const skipped = new TerrainBenchmark();
  skipped.advance(0);
  skipped.advance(2 * stopMs);
  assert.equal(skipped.result.state, 'invalid');
});
