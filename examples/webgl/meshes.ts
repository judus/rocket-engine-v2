import { Rocket, Scene2D } from '../../src/index.js';
import { WebGLMeshRenderer3D, WebGLGpuTimer } from '../../src/webgl/index.js';
import {
  Node3D,
  Mesh3D,
  PerspectiveCamera,
  SoftwareDepthRenderer3D,
} from '../../src/3d/index.js';
import { cubeGeometry, cubeMaterials } from '../3d/CubeGeometry.js';

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
    'Overlapping cubes rendered using existing Rocket meshes and perspective camera.',
  );
  canvas.style.display = 'block';
  host.append(canvas);
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    depth: true,
  });
  if (!gl) {
    canvas.remove();
    status.value =
      'WebGL2 is unavailable in this browser. Earlier Canvas demos remain usable.';
    restart.disabled = false;
    return;
  }
  const cpuCanvas = document.createElement('canvas');
  cpuCanvas.setAttribute(
    'aria-label',
    'Same cubes rendered with the CPU depth buffer',
  );
  cpuCanvas.style.background = '#090f18';
  const cpuContext = cpuCanvas.getContext('2d')!;
  host.append(cpuCanvas);
  const cpu = new SoftwareDepthRenderer3D();
  const root = new Node3D('assembly');
  const left = new Node3D('near cube'),
    right = new Node3D('far cube');
  left.mesh = new Mesh3D(cubeGeometry, cubeMaterials);
  right.mesh = new Mesh3D(
    cubeGeometry,
    cubeMaterials.map(() => ({ color: '#d88648' })),
  );
  left.transform = {
    ...left.transform,
    position: { x: -0.6, y: 0, z: -0.25 },
    rotation: { x: 0.2, y: 0.35, z: 0 },
  };
  right.transform = {
    ...right.transform,
    position: { x: 0.65, y: 0.15, z: 0.55 },
    rotation: { x: -0.2, y: -0.4, z: 0.2 },
  };
  root.add(left).add(right);
  const camera = new PerspectiveCamera();
  const backend = document.querySelector<HTMLSelectElement>('#backend')!;
  const depthTest = document.querySelector<HTMLInputElement>('#depth-test')!;
  const reverseOrder =
    document.querySelector<HTMLInputElement>('#reverse-order')!;
  const cameraYaw = document.querySelector<HTMLInputElement>('#camera-yaw')!;
  const cameraPitch =
    document.querySelector<HTMLInputElement>('#camera-pitch')!;
  backend.value = 'gpu';
  depthTest.checked = true;
  reverseOrder.checked = false;
  cameraYaw.value = '-20';
  cameraPitch.value = '-12';
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
  let renderer: WebGLMeshRenderer3D | undefined,
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
    try {
      const next = new WebGLMeshRenderer3D(gl);
      renderer = next;
      status.value = `WebGL2 mesh renderer ready · cleaned presentations ${retired}`;
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
      if (lost || gl.isContextLost() || !renderer) return;
      // Match raster dimensions between both backends; CSS scales the viewport only.
      const w = 960,
        h = 540;
      for (const target of [canvas, cpuCanvas]) {
        if (target.width !== w) target.width = w;
        if (target.height !== h) target.height = h;
        target.style.width = `${width}px`;
        target.style.height = `${height}px`;
      }
      const rotation = (Number(angle.value) * Math.PI) / 180 + phase;
      root.transform = {
        ...root.transform,
        rotation: { x: 0, y: rotation, z: 0 },
      };
      camera.yaw = (Number(cameraYaw.value) * Math.PI) / 180;
      camera.pitch = (Number(cameraPitch.value) * Math.PI) / 180;
      const distance = (7 * 85) / Number(scale.value);
      camera.x = -distance * Math.sin(camera.yaw) * Math.cos(camera.pitch);
      camera.y = -distance * Math.sin(camera.pitch);
      camera.z = -distance * Math.cos(camera.yaw) * Math.cos(camera.pitch);
      const gpuMode = backend.value === 'gpu';
      document.querySelector('#perf-render-label')!.textContent = gpuMode
        ? 'CPU submission'
        : 'CPU raster + upload';
      canvas.style.display = gpuMode ? 'block' : 'none';
      cpuCanvas.style.display = gpuMode ? 'none' : 'block';
      depthTest.disabled = reverseOrder.disabled = !gpuMode;
      timer?.poll();
      const measuring = gpuMode && !sample && (timer?.begin() ?? false);
      try {
        if (gpuMode) {
          const result = renderer.render(root, camera, w, h, {
            depthTest: depthTest.checked,
            reverseOrder: reverseOrder.checked,
          });
          document.querySelector('#mesh-stats')!.textContent =
            `${result.drawCalls} draw calls · ${result.triangles} triangles · ${result.cachedMeshes} cached meshes · ${result.uploadedBytes} uploaded bytes`;
        } else {
          const result = cpu.render(root, camera, w, h);
          cpuContext.putImageData(new ImageData(cpu.pixels, w, h), 0, 0);
          document.querySelector('#mesh-stats')!.textContent =
            `CPU depth: ${result.triangles} visible triangles · ${result.testedSamples} tested samples`;
        }
      } finally {
        if (measuring) timer?.end();
      }
      const gpu = timer?.stats;
      document.querySelector('#perf-gpu')!.textContent = !gpuMode
        ? 'Inactive (CPU mode)'
        : gpu?.averageMs === null || !gpu
          ? (gpu?.status ?? 'unavailable')
          : `${gpu.averageMs.toFixed(3)} ms`;
      document.querySelector('#perf-gpu-peak')!.textContent =
        !gpuMode || gpu?.maxMs === null || !gpu
          ? '—'
          : `${gpu.maxMs.toFixed(3)} ms`;
      document.querySelector('#perf-gpu-samples')!.textContent = !gpuMode
        ? 'GPU timing inactive; CPU render time includes rasterization and pixel upload.'
        : `${gpu?.samples ?? 0}/32 valid samples · ${gpu?.pending ?? 0}/4 pending · ${gpu?.status ?? 'unavailable'}`;
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
        `${w} × ${h} raster pixels in both backends · ${width} × ${height} CSS · GPU antialias ${antialias ? 'on' : 'off'}, CPU point sampled`;
      if (sample) {
        // Diagnostic renders both submission orders with depth on and off.
        renderer.render(root, camera, w, h, { depthTest: true });
        const forward = renderer.readPixel(w / 2, h / 2);
        renderer.render(root, camera, w, h, {
          depthTest: true,
          reverseOrder: true,
        });
        const reversed = renderer.readPixel(w / 2, h / 2);
        renderer.render(root, camera, w, h, { depthTest: false });
        const noDepth = renderer.readPixel(w / 2, h / 2);
        renderer.render(root, camera, w, h, {
          depthTest: false,
          reverseOrder: true,
        });
        const noDepthReversed = renderer.readPixel(w / 2, h / 2);
        renderer.render(root, camera, w, h, {
          depthTest: depthTest.checked,
          reverseOrder: reverseOrder.checked,
        });
        diagnostics.value = `Center RGBA depth on: ${forward.join(',')} / reversed ${reversed.join(',')} · depth off: ${noDepth.join(',')} / reversed ${noDepthReversed.join(',')} · GL error ${gl.getError()} (0 = no error). Check from the reset pose for an overlapping center pixel.`;
        sample = false;
      }
    },
    dispose() {
      timer?.dispose();
      events.abort();
      resize.disconnect();
      renderer?.dispose();
      renderer = undefined;
      canvas.remove();
      cpuCanvas.remove();
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
      cameraYaw.value = '-20';
      cameraPitch.value = '-12';
    },
    { signal },
  );
  backend.addEventListener(
    'change',
    () => {
      timer?.dispose();
      timer = new WebGLGpuTimer(gl);
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
