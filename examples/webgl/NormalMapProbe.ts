import {
  Mesh3D,
  MeshGeometry,
  Node3D,
  PerspectiveCamera,
  TextureImage,
} from '../../src/3d/index.js';
import type { WebGLMeshRenderer3D } from '../../src/webgl/index.js';
/** Known tangent-space directions, affine placements, and actual Lambert response. Explicit readback only. */
export function normalMapProbe(
  renderer: WebGLMeshRenderer3D,
  width: number,
  height: number,
): string {
  const root = new Node3D('normal probe'),
    camera = new PerspectiveCamera();
  let pass = true;
  const results: string[] = [];
  const pixels = {
    flat: [128, 128, 255, 255],
    x: [204, 128, 230, 255],
    y: [128, 204, 230, 255],
  };
  const sample = (
    name: string,
    color: keyof typeof pixels,
    expected: readonly number[],
    options: {
      hand?: number;
      mirror?: boolean;
      rotate?: boolean;
      scale?: boolean;
      shear?: boolean;
      strength?: number;
      enabled?: boolean;
      lambert?: boolean;
    } = {},
  ) => {
    const image = new TextureImage(1, 1, new Uint8Array(pixels[color]), {
      colorSpace: 'linear',
    });
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
        normals: Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: -1 })),
        tangents: Array.from(
          { length: 4 },
          () => [1, 0, 0, options.hand ?? 1] as const,
        ),
        texCoords: [
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      },
    );
    root.mesh = new Mesh3D(geometry, [
      {
        color: '#ffffff',
        metallicFactor: 0,
        roughnessFactor: 1,
        normalTexture: { image },
        normalScale: options.strength ?? 1,
      },
    ]);
    root.matrix = options.shear
      ? [1, 0.5, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
      : null;
    root.transform = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: options.rotate ? Math.PI / 2 : 0 },
      scale: {
        x: options.mirror ? -1 : options.scale ? 2 : 1,
        y: options.scale ? 0.5 : 1,
        z: 1,
      },
    };
    renderer.render(root, camera, width, height, {
      normalDebug: !options.lambert,
      normalMappingEnabled: options.enabled ?? true,
      materialResponseEnabled: false,
      lights: options.lambert
        ? [
            {
              kind: 'directional',
              direction: { x: 1, y: 0, z: 0 },
              color: [1, 1, 1],
              intensity: 1,
            },
          ]
        : [],
    });
    const actual = renderer
      .readPixel(Math.floor(width / 2), Math.floor(height / 2))
      .slice(0, 3);
    pass &&= actual.every((v, i) => Math.abs(v - expected[i]!) <= 2);
    results.push(`${name} ${actual.join(',')}/${expected.join(',')}`);
  };
  sample('flat', 'flat', [128, 127, 0]);
  sample('+T', 'x', [204, 127, 25]);
  sample('+B', 'y', [128, 51, 25]);
  sample('hand -1', 'y', [128, 204, 25], { hand: -1 });
  sample('mirror X', 'x', [51, 127, 25], { mirror: true });
  sample('rotate Z', 'x', [128, 204, 25], { rotate: true });
  sample('nonuniform', 'x', [204, 127, 25], { scale: true });
  sample('shear', 'x', [196, 161, 25], { shear: true });
  sample('strength 0', 'x', [128, 128, 0], { strength: 0 });
  sample('disabled', 'x', [128, 128, 0], { enabled: false });
  sample('Lambert mapped', 'x', [203, 203, 203], { lambert: true });
  sample('Lambert disabled', 'x', [0, 0, 0], { enabled: false, lambert: true });
  return `${pass ? 'PASS' : 'FAIL'} · ${results.join(' · ')} (actual/expected RGB, tolerance 2).`;
}
