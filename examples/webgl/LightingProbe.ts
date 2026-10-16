import {
  Mesh3D,
  MeshGeometry,
  Node3D,
  PerspectiveCamera,
} from '../../src/3d/index.js';
import type { Light3D } from '../../src/3d/index.js';
import type { WebGLMeshRenderer3D } from '../../src/webgl/index.js';

/** Explicit readback diagnostic; never invoked during normal rendering/timing. */
export function lightingProbe(
  renderer: WebGLMeshRenderer3D,
  width: number,
  height: number,
): string {
  const root = new Node3D('lighting probe');
  root.mesh = new Mesh3D(
    new MeshGeometry(
      [
        { x: -2, y: -1, z: 3 },
        { x: 2, y: -1, z: 3 },
        { x: 2, y: 1, z: 3 },
        { x: -2, y: 1, z: 3 },
      ],
      [{ id: 'front', indices: [0, 3, 2, 1], material: 0 }],
    ),
    [{ color: '#ffffff' }],
  );
  const camera = new PerspectiveCamera();
  camera.verticalFov = Math.PI / 2;
  const centerX = Math.floor(width / 2),
    centerY = Math.floor(height / 2);
  const sample = (lights: readonly Light3D[], enabled = true, x = centerX) => {
    renderer.render(root, camera, width, height, {
      lights,
      lightingEnabled: enabled,
    });
    return renderer.readPixel(x, centerY)[0]!;
  };
  const dark = sample([]),
    unlit = sample([], false);
  const ambient = sample([
    { kind: 'ambient', color: [1, 1, 1], intensity: 0.25 },
  ]);
  const front = sample([
    {
      kind: 'directional',
      direction: { x: 0, y: 0, z: -1 },
      color: [1, 1, 1],
      intensity: 0.25,
    },
  ]);
  const back = sample([
    {
      kind: 'directional',
      direction: { x: 0, y: 0, z: 1 },
      color: [1, 1, 1],
      intensity: 1,
    },
  ]);
  const point: Light3D = {
    kind: 'point',
    position: { x: 0, y: 0, z: 1 },
    color: [1, 1, 1],
    intensity: 1,
  };
  const center = sample([point]),
    edge = sample([point], true, centerX + Math.round(height / 6));
  const far = sample([{ ...point, position: { x: 0, y: 0, z: -1 } }]);
  const near = (v: number, expected: number) => Math.abs(v - expected) <= 2;
  const pass =
    dark === 0 &&
    unlit === 255 &&
    near(ambient, 137) &&
    near(front, 137) &&
    back === 0 &&
    near(center, 137) &&
    near(edge, 117) &&
    near(far, 71);
  return `${pass ? 'PASS' : 'FAIL'} · red-channel samples: dark ${dark}/0, unlit ${unlit}/255, ambient ${ambient}/137, directional front ${front}/137, back ${back}/0, point center ${center}/137, off-center ${edge}/117, farther ${far}/71 (actual/expected, tolerance 2).`;
}
