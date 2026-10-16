import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraPan } from '../examples/workshop/TerrainViewport.js';

void test('camera inertia agrees across frame partitions and coasts on release', () => {
  const single = new CameraPan(),
    divided = new CameraPan();
  const expected = single.step(1, 0, 1);
  let distance = 0;
  for (let i = 0; i < 100; i++) distance += divided.step(1, 0, 0.01).x;
  assert.ok(Math.abs(distance - expected.x) < 1e-9);
  assert.ok(single.step(0, 0, 0.1).x > 0);
  single.reset();
  assert.deepEqual(single.step(0, 0, 1), { x: 0, y: 0 });
  const diagonal = new CameraPan().step(1, 1, 1);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - expected.x) < 1e-9);
});
