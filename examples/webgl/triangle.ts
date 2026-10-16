import { Rocket, Scene2D } from '../../src/index.js';
import { WebGLColorRenderer, WebGLGpuTimer } from '../../src/webgl/index.js';
import type { ColorMesh } from '../../src/webgl/index.js';
import type { Matrix4 } from '../../src/3d/index.js';

const host = document.querySelector<HTMLElement>('#gpu-view')!;
const status = document.querySelector<HTMLOutputElement>('#gpu-status')!;
const diagnostics =
  document.querySelector<HTMLOutputElement>('#gpu-diagnostic')!;
const restart = document.querySelector<HTMLButtonElement>('#restart')!;
let app: Rocket | undefined,
  retired = 0;
async function start() {
  restart.disabled = true;
  await app?.dispose();
  const application = new Rocket({
    performance: true,
    onError: (error) => {
      status.value = String(error);
    },
  });
  app = application;
  const canvas = document.createElement('canvas');
  canvas.setAttribute(
    'aria-label',
    'WebGL2 triangle with interpolated vertex colors. GPU renders directly to this canvas.',
  );
  canvas.style.display = 'block';
  host.append(canvas);
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: true });
  if (!gl) {
    canvas.remove();
    status.value =
      'WebGL2 is unavailable in this browser. Earlier Canvas demos remain usable.';
    restart.disabled = false;
    return;
  }
  const events = new AbortController(),
    signal = events.signal;
  const animate =
    document.querySelector<HTMLInputElement>('#animate-triangle')!;
  const angle = document.querySelector<HTMLInputElement>('#triangle-angle')!;
  const scale = document.querySelector<HTMLInputElement>('#triangle-scale')!;
  const lose = document.querySelector<HTMLButtonElement>('#lose-context')!;
  const restore =
    document.querySelector<HTMLButtonElement>('#restore-context')!;
  const extension = gl.getExtension('WEBGL_lose_context');
  const antialias = gl.getContextAttributes()?.antialias ?? false;
  let renderer: WebGLColorRenderer | undefined,
    mesh: ColorMesh | undefined,
    timer: WebGLGpuTimer | undefined,
    lost = false,
    phase = 0,
    sample = false,
    width = 960,
    height = 540;
  animate.checked = false;
  angle.value = '0';
  scale.value = '85';
  diagnostics.value =
    'Pixel readback runs only when requested, outside performance comparisons.';
  const initialize = () => {
    timer?.dispose();
    timer = new WebGLGpuTimer(gl);
    renderer?.dispose();
    renderer = undefined;
    mesh = undefined;
    try {
      const next = new WebGLColorRenderer(gl);
      renderer = next;
      mesh = next.upload([
        { position: { x: -0.65, y: -0.5, z: 0 }, color: [1, 0.08, 0.04] },
        { position: { x: 0.65, y: -0.5, z: 0 }, color: [0.04, 1, 0.2] },
        { position: { x: 0, y: 0.65, z: 0 }, color: [0.06, 0.2, 1] },
      ]);
      status.value = `WebGL2 ready · 1 triangle · 1 draw call · 1 vertex buffer (72 bytes) · cleaned presentations ${retired}`;
    } catch (error) {
      renderer?.dispose();
      renderer = undefined;
      status.value = String(error);
    }
  };
  const resize = new ResizeObserver(() => {
    width = Math.max(1, host.clientWidth);
    height = Math.max(1, Math.round((width * 9) / 16));
  });
  resize.observe(host);
  const scene = application.scene(
    new Scene2D({
      update(dt) {
        if (animate.checked) phase = (phase + dt * 0.5) % (Math.PI * 2);
      },
    }),
  );
  application.presentation({
    scene,
    render() {
      if (lost || gl.isContextLost() || !renderer || !mesh) return;
      const ratio = window.devicePixelRatio || 1,
        w = Math.max(1, Math.round(width * ratio)),
        h = Math.max(1, Math.round(height * ratio));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const rotation = (Number(angle.value) * Math.PI) / 180 + phase,
        s = Number(scale.value) / 100,
        c = Math.cos(rotation),
        sn = Math.sin(rotation),
        aspect = w / h;
      const transform: Matrix4 = [
        (c * s) / aspect,
        sn * s,
        0,
        0,
        (-sn * s) / aspect,
        c * s,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
      ];
      timer?.poll();
      const measuring = !sample && (timer?.begin() ?? false);
      try {
        renderer.draw(mesh, transform);
      } finally {
        if (measuring) timer?.end();
      }
      const gpu = timer?.stats;
      document.querySelector('#perf-gpu')!.textContent =
        gpu?.averageMs === null || !gpu
          ? (gpu?.status ?? 'unavailable')
          : `${gpu.averageMs.toFixed(3)} ms`;
      document.querySelector('#perf-gpu-peak')!.textContent =
        gpu?.maxMs === null || !gpu ? '—' : `${gpu.maxMs.toFixed(3)} ms`;
      document.querySelector('#perf-gpu-samples')!.textContent =
        `${gpu?.samples ?? 0}/32 valid samples · ${gpu?.pending ?? 0}/4 pending · ${gpu?.status ?? 'unavailable'}`;
      document.querySelector<HTMLOutputElement>('#angle-value')!.value =
        `${((rotation * 180) / Math.PI).toFixed(0)}°`;
      document.querySelector<HTMLOutputElement>('#scale-value')!.value =
        `${scale.value}%`;
      const stats = application.performance;
      if (stats) {
        for (const [id, v] of [
          ['fps', stats.fps],
          ['frame', stats.frameMs],
          ['peak', stats.maxFrameMs],
          ['minimum', stats.minFrameMs],
          ['jitter', stats.frameJitterMs],
          ['update', stats.updateMs],
          ['render', stats.renderMs],
        ] as const) {
          document.querySelector(`#perf-${id}`)!.textContent =
            v === null
              ? 'Warming up…'
              : id === 'fps'
                ? v.toFixed(1)
                : `${v.toFixed(2)} ms`;
        }
      }
      document.querySelector('#perf-resolution')!.textContent =
        `${w} × ${h} backing pixels · ${width} × ${height} logical · WebGL2 antialias ${antialias ? 'on' : 'off'}`;
      if (sample) {
        const pixel = renderer.readPixel(Math.floor(w / 2), Math.floor(h / 2));
        diagnostics.value = `Center RGBA: ${pixel.join(', ')} · GL error ${gl.getError()} (0 = no error)`;
        sample = false;
      }
    },
    dispose() {
      timer?.dispose();
      events.abort();
      resize.disconnect();
      renderer?.dispose();
      renderer = undefined;
      mesh = undefined;
      canvas.remove();
      extension?.loseContext();
      retired++;
    },
  });
  canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();
      lost = true;
      // Retire old-generation handles while the context is lost. Deleting them
      // after restoration would submit stale objects to a new GL generation.
      renderer?.dispose();
      renderer = undefined;
      timer?.poll();
      document.querySelector('#perf-gpu')!.textContent = 'context lost';
      document.querySelector('#perf-gpu-peak')!.textContent = '—';
      document.querySelector('#perf-gpu-samples')!.textContent =
        'Samples invalidated';
      restore.disabled = !extension;
      lose.disabled = true;
      status.value =
        'WebGL context lost. Simulation continues; GPU draws suspended. Restore context to rebuild resources.';
    },
    { signal },
  );
  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      lost = false;
      restore.disabled = true;
      lose.disabled = !extension;
      initialize();
    },
    { signal },
  );
  lose.disabled = !extension;
  restore.disabled = true;
  lose.addEventListener('click', () => extension?.loseContext(), { signal });
  restore.addEventListener('click', () => extension?.restoreContext(), {
    signal,
  });
  document.querySelector('#read-pixel')!.addEventListener(
    'click',
    () => {
      sample = true;
    },
    { signal },
  );
  document.querySelector('#reset-triangle')!.addEventListener(
    'click',
    () => {
      phase = 0;
      angle.value = '0';
      scale.value = '85';
      animate.checked = false;
    },
    { signal },
  );
  initialize();
  await application.start();
  restart.disabled = false;
}
restart.addEventListener('click', () => {
  void start().catch((error) => {
    status.value = String(error);
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
await start().catch((error) => {
  status.value = String(error);
  restart.disabled = false;
});
