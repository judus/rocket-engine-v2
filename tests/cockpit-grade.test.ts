import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeCockpit } from '../examples/3d/CockpitGrade.js';

void test('grading preserves source, every alpha value, transparent RGB and zero-setting identity', () => {
  const source = Uint8ClampedArray.from(
    Array.from({ length: 256 }, (_, a) => [120, 160, 200, a]).flat(),
  );
  const snapshot = source.slice();
  assert.deepEqual(
    gradeCockpit(source, { darkness: 0, shadowBlue: 0, highlightWarm: 0 }),
    source,
  );
  const graded = gradeCockpit(source, {
    darkness: 1,
    shadowBlue: 1,
    highlightWarm: 1,
  });
  for (let a = 0; a < 256; a++) assert.equal(graded[a * 4 + 3], a);
  assert.deepEqual(graded.slice(0, 4), source.slice(0, 4));
  assert.deepEqual(source, snapshot);
});
void test('curve darkens without reversing gray levels; split tones cool shadows and warm highlights', () => {
  const ramp = Uint8ClampedArray.from(
    Array.from({ length: 256 }, (_, v) => [v, v, v, 255]).flat(),
  );
  const neutral = gradeCockpit(ramp, {
    darkness: 1,
    shadowBlue: 0,
    highlightWarm: 0,
  });
  for (let v = 1; v < 256; v++) {
    assert.ok(neutral[v * 4]! >= neutral[(v - 1) * 4]!);
    assert.ok(neutral[v * 4]! <= v);
    assert.equal(neutral[v * 4], neutral[v * 4 + 2]);
  }
  const tinted = gradeCockpit(ramp, {
    darkness: 0.75,
    shadowBlue: 1,
    highlightWarm: 1,
  });
  assert.ok(tinted[64 * 4 + 2]! > tinted[64 * 4]!);
  assert.ok(tinted[220 * 4]! > tinted[220 * 4 + 1]!);
  assert.ok(tinted[220 * 4 + 1]! > tinted[220 * 4 + 2]!);
  assert.deepEqual(tinted.slice(0, 4), Uint8ClampedArray.from([0, 0, 0, 255]));
});
