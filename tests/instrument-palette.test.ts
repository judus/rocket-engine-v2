import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInstrumentPalette,
  instrumentPalette,
} from '../games/farwake/InstrumentPalette.js';

void test('default instrument palette preserves authored colours and matching linear spill', () => {
  assert.equal(instrumentPalette.primary, '#86ead6');
  assert.equal(instrumentPalette.muted, '#6a9691');
  assert.equal(instrumentPalette.classicReticle, '#68bda9');
  assert.equal(instrumentPalette.background, '#030b0e');
  assert.ok(Object.isFrozen(instrumentPalette));
  assert.ok(Object.isFrozen(instrumentPalette.spill));
  const expected = [134, 234, 214].map(
    (v) => ((v / 255 + 0.055) / 1.055) ** 2.4,
  );
  assert.deepEqual(instrumentPalette.spill, expected);
});
void test('hue offset shifts instrument roles together without changing RGB extrema', () => {
  for (const offset of [-180, -120, -60, 60, 120, 180]) {
    const shifted = createInstrumentPalette(offset);
    assert.notEqual(shifted.primary, instrumentPalette.primary);
    for (const key of [
      'primary',
      'muted',
      'border',
      'background',
      'gaugeTrack',
      'switchOn',
      'switchOff',
      'classicReticle',
    ] as const) {
      const channels = (hex: string) =>
        [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      assert.equal(
        Math.min(...channels(shifted[key])),
        Math.min(...channels(instrumentPalette[key])),
      );
      assert.equal(
        Math.max(...channels(shifted[key])),
        Math.max(...channels(instrumentPalette[key])),
      );
    }
    assert.notDeepEqual(shifted.spill, instrumentPalette.spill);
  }
});
void test('invalid hue offsets fail at the palette boundary', () => {
  for (const value of [NaN, Infinity, -181, 181])
    assert.throws(() => createInstrumentPalette(value), /hue offset/);
});
