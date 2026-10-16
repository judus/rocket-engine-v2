import {
  Mesh3D,
  MeshGeometry,
  Node3D,
  PerspectiveCamera,
} from '../../src/3d/index.js';
import type { Light3D } from '../../src/3d/index.js';
import type { WebGLMeshRenderer3D } from '../../src/webgl/index.js';

/** Normal-incidence closed-form checks, deliberately separate from the general shader. */
export function materialProbe(
  renderer: WebGLMeshRenderer3D,
  width: number,
  height: number,
): string {
  const geometry = new MeshGeometry(
    [
      { x: -2, y: -1, z: 3 },
      { x: 2, y: -1, z: 3 },
      { x: 2, y: 1, z: 3 },
      { x: -2, y: 1, z: 3 },
    ],
    [{ id: 'front', indices: [0, 3, 2, 1], material: 0 }],
  );
  const root = new Node3D('material probe'),
    camera = new PerspectiveCamera();
  const encode = (linear: number) =>
    Math.round(
      255 *
        (linear <= 0.0031308
          ? 12.92 * linear
          : 1.055 * linear ** (1 / 2.4) - 0.055),
    );
  const samples: string[] = [];
  let pass = true;
  const sample = (
    label: string,
    metallic: number,
    roughness: number,
    expected: number,
    lights: readonly Light3D[],
    enabled = true,
    response = true,
  ) => {
    root.mesh = new Mesh3D(geometry, [
      {
        color: '#ffffff',
        metallicFactor: metallic,
        roughnessFactor: roughness,
      },
    ]);
    renderer.render(root, camera, width, height, {
      lights,
      lightingEnabled: enabled,
      materialResponseEnabled: response,
    });
    const actual = renderer.readPixel(
      Math.floor(width / 2),
      Math.floor(height / 2),
    )[0]!;
    pass &&= Math.abs(actual - expected) <= 2;
    samples.push(`${label} ${actual}/${expected}`);
    return actual;
  };
  const direct = (intensity: number): readonly Light3D[] => [
    {
      kind: 'directional',
      direction: { x: 0, y: 0, z: -1 },
      color: [1, 1, 1],
      intensity,
    },
  ];
  sample('dielectric r1', 0, 1, encode(0.97 / Math.PI), direct(1));
  sample('metal r1', 1, 1, encode(1 / (4 * Math.PI)), direct(1));
  sample(
    'metal r0.5',
    1,
    0.5,
    encode(0.1 / (4 * Math.PI * 0.5 ** 4)),
    direct(0.1),
  );
  sample('Lambert comparison', 1, 0.5, encode(0.25), direct(0.25), true, false);
  sample('metal diffuse ambient', 1, 0.5, 0, [
    { kind: 'ambient', color: [1, 1, 1], intensity: 1 },
  ]);
  sample('unlit', 1, 0.5, 255, [], false);
  sample('back light', 0, 0.5, 0, [
    {
      kind: 'directional',
      direction: { x: 0, y: 0, z: 1 },
      color: [1, 1, 1],
      intensity: 1,
    },
  ]);
  const facing = sample(
    'facing',
    1,
    0.5,
    encode(0.1 / (4 * Math.PI * 0.5 ** 4)),
    direct(0.1),
  );
  camera.x = 3;
  camera.yaw = -Math.PI / 4;
  renderer.render(root, camera, width, height, { lights: direct(0.1) });
  const moved = renderer.readPixel(
    Math.floor(width / 2),
    Math.floor(height / 2),
  )[0]!;
  pass &&= moved < facing / 2;
  samples.push(`view moved ${moved} < ${facing / 2}`);
  return `${pass ? 'PASS' : 'FAIL'} · ${samples.join(' · ')} (actual/expected red, tolerance 2).`;
}
