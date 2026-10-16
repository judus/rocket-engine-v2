import { runLineDemo } from './LineDemo.js';
import { createCubeControls } from './CubeControls.js';
import { cubeGeometry, cubeMaterials } from './CubeGeometry.js';
import { Node3D, Mesh3D, CanvasRenderer3D } from '../../src/3d/index.js';

await runLineDemo(() => {
  const controls = createCubeControls();
  const assembly = new Node3D('assembly');
  const left = new Node3D('left');
  const right = new Node3D('right');
  // One immutable geometry, two independent surface bindings and placements.
  left.mesh = new Mesh3D(cubeGeometry, cubeMaterials);
  right.mesh = new Mesh3D(
    cubeGeometry,
    cubeMaterials.map(() => ({ color: '#d8a568' })),
  );
  left.transform = {
    position: { x: -1.8, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0.3 },
    scale: { x: 0.65, y: 1, z: 0.65 },
  };
  right.transform = {
    position: { x: 1.8, y: 0, z: 0 },
    rotation: { x: 0.2, y: 0.5, z: 0 },
    scale: { x: 0.7, y: 0.7, z: 0.7 },
  };
  assembly.add(left).add(right);
  const renderer = new CanvasRenderer3D();
  const outlines = document.querySelector<HTMLInputElement>('#outlines')!;
  const detached = document.querySelector<HTMLInputElement>('#detach-child')!;
  const metric = document.querySelector<HTMLElement>('#perf-faces')!;
  const readout = document.querySelector<HTMLOutputElement>('#cube-status')!;
  detached.checked = false;
  outlines.checked = true;
  return {
    update: controls.update,
    bind(signal) {
      controls.bind(signal);
      detached.addEventListener(
        'change',
        () => {
          if (detached.checked) assembly.remove(right);
          else assembly.add(right);
        },
        { signal },
      );
    },
    draw(_line, { ctx, camera, width, height }) {
      assembly.transform = controls.pose();
      const result = renderer.render(
        ctx,
        assembly,
        camera,
        width,
        height,
        outlines.checked ? { color: '#d9eadf', width: 1 } : undefined,
      );
      metric.textContent = `${result.visible.length} / ${result.submitted}`;
      const message = `1 shared geometry · ${assembly.children.length} mesh nodes · ${result.submitted} faces · parent transform moves both children`;
      if (readout.value !== message) readout.value = message;
    },
  };
});
