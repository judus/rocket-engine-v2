import {
  Mesh3D,
  MeshGeometry,
  Node3D,
  PerspectiveCamera,
  TextureImage,
} from '../../src/3d/index.js';
import type { TextureFilter, TextureWrap } from '../../src/3d/index.js';
import type { WebGLMeshRenderer3D } from '../../src/webgl/index.js';

/** Explicit readback; excluded from normal timing. UV origin, wrap and linear-light sampling. */
export function textureProbe(
  renderer: WebGLMeshRenderer3D,
  width: number,
  height: number,
): string {
  const image = new TextureImage(
    2,
    2,
    new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]),
  );
  const camera = new PerspectiveCamera();
  const root = new Node3D('texture probe');
  const checks: string[] = [];
  let pass = true;
  const sample = (
    label: string,
    u: number,
    v: number,
    expected: readonly number[],
    filter: TextureFilter = 'nearest',
    wrapS: TextureWrap = 'repeat',
    lit = false,
  ) => {
    root.mesh = new Mesh3D(
      new MeshGeometry(
        [
          { x: -2, y: -1, z: 3 },
          { x: 2, y: -1, z: 3 },
          { x: 2, y: 1, z: 3 },
          { x: -2, y: 1, z: 3 },
        ],
        [{ id: 'quad', indices: [0, 3, 2, 1], material: 0 }],
        [],
        { texCoords: Array.from({ length: 4 }, () => [u, v] as const) },
      ),
      [{ color: '#ffffff', baseColorTexture: { image, filter, wrapS } }],
    );
    renderer.render(root, camera, width, height, {
      lightingEnabled: lit,
      lights: [{ kind: 'ambient', color: [1, 1, 1], intensity: 0.25 }],
    });
    const actual = renderer
      .readPixel(Math.floor(width / 2), Math.floor(height / 2))
      .slice(0, 3);
    const ok = actual.every((c, i) => Math.abs(c - expected[i]!) <= 2);
    pass &&= ok;
    checks.push(
      `${label} ${actual.join(',')}${ok ? ' ✓' : ` expected ${expected.join(',')}`}`,
    );
  };
  sample('top-left', 0.25, 0.25, [255, 0, 0]);
  sample('top-right', 0.75, 0.25, [0, 255, 0]);
  sample('bottom-left', 0.25, 0.75, [0, 0, 255]);
  sample('repeat', 1.25, 0.25, [255, 0, 0]);
  sample('clamp', 1.25, 0.25, [0, 255, 0], 'nearest', 'clamp');
  sample('mirror', 1.25, 0.25, [0, 255, 0], 'nearest', 'mirror');
  sample('linear sRGB mix', 0.5, 0.5, [188, 188, 188], 'linear');
  sample('lit white', 0.75, 0.75, [137, 137, 137], 'nearest', 'repeat', true);
  return `${pass ? 'PASS' : 'FAIL'} · ${checks.join(' · ')} (RGB tolerance 2).`;
}
