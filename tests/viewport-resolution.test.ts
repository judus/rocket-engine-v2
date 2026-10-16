import test from 'node:test';
import assert from 'node:assert/strict';
import { viewportResolution } from '../examples/webgl/ViewportResolution.js';
void test('viewport follows physical pixels and render scale, fitting GPU limits without changing aspect', () => {
  assert.deepEqual(viewportResolution(1920, 1080, 2, 1, 16384, 16384), {
    width: 3840,
    height: 2160,
    limited: false,
  });
  assert.deepEqual(viewportResolution(1920, 1080, 2, 0.5, 16384, 16384), {
    width: 1920,
    height: 1080,
    limited: false,
  });
  assert.deepEqual(viewportResolution(1920, 1080, 2, 2, 4096, 2048), {
    width: 3640,
    height: 2048,
    limited: true,
  });
  assert.deepEqual(viewportResolution(0, 0, 1, 1, 4096, 4096), {
    width: 1,
    height: 1,
    limited: false,
  });
});
