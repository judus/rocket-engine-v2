import { runLineDemo } from './LineDemo.js';
import { transformPoint } from '../../src/3d/index.js';
import { cubeGeometry, cubeMaterials } from './CubeGeometry.js';
import { Node3D, Mesh3D, matrixPoint } from '../../src/3d/index.js';
import { createCubeControls } from './CubeControls.js';

await runLineDemo(() => {
  const controls = createCubeControls();
  const node = new Node3D('cube');
  node.mesh = new Mesh3D(cubeGeometry, cubeMaterials);
  const readout = document.querySelector<HTMLOutputElement>('#cube-status')!;
  return {
    update: controls.update,
    bind: controls.bind,
    draw(line) {
      const pose = controls.pose();
      node.transform = pose;
      const matrix = node.worldMatrix();
      const world = cubeGeometry.vertices.map((point) =>
        matrixPoint(matrix, point),
      );
      for (const [a, b] of cubeGeometry.edges)
        line(world[a]!, world[b]!, '#f5d38b', 2);
      const center = transformPoint({ x: 0, y: 0, z: 0 }, pose);
      for (const [point, color] of [
        [{ x: 1.6, y: 0, z: 0 }, '#ef987f'],
        [{ x: 0, y: 1.6, z: 0 }, '#80dbbd'],
        [{ x: 0, y: 0, z: 1.6 }, '#83b9f5'],
      ] as const)
        line(center, transformPoint(point, pose), color, 2);
      const message = `8 vertices · 12 edges + 3 local axes · Y rotation ${(((pose.rotation.y * 180) / Math.PI) % 360).toFixed(1)}°`;
      if (readout.value !== message) readout.value = message;
    },
  };
});
