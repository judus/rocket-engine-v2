import test from 'node:test';
import assert from 'node:assert/strict';
import { transformPoint } from '../src/3d/index.js';
import type { Vec3 } from '../src/3d/index.js';

const zero = { x: 0, y: 0, z: 0 };
const one = { x: 1, y: 1, z: 1 };
function close(actual: Vec3, expected: Vec3) {
  for (const axis of ['x', 'y', 'z'] as const)
    assert.ok(
      Math.abs(actual[axis] - expected[axis]) < 1e-9,
      `${axis}: ${actual[axis]} != ${expected[axis]}`,
    );
}
void test('local scale is applied before rotation, then world translation', () => {
  const point = Object.freeze({ x: 1, y: 2, z: 3 });
  close(
    transformPoint(point, {
      scale: { x: 2, y: 3, z: 4 },
      rotation: { x: 0, y: 0, z: Math.PI / 2 },
      position: { x: 10, y: 20, z: 30 },
    }),
    { x: 4, y: 22, z: 42 },
  );
  assert.deepEqual(point, { x: 1, y: 2, z: 3 });
});
void test('individual positive quarter turns obey the documented right-handed axes', () => {
  const angle = Math.PI / 2;
  close(
    transformPoint(
      { x: 0, y: 1, z: 0 },
      { position: zero, scale: one, rotation: { x: angle, y: 0, z: 0 } },
    ),
    { x: 0, y: 0, z: 1 },
  );
  close(
    transformPoint(
      { x: 0, y: 0, z: 1 },
      { position: zero, scale: one, rotation: { x: 0, y: angle, z: 0 } },
    ),
    { x: 1, y: 0, z: 0 },
  );
  close(
    transformPoint(
      { x: 1, y: 0, z: 0 },
      { position: zero, scale: one, rotation: { x: 0, y: 0, z: angle } },
    ),
    { x: 0, y: 1, z: 0 },
  );
});
void test('combined rotation is X then Y then Z; zero scale collapses to position', () => {
  close(
    transformPoint(
      { x: 1, y: 2, z: 3 },
      {
        position: zero,
        scale: one,
        rotation: { x: Math.PI / 2, y: Math.PI / 2, z: Math.PI / 2 },
      },
    ),
    { x: 3, y: 2, z: -1 },
  );
  close(
    transformPoint(
      { x: 1, y: 2, z: 3 },
      {
        position: { x: 4, y: 5, z: 6 },
        scale: zero,
        rotation: { x: 1, y: 2, z: 3 },
      },
    ),
    { x: 4, y: 5, z: 6 },
  );
});
