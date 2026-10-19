import test from 'node:test';
import assert from 'node:assert/strict';
import { FrameRate } from '../games/ship/FrameRate.js';
void test('FPS measures completed frame intervals, smooths readings and resets across pauses', () => {
  const meter = new FrameRate();
  assert.equal(meter.frame(0), null);
  assert.equal(meter.frame(100), null);
  assert.equal(meter.frame(500), 4);
  assert.equal(meter.frame(1000), 2);
  meter.reset();
  assert.equal(meter.frame(100000), null);
  assert.equal(meter.frame(100500), 2);
  assert.throws(() => meter.frame(10), /monotonic/);
  assert.throws(() => meter.frame(NaN), /finite/);
});
