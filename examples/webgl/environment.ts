import { studioEnvironment, previewEnvironment } from './StudioEnvironment.js';
import { Rocket, Scene2D } from '../../src/index.js';
import {
  bakeEnvironment,
  Mesh3D,
  MeshGeometry,
  Node3D,
  PerspectiveCamera,
} from '../../src/3d/index.js';
import { WebGLMeshRenderer3D, WebGLGpuTimer } from '../../src/webgl/index.js';
import { sphereGeometry } from '../3d/SphereGeometry.js';

const $ = (id: string) => document.querySelector<HTMLElement>(`#${id}`)!;
const input = (id: string) =>
  document.querySelector<HTMLInputElement>(`#${id}`)!;
const host = $('gpu-view'),
  status = $('gpu-status'),
  restart = document.querySelector<HTMLButtonElement>('#restart')!;
// Analytic scene-owned radiance, not a renderer-specific material or a reflection of these spheres.
const started = performance.now();
const environment = studioEnvironment();
$('bake-status').textContent =
  `Baked once in ${(performance.now() - started).toFixed(0)} ms · six 64² faces · seven GGX levels · diffuse 12² · BRDF 64² · 128 samples. No filtering work runs per frame.`;
// An equirectangular source preview would be a different projection. Show the actual six base faces.
previewEnvironment(environment, $('environment-preview'));
let app: Rocket | undefined,
  retired = 0;
async function start() {
  restart.disabled = true;
  await app?.dispose();
  const application = new Rocket({
    performance: true,
    onError: (e) => {
      status.textContent = String(e);
    },
  });
  app = application;
  const canvas = document.createElement('canvas');
  canvas.setAttribute(
    'aria-label',
    'Three material spheres lit by a procedural environment. Settings below the canvas.',
  );
  canvas.style.display = 'block';
  host.append(canvas);
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    depth: true,
    antialias: true,
  });
  if (!gl) {
    canvas.remove();
    await application.dispose();
    status.textContent = 'WebGL2 unavailable';
    restart.disabled = false;
    return;
  }
  const events = new AbortController(),
    signal = events.signal;
  const root = new Node3D('environment samples'),
    geometry = sphereGeometry();
  const nodes = [-2.65, 0, 2.65].map((x, i) => {
    const node = new Node3D(['silver', 'gold', 'ceramic'][i]!);
    node.transform = { ...node.transform, position: { x, y: 0, z: 0 } };
    root.add(node);
    return node;
  });
  const colors = ['#eeeeee', '#e5a440', '#6299d8'];
  const rebuild = () =>
    nodes.forEach((node, i) => {
      node.mesh = new Mesh3D(geometry, [
        {
          color: colors[i]!,
          metallicFactor: i < 2 ? 1 : 0,
          roughnessFactor: Number(input(`roughness-${i}`).value) / 100,
        },
      ]);
      $('value-' + i).textContent = `${input(`roughness-${i}`).value}%`;
    });
  for (let i = 0; i < 3; i++)
    input(`roughness-${i}`).addEventListener('input', rebuild, { signal });
  rebuild();
  const camera = new PerspectiveCamera();
  camera.z = -6;
  camera.near = 0.1;
  camera.far = 100;
  let renderer: WebGLMeshRenderer3D | undefined,
    timer: WebGLGpuTimer | undefined,
    lost = false,
    phase = 0,
    check = false,
    width = 960,
    height = 540;
  const initialize = () => {
    renderer?.dispose();
    timer?.dispose();
    renderer = new WebGLMeshRenderer3D(gl, {
      lighting: true,
      materialResponse: true,
      environment: true,
    });
    timer = new WebGLGpuTimer(gl);
    status.textContent = `Environment renderer ready · cleaned presentations ${retired}`;
  };
  const resize = new ResizeObserver(() => {
    width = Math.max(1, host.clientWidth);
    height = Math.round((width * 9) / 16);
  });
  resize.observe(host);
  const scene = application.scene(
    new Scene2D({
      update(dt) {
        if (input('animate-environment').checked)
          phase = (phase + dt * 0.3) % (Math.PI * 2);
      },
    }),
  );
  application.presentation({
    scene,
    render() {
      if (lost || !renderer || gl.isContextLost()) return;
      if (canvas.width !== 960) canvas.width = 960;
      if (canvas.height !== 540) canvas.height = 540;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      camera.x = Number(input('camera-x').value);
      camera.y = Number(input('camera-y').value);
      camera.z = Number(input('camera-z').value);
      camera.yaw = (Number(input('camera-yaw').value) * Math.PI) / 180;
      camera.pitch = (Number(input('camera-pitch').value) * Math.PI) / 180;
      const rotation =
        (Number(input('environment-rotation').value) * Math.PI) / 180 + phase;
      timer?.poll();
      const measuring = !check && (timer?.begin() ?? false);
      try {
        const result = renderer.render(root, camera, 960, 540, {
          lights: input('direct-light').checked
            ? [
                {
                  kind: 'directional',
                  direction: { x: -0.5, y: 1, z: -1 },
                  color: [1, 1, 1],
                  intensity: 0.6,
                },
              ]
            : [],
          environment: {
            map: environment,
            intensity: input('environment-enabled').checked
              ? Number(input('environment-strength').value) / 100
              : 0,
            rotation,
          },
        });
        const gpu = renderer.environmentStats!;
        $('mesh-stats').textContent =
          `${result.drawCalls} draws · ${result.triangles} triangles · ${result.uploadedBytes} geometry bytes · ${gpu.textures} environment textures · ${(gpu.textureBytes / 1024).toFixed(1)} KiB · no per-frame texture uploads`;
      } finally {
        if (measuring) timer?.end();
      }
      const gpu = timer?.stats;
      $('perf-gpu').textContent =
        gpu?.averageMs == null
          ? (gpu?.status ?? 'unavailable')
          : `${gpu.averageMs.toFixed(3)} ms`;
      $('perf-gpu-peak').textContent =
        gpu?.maxMs == null ? '—' : `${gpu.maxMs.toFixed(3)} ms`;
      $('perf-gpu-samples').textContent =
        `${gpu?.samples ?? 0}/32 valid samples · ${gpu?.pending ?? 0}/4 pending · ${gpu?.status ?? 'unavailable'}`;
      const stats = application.performance;
      if (stats)
        for (const [id, v] of [
          ['fps', stats.fps],
          ['frame', stats.frameMs],
          ['peak', stats.maxFrameMs],
          ['minimum', stats.minFrameMs],
          ['jitter', stats.frameJitterMs],
          ['update', stats.updateMs],
          ['render', stats.renderMs],
        ] as const)
          $('perf-' + id).textContent =
            v == null
              ? 'Warming up…'
              : id === 'fps'
                ? v.toFixed(1)
                : `${v.toFixed(2)} ms`;
      $('perf-resolution').textContent =
        `960 × 540 raster pixels · ${width} × ${height} CSS · GPU antialias ${gl.getContextAttributes()?.antialias ? 'on' : 'off'}`;
      $('environment-status').textContent =
        `Environment yaw ${(((rotation * 180) / Math.PI) % 360).toFixed(0)}° · strength ${input('environment-enabled').checked ? input('environment-strength').value : 0}%`;
      if (check) {
        $('gpu-diagnostic').textContent =
          probe(renderer, 960, 540) + ` · GL error ${gl.getError()}`;
        check = false;
      }
    },
    dispose() {
      events.abort();
      resize.disconnect();
      timer?.dispose();
      renderer?.dispose();
      renderer = undefined;
      canvas.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      retired++;
    },
  });
  const extension = gl.getExtension('WEBGL_lose_context'),
    lose = document.querySelector<HTMLButtonElement>('#lose-context')!,
    restore = document.querySelector<HTMLButtonElement>('#restore-context')!;
  lose.disabled = !extension;
  restore.disabled = true;
  canvas.addEventListener(
    'webglcontextlost',
    (e) => {
      e.preventDefault();
      lost = true;
      renderer?.dispose();
      renderer = undefined;
      timer?.poll();
      status.textContent =
        'Context lost · restore to rebuild retained environment assets';
      restore.disabled = !extension;
      lose.disabled = true;
    },
    { signal },
  );
  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      lost = false;
      initialize();
      restore.disabled = true;
      lose.disabled = !extension;
    },
    { signal },
  );
  lose.addEventListener('click', () => extension?.loseContext(), { signal });
  restore.addEventListener('click', () => extension?.restoreContext(), {
    signal,
  });
  $('read-pixel').addEventListener(
    'click',
    () => {
      check = true;
    },
    { signal },
  );
  $('reset-view').addEventListener(
    'click',
    () => {
      phase = 0;
      input('camera-x').value = '0';
      input('camera-y').value = '0';
      input('camera-z').value = '-6';
      input('camera-yaw').value = '0';
      input('camera-pitch').value = '0';
      input('environment-rotation').value = '0';
      input('environment-strength').value = '100';
      input('environment-enabled').checked = true;
      input('direct-light').checked = false;
      input('animate-environment').checked = false;
    },
    { signal },
  );
  initialize();
  await application.start();
  restart.disabled = false;
}
// Bounded diagnostic assets are lazy, not baked during frames unless explicitly requested.
let constant: ReturnType<typeof bakeEnvironment> | undefined;
function probe(renderer: WebGLMeshRenderer3D, w: number, h: number) {
  constant ??= bakeEnvironment(() => [0.25, 0.5, 0.75], {
    size: 8,
    diffuseSize: 2,
    lutSize: 32,
    samples: 128,
  });
  const root = new Node3D('constant radiance probe');
  root.mesh = new Mesh3D(
    new MeshGeometry(
      [
        { x: -2, y: -2, z: 0 },
        { x: 2, y: -2, z: 0 },
        { x: 2, y: 2, z: 0 },
        { x: -2, y: 2, z: 0 },
      ],
      [{ id: 'plane', indices: [0, 3, 2, 1], material: 0 }],
    ),
    [{ color: '#ffffff', metallicFactor: 1, roughnessFactor: 0.045 }],
  );
  const camera = new PerspectiveCamera();
  camera.z = -3;
  renderer.render(root, camera, w, h, {
    lights: [],
    environment: { map: constant },
  });
  const lit = renderer.readPixel(Math.floor(w / 2), Math.floor(h / 2));
  renderer.render(root, camera, w, h, {
    lights: [],
    environment: { map: constant, intensity: 0 },
  });
  const dark = renderer.readPixel(Math.floor(w / 2), Math.floor(h / 2));
  const expected = [137, 188, 225];
  const passed =
    expected.every((v, i) => Math.abs(lit[i]! - v) <= 4) &&
    dark.slice(0, 3).every((v) => v === 0);
  return `${passed ? 'PASS' : 'FAIL'} · constant environment ${lit.slice(0, 3).join('/')} ≈ ${expected.join('/')} · zero strength ${dark.slice(0, 3).join('/')} (tolerance 4 RGB8)`;
}
restart.addEventListener('click', () => {
  void start().catch((e) => {
    status.textContent = String(e);
    restart.disabled = false;
  });
});
window.addEventListener(
  'pagehide',
  () => {
    void app?.dispose();
  },
  { once: true },
);
await start().catch((e) => {
  status.textContent = String(e);
  restart.disabled = false;
});
