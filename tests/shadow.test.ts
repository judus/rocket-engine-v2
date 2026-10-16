import test from 'node:test';
import assert from 'node:assert/strict';
import {
  directionalShadowMatrix,
  matrixPoint,
  identityMatrix,
} from '../src/3d/index.js';
import { validateDirectionalShadow } from '../src/3d/DirectionalShadow.js';
const light = {
  kind: 'directional',
  direction: { x: 0, y: 1, z: 0 },
  color: [1, 1, 1],
  intensity: 1,
} as const;
void test('directional shadow volume has the light-facing depth convention and stable vertical-light basis', () => {
  const matrix = directionalShadowMatrix(
    light.direction,
    { x: 2, y: 3, z: 4 },
    5,
    20,
  );
  const center = matrixPoint(matrix, { x: 2, y: 3, z: 4 }),
    near = matrixPoint(matrix, { x: 2, y: 13, z: 4 }),
    far = matrixPoint(matrix, { x: 2, y: -7, z: 4 });
  assert.ok(Math.hypot(center.x, center.y, center.z) < 1e-12);
  assert.equal(near.z, -1);
  assert.equal(far.z, 1);
  assert.ok(Math.abs(matrixPoint(matrix, { x: 7, y: 3, z: 4 }).x) === 1);
  assert.deepEqual(
    matrix,
    directionalShadowMatrix({ x: 0, y: 10, z: 0 }, { x: 2, y: 3, z: 4 }, 5, 20),
  );
  assert.throws(
    () =>
      directionalShadowMatrix(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
        5,
        20,
      ),
    /nonzero/,
  );
});
void test('shadow contract rejects non-directional indices, bad budgets, singular projections and negative bias', () => {
  validateDirectionalShadow({ lightIndex: 0, matrix: identityMatrix }, [light]);
  for (const bad of [
    { lightIndex: 1 },
    { resolution: 63 },
    { resolution: 4096 },
    { bias: -0.1 },
    { slopeBias: NaN },
    { filter: 'blur' },
  ])
    assert.throws(() =>
      validateDirectionalShadow(
        { lightIndex: 0, matrix: identityMatrix, ...bad } as never,
        [light],
      ),
    );
  assert.throws(
    () =>
      validateDirectionalShadow({ lightIndex: 0, matrix: identityMatrix }, [
        { kind: 'ambient', color: [1, 1, 1], intensity: 1 },
      ]),
    /directional/,
  );
  const singular = [...identityMatrix];
  singular[0] = 0;
  assert.throws(
    () =>
      validateDirectionalShadow(
        { lightIndex: 0, matrix: singular as unknown as typeof identityMatrix },
        [light],
      ),
    /projection/,
  );
});
