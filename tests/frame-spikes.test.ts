import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameSpikes } from '../examples/workshop/FrameSpikes.js';

void test('spikes associate late callbacks with preceding render and intervening generation', () => {
  let now = 0;
  const recorder = new FrameSpikes(() => now);
  recorder.begin(0, null);
  recorder.measure('render', () => {
    now += 3;
  });
  recorder.measure('generation', () => {
    now += 6;
  });
  recorder.built(2);
  recorder.begin(0.025, null);
  const row = recorder.rows[0]!;
  assert.equal(row.intervalMs, 25);
  assert.equal(row.workMs, 9);
  assert.equal(row.costs.generation, 6);
  assert.equal(row.costs.render, 3);
  assert.equal(row.chunks, 1);
  assert.equal(row.builds, 2);
  assert.ok(Object.isFrozen(row.costs));
  recorder.begin(0.007, null);
  assert.equal(recorder.rows.length, 1);
});
void test('spike histories are bounded and reset excludes inactive gaps and old timings', () => {
  const recorder = new FrameSpikes(() => 0);
  recorder.begin(0, null);
  for (let i = 0; i < 32; i++) recorder.begin(0.007, null);
  for (let i = 0; i < 20; i++) recorder.begin(0.1, 60);
  assert.equal(recorder.rows.length, 12);
  assert.ok(recorder.rows[0]!.frame > 32);
  recorder.begin(0, null);
  recorder.begin(0.007, null);
  assert.equal(recorder.rows.length, 12);
  recorder.clear();
  assert.equal(recorder.rows.length, 0);
  recorder.dispose();
  recorder.begin(0.1, 60);
  assert.equal(recorder.rows.length, 0);
});
void test('normal capped intervals are not spikes and failed measured work retains its duration', () => {
  let now = 0;
  const recorder = new FrameSpikes(() => now);
  recorder.begin(0, 30);
  for (let i = 0; i < 40; i++) recorder.begin(1 / 30, 30);
  assert.equal(recorder.rows.length, 0);
  assert.throws(() =>
    recorder.measure('artwork', () => {
      now += 10;
      throw new Error('failed build');
    }),
  );
  recorder.begin(1 / 30, 30);
  assert.equal(recorder.rows[0]!.costs.artwork, 10);
  assert.equal(recorder.rows[0]!.workMs, 10);
});
