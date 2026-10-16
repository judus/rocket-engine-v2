import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bakeEnvironment,
  cubeDirection,
  EnvironmentMap,
  TextureImage,
} from '../src/3d/index.js';
import type { CubeFaces } from '../src/3d/index.js';
void test('constant radiance stays constant through every GGX mip and diffuse convolution; assets are immutable', () => {
  const env = bakeEnvironment(() => [0.25, 0.5, 0.75], {
    size: 8,
    diffuseSize: 3,
    lutSize: 8,
    samples: 64,
  });
  assert.equal(env.specular.length, 4);
  for (const faces of [...env.specular, env.diffuse])
    for (const image of faces) {
      const bytes = image.copyPixels();
      for (let i = 0; i < bytes.length; i += 4)
        assert.deepEqual([...bytes.slice(i, i + 4)], [64, 128, 191, 255]);
      bytes[0] = 0;
      assert.equal(image.copyPixels()[0], 64);
    }
  assert.ok(Object.isFrozen(env));
  assert.ok(Object.isFrozen(env.specular));
  assert.ok(Object.isFrozen(env.diffuse));
  const lut = env.brdf.copyPixels();
  // At near-normal incidence a smooth white metal returns almost all incoming radiance.
  assert.ok(lut[7 * 4]! > 245);
  assert.ok(lut[(7 * 8 + 7) * 4]! < 150); // rough single-scattering GGX loses more energy
  assert.throws(
    () => bakeEnvironment(() => [2, 0, 0], { size: 2, samples: 16 }),
    /radiance/,
  );
  assert.throws(() => bakeEnvironment(() => [0, 0, 0], { size: 3 }), /budget/);
  assert.throws(
    () => bakeEnvironment(() => [0, 0, 0], { samples: Infinity }),
    /budget/,
  );
  assert.throws(
    () => new EnvironmentMap(env.specular.slice(0, -1), env.diffuse, env.brdf),
    /complete|size|chain/,
  );
});
void test('cube orientation agrees at shared edges and GGX convolution broadens a directional panel', () => {
  const axis = cubeDirection(0, 0, 0);
  assert.equal(axis.x, 1);
  assert.ok(Math.abs(axis.y) < 1e-12);
  assert.ok(Math.abs(axis.z) < 1e-12);
  for (const [a, b] of [
    [cubeDirection(4, 1, 0), cubeDirection(0, -1, 0)],
    [cubeDirection(2, 0, 1), cubeDirection(4, 0, -1)],
  ])
    for (const key of ['x', 'y', 'z'] as const)
      assert.ok(Math.abs(a![key] - b![key]) < 1e-12);

  const env = bakeEnvironment((d) => (d.z > 0.9 ? [1, 1, 1] : [0, 0, 0]), {
    size: 8,
    diffuseSize: 2,
    lutSize: 4,
    samples: 128,
  });
  const sharp = env.specular[0]![4].copyPixels(),
    rough = env.specular[3]![4].copyPixels();
  assert.equal(sharp[(3 * 8 + 3) * 4], 255);
  assert.ok(rough[0]! > 0 && rough[0]! < 180);
  const wrongSpace = new TextureImage(1, 1, new Uint8Array([0, 0, 0, 255]));
  assert.throws(
    () =>
      new EnvironmentMap(
        env.specular,
        Array(6).fill(wrongSpace) as unknown as CubeFaces,
        env.brdf,
      ),
    /linear/,
  );
});
