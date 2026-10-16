import {
  Mesh3D,
  MeshGeometry,
  Node3D,
  PerspectiveCamera,
  TextureImage,
} from '../../src/3d/index.js';
import type { Light3D } from '../../src/3d/index.js';
import type { WebGLMeshRenderer3D } from '../../src/webgl/index.js';

/** Explicit readback: linear data, packing, factors and AO ownership. Not part of frame timing. */
export function packedMapProbe(
  renderer: WebGLMeshRenderer3D,
  width: number,
  height: number,
): string {
  const image = (r: number) =>
    new TextureImage(1, 1, new Uint8Array([r, 128, 192, 255]), {
      colorSpace: 'linear',
    });
  const data = image(64),
    dark = image(0),
    clear = image(255);
  const geometry = new MeshGeometry(
    [
      { x: -2, y: -1, z: 3 },
      { x: 2, y: -1, z: 3 },
      { x: 2, y: 1, z: 3 },
      { x: -2, y: 1, z: 3 },
    ],
    [{ id: 'front', indices: [0, 3, 2, 1], material: 0 }],
    [],
    {
      texCoords: [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
      ],
    },
  );
  const root = new Node3D('packed map probe'),
    camera = new PerspectiveCamera();
  const encode = (linear: number) =>
    Math.round(
      255 *
        (linear <= 0.0031308
          ? 12.92 * linear
          : 1.055 * linear ** (1 / 2.4) - 0.055),
    );
  const sample = (
    debug: 'none' | 'occlusion' | 'roughness' | 'metallic',
    map: TextureImage | null = data,
    factors: readonly [number, number] = [1, 1],
    strength = 1,
    lights: readonly Light3D[] = [],
    emission = 0,
  ) => {
    root.mesh = new Mesh3D(geometry, [
      {
        color: '#ffffff',
        metallicFactor: factors[0],
        roughnessFactor: factors[1],
        occlusionStrength: strength,
        emissiveFactor: [emission, emission, emission],
        ...(map
          ? {
              metallicRoughnessTexture: { image: map },
              occlusionTexture: { image: map },
            }
          : {}),
      },
    ]);
    renderer.render(root, camera, width, height, {
      lights,
      materialDebug: debug,
    });
    return renderer.readPixel(
      Math.floor(width / 2),
      Math.floor(height / 2),
    )[0]!;
  };
  const results: string[] = [];
  let pass = true;
  const check = (name: string, actual: number, expected: number) => {
    pass &&= Math.abs(actual - expected) <= 2;
    results.push(`${name} ${actual}/${expected}`);
  };
  check('linear G', sample('roughness'), 128);
  check('linear B', sample('metallic'), 192);
  check('AO R', sample('occlusion'), 64);
  check('G × 0.5', sample('roughness', data, [1, 0.5]), 64);
  check('B × 0.5', sample('metallic', data, [0.5, 1]), 96);
  check('AO strength 0.5', sample('occlusion', data, [1, 1], 0.5), 160);
  check('neutral absent map', sample('roughness', null, [1, 1]), 255);
  const ambient: readonly Light3D[] = [
    { kind: 'ambient', color: [1, 1, 1], intensity: 0.25 },
  ];
  check(
    'AO ambient',
    sample('none', data, [0, 1], 1, ambient),
    encode((0.25 * 64) / 255),
  );
  check('AO disabled', sample('none', data, [0, 1], 0, ambient), 137);
  check('AO leaves emission', sample('none', dark, [0, 1], 1, [], 0.25), 137);
  const direct: readonly Light3D[] = [
    {
      kind: 'directional',
      direction: { x: 0, y: 0, z: -1 },
      color: [1, 1, 1],
      intensity: 0.25,
    },
  ];
  const shadowed = sample('none', dark, [0, 1], 1, direct),
    unshadowed = sample('none', clear, [0, 1], 1, direct);
  check('AO leaves direct', shadowed, unshadowed);
  return `${pass ? 'PASS' : 'FAIL'} · ${results.join(' · ')} (actual/expected red, tolerance 2).`;
}
