import { runLineDemo } from './LineDemo.js';
import { createLightingModel } from './LightingModel.js';
import { cubeGeometry } from './CubeGeometry.js';
import {
  Node3D,
  Mesh3D,
  collectFaces,
  shadeFaces,
  CanvasRenderer3D,
} from '../../src/3d/index.js';
import type { Light3D } from '../../src/3d/index.js';

await runLineDemo(
  () => {
    let root = createLightingModel(16),
      divisions = 16,
      phase = 0;
    const lamp = new Node3D('lamp marker');
    lamp.mesh = new Mesh3D(
      cubeGeometry,
      Array.from({ length: 6 }, () => ({ color: '#ffe6a5' })),
    );
    const renderer = new CanvasRenderer3D();
    const field = (id: string) =>
      document.querySelector<HTMLInputElement>(`#${id}`)!;
    const x = field('lamp-x'),
      y = field('lamp-y'),
      z = field('lamp-z'),
      power = field('lamp-power'),
      ambient = field('ambient-fill'),
      rotation = field('object-yaw'),
      animate = field('orbit-lamp');
    const floor = document.querySelector<HTMLSelectElement>('#floor-detail')!,
      tint = document.querySelector<HTMLSelectElement>('#lamp-color')!;
    const status = document.querySelector<HTMLOutputElement>('#point-status')!;
    const reset = () => {
      x.value = '-1';
      y.value = '3';
      z.value = '-1.5';
      power.value = '8';
      ambient.value = '6';
      rotation.value = '0';
      animate.checked = false;
      floor.value = '16';
      tint.value = 'warm';
      phase = 0;
    };
    reset();
    return {
      referenceGrid: false,
      canvasLabel:
        'Movable point lamp lights a cube, octahedron and tiled floor with inverse-square falloff. WASD moves; drag or arrows look.',
      update(dt) {
        if (animate.checked) phase = (phase + dt * 0.7) % (Math.PI * 2);
      },
      bind(signal) {
        document
          .querySelector('#reset-lamp')!
          .addEventListener('click', reset, { signal });
      },
      draw(_line, { ctx, camera, width, height }) {
        if (Number(floor.value) !== divisions) {
          divisions = Number(floor.value);
          root = createLightingModel(divisions);
        }
        root.transform = {
          ...root.transform,
          rotation: { x: 0, y: (Number(rotation.value) * Math.PI) / 180, z: 0 },
        };
        const position = {
          x: Number(x.value) + 2 * Math.sin(phase),
          y: Number(y.value),
          z: Number(z.value) + 2 * (Math.cos(phase) - 1),
        };
        const lights: Light3D[] = [
          {
            kind: 'ambient',
            color: [0.7, 0.82, 1],
            intensity: Number(ambient.value) / 100,
          },
          {
            kind: 'point',
            position,
            intensity: Number(power.value),
            color:
              tint.value === 'warm'
                ? [1, 0.8, 0.55]
                : tint.value === 'cool'
                  ? [0.4, 0.65, 1]
                  : [1, 1, 1],
          },
        ];
        lamp.transform = {
          position,
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 0.12, y: 0.12, z: 0.12 },
        };
        const faces = collectFaces(root),
          lit = shadeFaces(faces, lights);
        // Marker is presentation only; the light itself is scene-owned data, not this mesh.
        const result = renderer.drawFaces(
          ctx,
          [...lit, ...collectFaces(lamp)],
          camera,
          width,
          height,
        );
        for (const [id, value] of [
          ['lamp-x-value', position.x.toFixed(1)],
          ['lamp-y-value', position.y.toFixed(1)],
          ['lamp-z-value', position.z.toFixed(1)],
          ['power-value', power.value],
          ['fill-value', `${ambient.value}%`],
          ['yaw-value', `${rotation.value}°`],
        ])
          document.querySelector<HTMLOutputElement>(`#${id}`)!.value = value!;
        status.value = `Lamp (${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}) · ${faces.length} shaded faces · ${result.visible.length} visible faces including marker · floor ${divisions} × ${divisions} · one lighting sample per face`;
      },
    };
  },
  { x: 0, y: 4, z: -11, yaw: 0, pitch: -0.22, verticalFov: Math.PI / 3 },
);
