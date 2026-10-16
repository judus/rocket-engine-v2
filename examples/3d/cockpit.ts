import { runLineDemo } from './LineDemo.js';
import { cockpitParts, seatView, inspectionView } from './CockpitModel.js';
import { createBoxAssembly } from './BoxAssembly.js';
import { CanvasRenderer3D, collectFaces } from '../../src/3d/index.js';
import type { Face } from '../../src/3d/index.js';

await runLineDemo(() => {
  const yaw = document.querySelector<HTMLInputElement>('#assembly-yaw')!;
  const yawValue = document.querySelector<HTMLOutputElement>(
    '#assembly-yaw-value',
  )!;
  const outlines = document.querySelector<HTMLInputElement>('#outlines')!;
  const readout =
    document.querySelector<HTMLOutputElement>('#assembly-status')!;
  const metric = document.querySelector<HTMLElement>('#perf-faces')!;
  yaw.value = '0';
  outlines.checked = true;
  const assembly = createBoxAssembly(cockpitParts);
  const renderer = new CanvasRenderer3D();
  let geometry: Face[];
  const rebuild = () => {
    assembly.transform = {
      position: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      rotation: { x: 0, y: (Number(yaw.value) * Math.PI) / 180, z: 0 },
    };
    geometry = collectFaces(assembly);
    yawValue.value = `${yaw.value}°`;
  };
  rebuild();
  return {
    draw(_line, { ctx, camera, width, height }) {
      const result = renderer.drawFaces(
        ctx,
        geometry,
        camera,
        width,
        height,
        outlines.checked ? { color: '#d4e2ec', width: 0.6 } : undefined,
      );
      const count = `${result.visible.length} / ${result.submitted}`;
      if (metric.textContent !== count) metric.textContent = count;
      const message = `${cockpitParts.length} box parts · ${result.submitted} faces · ${result.backFacing} back-facing · ${result.outside} outside view`;
      if (readout.value !== message) readout.value = message;
    },
    bind(signal, camera) {
      yaw.addEventListener('input', rebuild, { signal });
      document.querySelector('#inspect')!.addEventListener(
        'click',
        () => {
          Object.assign(camera, inspectionView);
          document.querySelector<HTMLInputElement>('#fov')!.value = '50';
          document.querySelector<HTMLOutputElement>('#fov-value')!.value =
            '50°';
        },
        { signal },
      );
    },
  };
}, seatView);
