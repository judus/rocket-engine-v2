import { runLineDemo } from './LineDemo.js';
import { createCubeControls } from './CubeControls.js';
import { cubeGeometry, cubeMaterials } from './CubeGeometry.js';
import { Node3D, Mesh3D, CanvasRenderer3D } from '../../src/3d/index.js';

await runLineDemo(() => {
  const controls = createCubeControls();
  const node = new Node3D('cube');
  node.mesh = new Mesh3D(cubeGeometry, cubeMaterials);
  const renderer = new CanvasRenderer3D();
  const outlines = document.querySelector<HTMLInputElement>('#outlines')!;
  const metric = document.querySelector<HTMLElement>('#perf-faces')!;
  const readout = document.querySelector<HTMLOutputElement>('#cube-status')!;
  outlines.checked = true;
  return {
    update: controls.update,
    bind: controls.bind,
    draw(_line, { ctx, camera, width, height }) {
      const pose = controls.pose();
      node.transform = pose;
      const result = renderer.render(
        ctx,
        node,
        camera,
        width,
        height,
        outlines.checked ? { color: '#d9eadf', width: 1 } : undefined,
      );
      const count = `${result.visible.length} / ${result.submitted}`;
      if (metric.textContent !== count) metric.textContent = count;
      const message = `6 faces · ${result.backFacing} back-facing · ${result.outside} outside view · Y rotation ${(((pose.rotation.y * 180) / Math.PI) % 360).toFixed(1)}°`;
      if (readout.value !== message) readout.value = message;
    },
  };
});
