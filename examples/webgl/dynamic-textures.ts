import { Rocket, Scene2D } from '../../src/index.js';
import {
  DynamicTextureImage,
  Mesh3D,
  MeshGeometry,
  Node3D,
  PerspectiveCamera,
} from '../../src/3d/index.js';
import { WebGLMeshRenderer3D, WebGLGpuTimer } from '../../src/webgl/index.js';
import { paintInstrument } from './InstrumentDisplay.js';
import { updateTextureFromCanvas } from '../../src/webgl/index.js';

const $ = (id: string) => document.querySelector<HTMLElement>(`#${id}`)!;
const input = (id: string) =>
  document.querySelector<HTMLInputElement>(`#${id}`)!;
const host = $('gpu-view'),
  status = $('gpu-status'),
  restart = document.querySelector<HTMLButtonElement>('#restart')!;
const sourceCanvas =
  document.querySelector<HTMLCanvasElement>('#source-canvas')!;
const sourceContext = sourceCanvas.getContext('2d', {
  alpha: false,
  willReadFrequently: true,
})!;
if (!sourceContext) throw new Error('Instrument canvas unavailable');
const initial = new Uint8Array(sourceCanvas.width * sourceCanvas.height * 4);
for (let i = 3; i < initial.length; i += 4) initial[i] = 255;
const image = new DynamicTextureImage(
  sourceCanvas.width,
  sourceCanvas.height,
  initial,
);
let displayTime = 0,
  draws = 0;
function redraw() {
  paintInstrument(
    sourceContext,
    displayTime,
    ++draws,
    document.querySelector<HTMLSelectElement>('#display-color')!.value,
  );
  updateTextureFromCanvas(image, sourceContext);
}
redraw();
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
    'Two angled 3D panels share one changing instrument texture. Pause display updates below to compare rendering and upload counters.',
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
  const root = new Node3D('shared dynamic display');
  const geometry = new MeshGeometry(
    [
      { x: -1.5, y: -0.9375, z: 0 },
      { x: 1.5, y: -0.9375, z: 0 },
      { x: 1.5, y: 0.9375, z: 0 },
      { x: -1.5, y: 0.9375, z: 0 },
    ],
    [{ id: 'screen', indices: [0, 3, 2, 1], material: 0 }],
    [],
    {
      texCoords: [
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ],
    },
  );
  const nodes = [-1.7, 1.7].map((x, i) => {
    const node = new Node3D('screen ' + i);
    node.transform = {
      ...node.transform,
      position: { x, y: 0, z: 0 },
      rotation: { x: 0, y: i === 0 ? 0.25 : -0.25, z: 0 },
    };
    root.add(node);
    return node;
  });
  const rebuild = () => {
    const mesh = new Mesh3D(geometry, [
      {
        color: '#ffffff',
        baseColorTexture: {
          image,
          wrapS: 'clamp',
          wrapT: 'clamp',
          filter: document.querySelector<HTMLSelectElement>('#texture-filter')!
            .value as 'nearest' | 'linear' | 'trilinear',
        },
      },
    ]);
    nodes.forEach((n) => (n.mesh = mesh));
  };
  document
    .querySelector('#texture-filter')!
    .addEventListener('change', rebuild, { signal });
  rebuild();
  document
    .querySelector('#display-color')!
    .addEventListener('change', redraw, { signal });
  document.querySelector('#refresh-display')!.addEventListener(
    'click',
    () => {
      displayTime += 0.2;
      redraw();
    },
    { signal },
  );
  const camera = new PerspectiveCamera();
  camera.z = -5;
  camera.near = 0.1;
  camera.far = 100;
  let renderer: WebGLMeshRenderer3D | undefined,
    timer: WebGLGpuTimer | undefined,
    lost = false,
    phase = 0,
    check = false,
    width = 960,
    height = 540,
    accumulator = 0;
  const initialize = () => {
    renderer?.dispose();
    timer?.dispose();
    renderer = new WebGLMeshRenderer3D(gl, {
      lighting: true,
      textures: true,
    });
    timer = new WebGLGpuTimer(gl);
    status.textContent = `Dynamic texture renderer ready · cleaned presentations ${retired}`;
  };
  const resize = new ResizeObserver(() => {
    width = Math.max(1, host.clientWidth);
    height = Math.round((width * 9) / 16);
  });
  resize.observe(host);
  const scene = application.scene(
    new Scene2D({
      update(dt) {
        if (input('panel-motion').checked)
          phase = (phase + dt * 0.6) % (Math.PI * 2);
        if (input('display-running').checked) {
          displayTime += dt;
          accumulator += dt;
          const interval = 1 / Number(input('display-rate').value);
          if (accumulator >= interval) {
            accumulator %= interval;
            redraw();
          }
        } else accumulator = 0;
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
      nodes.forEach((node, i) => {
        node.transform = {
          ...node.transform,
          rotation: {
            x: 0.08 * Math.sin(phase),
            y: (i === 0 ? 0.25 : -0.25) + 0.12 * Math.sin(phase),
            z: 0,
          },
        };
      });
      timer?.poll();
      const measuring = !check && (timer?.begin() ?? false);
      try {
        const result = renderer.render(root, camera, 960, 540, {
          lightingEnabled: false,
        });
        const resources = renderer.textureStats!,
          uploads = renderer.textureUploadStats!;
        $('mesh-stats').textContent =
          `${result.drawCalls} surfaces · ${result.cachedMeshes} shared mesh · ${result.triangles} triangles · ${result.uploadedBytes} geometry bytes · ${resources.textures} texture / ${(resources.textureBytes / 1024).toFixed(1)} KiB including mip levels`;
        $('upload-stats').textContent =
          `GPU texture allocations ${uploads.allocations} · in-place updates ${uploads.updates} · ${(uploads.sourceBytes / 1048576).toFixed(2)} MiB submitted (base pixels) · mipmap builds ${uploads.mipmapBuilds}`;
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
      $('display-status').textContent =
        `${input('display-running').checked ? 'Running' : 'Paused'} · target ${input('display-rate').value} Hz · canvas draws ${draws} · source revision ${image.revision} · render clock continues independently`;
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
        'Context lost · CPU display can continue; restore uploads the latest source snapshot';
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
      input('camera-z').value = '-5';
      input('camera-yaw').value = '0';
      input('camera-pitch').value = '0';
      input('panel-motion').checked = true;
    },
    { signal },
  );
  initialize();
  await application.start();
  restart.disabled = false;
}
function probe(renderer: WebGLMeshRenderer3D, w: number, h: number) {
  const image = new DynamicTextureImage(1, 1, new Uint8Array([255, 0, 0, 255]));
  const root = new Node3D('dynamic upload probe');
  root.mesh = new Mesh3D(
    new MeshGeometry(
      [
        { x: -2, y: -2, z: 0 },
        { x: 2, y: -2, z: 0 },
        { x: 2, y: 2, z: 0 },
        { x: -2, y: 2, z: 0 },
      ],
      [{ id: 'plane', indices: [0, 3, 2, 1], material: 0 }],
      [],
      {
        texCoords: [
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      },
    ),
    [{ color: '#ffffff', baseColorTexture: { image, filter: 'nearest' } }],
  );
  const camera = new PerspectiveCamera();
  camera.z = -3;
  const draw = () => {
    renderer.render(root, camera, w, h, { lightingEnabled: false });
    return renderer.readPixel(Math.floor(w / 2), Math.floor(h / 2));
  };
  const first = draw();
  image.update(new Uint8Array([0, 255, 0, 255]));
  const updated = draw(),
    count = renderer.textureUploadStats!.updates;
  const retained = draw();
  const pass =
    first[0] === 255 &&
    first[1] === 0 &&
    updated[0] === 0 &&
    updated[1] === 255 &&
    retained[1] === 255 &&
    renderer.textureUploadStats!.updates === count;
  return `${pass ? 'PASS' : 'FAIL'} · red ${first.slice(0, 3).join('/')} → green ${updated.slice(0, 3).join('/')} · unchanged draw adds zero updates. Diagnostic swaps textures; normal display is restored next frame.`;
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
