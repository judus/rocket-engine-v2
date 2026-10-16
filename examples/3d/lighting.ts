import { runLineDemo } from './LineDemo.js';
import { createLightingModel } from './LightingModel.js';
import {
  collectFaces,
  shadeFaces,
  CanvasRenderer3D,
} from '../../src/3d/index.js';
import type { Light3D } from '../../src/3d/index.js';

await runLineDemo(
  () => {
    const root = createLightingModel();
    const renderer = new CanvasRenderer3D();
    const field = (id: string) =>
      document.querySelector<HTMLInputElement>(`#${id}`)!;
    const azimuth = field('light-azimuth'),
      elevation = field('light-elevation'),
      intensity = field('light-intensity'),
      ambient = field('ambient-intensity'),
      rotation = field('object-rotation'),
      animate = field('animate-light');
    const mode = document.querySelector<HTMLSelectElement>('#lighting-mode')!,
      tint = document.querySelector<HTMLSelectElement>('#light-color')!;
    const status =
        document.querySelector<HTMLOutputElement>('#lighting-status')!,
      counts = document.querySelector<HTMLElement>('#face-count')!;
    const reset = () => {
      azimuth.value = '-40';
      elevation.value = '45';
      intensity.value = '90';
      ambient.value = '12';
      rotation.value = '0';
      animate.checked = false;
      mode.value = 'compare';
      tint.value = 'warm';
    };
    reset();
    let angle = 0;
    return {
      referenceGrid: false,
      canvasLabel:
        'Same shapes with unlit base colors and independent scene lighting. WASD moves; drag or arrows look.',
      bind(signal) {
        document.querySelector('#reset-lighting')!.addEventListener(
          'click',
          () => {
            angle = 0;
            reset();
          },
          { signal },
        );
      },
      update(dt) {
        if (animate.checked) angle = (angle + dt * 25) % 360;
      },
      draw(line, { ctx, camera, width, height }) {
        const az = ((Number(azimuth.value) + angle) * Math.PI) / 180,
          el = (Number(elevation.value) * Math.PI) / 180;
        const direction = {
          x: Math.sin(az) * Math.cos(el),
          y: Math.sin(el),
          z: -Math.cos(az) * Math.cos(el),
        };
        root.transform = {
          ...root.transform,
          rotation: { x: 0, y: (Number(rotation.value) * Math.PI) / 180, z: 0 },
        };
        const lights: Light3D[] = [
          {
            kind: 'ambient',
            color: [0.7, 0.82, 1],
            intensity: Number(ambient.value) / 100,
          },
          {
            kind: 'directional',
            color:
              tint.value === 'warm'
                ? [1, 0.8, 0.55]
                : tint.value === 'cool'
                  ? [0.45, 0.7, 1]
                  : [1, 1, 1],
            intensity: Number(intensity.value) / 100,
            direction,
          },
        ];
        const raw = collectFaces(root),
          lit = shadeFaces(raw, lights),
          compare = mode.value === 'compare',
          gap = compare ? 14 : 0,
          panel = (width - gap) / (compare ? 2 : 1);
        let visible = 0;
        ctx.save();
        try {
          if (mode.value !== 'lit')
            visible += renderer.drawFaces(ctx, raw, camera, panel, height)
              .visible.length;
          if (mode.value !== 'unlit') {
            ctx.translate(compare ? panel + gap : 0, 0);
            visible += renderer.drawFaces(ctx, lit, camera, panel, height)
              .visible.length;
          }
        } finally {
          ctx.restore();
        }
        ctx.fillStyle = '#dbe6ee';
        ctx.font = '14px system-ui';
        if (mode.value !== 'lit') ctx.fillText('Unlit · base colors', 14, 27);
        if (mode.value !== 'unlit')
          ctx.fillText(
            'Lit · ambient + directional diffuse',
            compare ? panel + gap + 14 : 14,
            27,
          );
        if (compare) {
          ctx.fillStyle = '#24364a';
          ctx.fillRect(panel, 0, gap, height);
        }
        if (!compare) {
          const end = {
            x: direction.x * 2,
            y: 3 + direction.y * 2,
            z: direction.z * 2,
          };
          line({ x: 0, y: 3, z: 0 }, end, '#ffd48a', 2);
        }
        for (const [id, value] of [
          [
            'azimuth-value',
            `${((Number(azimuth.value) + angle) % 360).toFixed(0)}°`,
          ],
          ['elevation-value', `${elevation.value}°`],
          ['intensity-value', `${intensity.value}%`],
          ['ambient-value', `${ambient.value}%`],
          ['rotation-value', `${rotation.value}°`],
        ])
          document.querySelector<HTMLOutputElement>(`#${id}`)!.value = value!;
        counts.textContent = `${raw.length} world faces · ${visible} visible across ${compare ? 2 : 1} views`;
        status.value =
          'Light direction is shared in world space. Rotate objects or move the light independently. No cast shadows; the floor receives the same direct light.';
      },
    };
  },
  { x: 0, y: 3.5, z: -11, yaw: 0, pitch: -0.16, verticalFov: Math.PI / 3 },
);
