import {
  Mesh3D,
  MeshGeometry,
  Node3D,
  PerspectiveCamera,
} from '../../src/3d/index.js';
import { WebGLMeshRenderer3D } from '../../src/webgl/index.js';

/** Explicit diagnostic: synchronous readback, outside performance comparisons. */
export function opacityProbe(gl: WebGL2RenderingContext): string {
  const renderer = new WebGLMeshRenderer3D(gl);
  const geometry = new MeshGeometry(
    [
      { x: -4, y: -4, z: 0 },
      { x: 4, y: -4, z: 0 },
      { x: 0, y: 4, z: 0 },
    ],
    [{ id: 'plane', indices: [0, 1, 2], material: 0 }],
  );
  const root = new Node3D(),
    camera = new PerspectiveCamera();
  const plane = (color: string, opacity: number, z: number) => {
    const node = new Node3D();
    node.mesh = new Mesh3D(geometry, [{ color, opacity, unlit: true }]);
    node.transform = { ...node.transform, position: { x: 0, y: 0, z } };
    root.add(node);
    return node;
  };
  plane('#0000ff', 0.5, 4); // Deliberately front first: renderer must sort it last.
  plane('#ff0000', 1, 8);
  const middle = plane('#00ff00', 0.5, 6);
  const check = (expected: readonly number[]) => {
    renderer.render(
      root,
      camera,
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
      { clearColor: [0, 0, 0] },
    );
    const actual = renderer.readPixel(
      Math.floor(gl.drawingBufferWidth / 2),
      Math.floor(gl.drawingBufferHeight / 2),
    );
    if (expected.some((v, i) => Math.abs(actual[i]! - v) > 3))
      throw Error(`Opacity probe: expected ${expected}, got ${actual}`);
    return actual.join('/');
  };
  try {
    const blend = check([64, 64, 128, 255]);
    middle.mesh = new Mesh3D(geometry, [
      { color: '#00ff00', opacity: 1, unlit: true },
    ]);
    middle.transform = { ...middle.transform, position: { x: 0, y: 0, z: 2 } };
    const occlusion = check([0, 255, 0, 255]);
    return `PASS · sorted alpha ${blend} · opaque occlusion ${occlusion} · diagnostic resources disposed`;
  } finally {
    renderer.dispose();
  }
}
