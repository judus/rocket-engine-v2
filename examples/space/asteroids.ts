import { Rocket, Scene2D } from '../../src/index.js';
import { PerspectiveCamera } from '../../src/3d/index.js';
import { WebGLMeshRenderer3D, WebGLGpuTimer } from '../../src/webgl/index.js';
import { explorationInput } from '../webgl/ExplorationInput.js';
import { WebGLSurface } from '../../src/webgl/index.js';
import { asteroidField } from '../../games/farwake/visuals/AsteroidField.js';

const host = document.querySelector<HTMLElement>('#gpu-view')!;
const status = document.querySelector<HTMLOutputElement>('#gpu-status')!;
const restart = document.querySelector<HTMLButtonElement>('#restart')!;
const input = (id: string) =>
  document.querySelector<HTMLInputElement>(`#${id}`)!;
const button = (id: string) =>
  document.querySelector<HTMLButtonElement>(`#${id}`)!;
const show = (id: string, value: string) => {
  document.querySelector(`#${id}`)!.textContent = value;
};
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
  const scene = application.scene(
    new Scene2D({
      update(dt) {
        if (lost) return;
        keys.update();
        look(
          (keys('ArrowRight') - keys('ArrowLeft')) * dt,
          (keys('ArrowDown') - keys('ArrowUp')) * dt,
        );
        const forward =
          keys('KeyW') - keys('KeyS') + Number(input('cruise').checked);
        const right = keys('KeyD') - keys('KeyA'),
          up = keys('KeyE') - keys('KeyQ');
        const distance =
          ((keys('ShiftLeft') || keys('ShiftRight') ? 30 : 8) * dt) /
          Math.max(1, Math.hypot(forward, right, up));
        camera.x +=
          (Math.sin(camera.yaw) * Math.cos(camera.pitch) * forward +
            Math.cos(camera.yaw) * right) *
          distance;
        camera.y += (Math.sin(camera.pitch) * forward + up) * distance;
        camera.z +=
          (Math.cos(camera.yaw) * Math.cos(camera.pitch) * forward -
            Math.sin(camera.yaw) * right) *
          distance;
      },
    }),
  );
  const surface = new WebGLSurface({
    target: host,
    scene,
    label:
      'Seeded asteroid field. Focus to fly with WASD, Q/E and arrow keys; drag to look.',
    onError: (error) => {
      status.value = String(error);
    },
  });
  const { canvas, gl } = surface;
  const events = new AbortController(),
    signal = events.signal;
  const camera = new PerspectiveCamera();
  camera.far = 600;
  const home = () => {
    camera.x = 0;
    camera.y = 0;
    camera.z = -18;
    camera.yaw = 0;
    camera.pitch = 0;
    input('cruise').checked = false;
  };
  home();
  const look = (dx: number, dy: number) => {
    camera.yaw += dx;
    camera.pitch = Math.max(-1.5, Math.min(1.5, camera.pitch - dy));
  };
  const keys = explorationInput(application, scene, surface, look, home);
  let root = asteroidField(2126);
  input('seed').value = '2126';
  input('count').value = '96';
  input('lit').checked = true;
  input('resolution').value = '1';
  let renderer: WebGLMeshRenderer3D | undefined,
    timer: WebGLGpuTimer | undefined,
    lost = false;
  const extension = gl.getExtension('WEBGL_lose_context');
  const antialias = gl.getContextAttributes()?.antialias ?? false;
  const initialize = () => {
    renderer?.dispose();
    timer?.dispose();
    renderer = new WebGLMeshRenderer3D(gl, { lighting: true });
    timer = new WebGLGpuTimer(gl);
    status.value = `Ready · cleaned presentations ${retired}`;
  };
  button('generate').addEventListener(
    'click',
    () => {
      try {
        if (!input('seed').reportValidity()) return;
        const next = asteroidField(
          Number(input('seed').value),
          Number(input('count').value),
        );
        root = next;
        status.value = `${root.name} · ${root.children.length} rocks`;
      } catch (error) {
        status.value = String(error);
      }
    },
    { signal },
  );
  button('home').addEventListener('click', home, { signal });
  button('lose-context').disabled = !extension;
  button('restore-context').disabled = true;
  button('lose-context').addEventListener(
    'click',
    () => extension?.loseContext(),
    { signal },
  );
  button('restore-context').addEventListener(
    'click',
    () => extension?.restoreContext(),
    { signal },
  );
  canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();
      lost = true;
      renderer?.dispose();
      renderer = undefined;
      timer?.dispose();
      timer = undefined;
      button('restore-context').disabled = !extension;
      button('lose-context').disabled = true;
      status.value =
        'Context lost · restore to rebuild GPU resources. Field retained.';
      show('perf-gpu', 'Context lost');
      show('perf-gpu-peak', '—');
      show('perf-gpu-samples', 'Samples invalidated');
    },
    { signal },
  );
  canvas.addEventListener(
    'webglcontextrestored',
    () => {
      lost = false;
      button('restore-context').disabled = true;
      button('lose-context').disabled = !extension;
    },
    { signal },
  );
  let nextReadout = 0;
  application.presentation({
    scene,
    render() {
      if (lost || gl.isContextLost() || !renderer) return;
      surface.resize(Number(input('resolution').value));
      const size = { limited: surface.limited };
      timer?.poll();
      const measuring = timer?.begin();
      let result;
      try {
        result = renderer.render(root, camera, canvas.width, canvas.height, {
          lightingEnabled: input('lit').checked,
          lights: [
            { kind: 'ambient', color: [0.6, 0.73, 1], intensity: 0.15 },
            {
              kind: 'directional',
              direction: { x: -0.6, y: 0.8, z: -0.5 },
              color: [1, 0.9, 0.75],
              intensity: 1.3,
            },
          ],
        });
      } finally {
        if (measuring) timer?.end();
      }
      // DOM readouts at 4 Hz, independent of simulation/render cadence.
      const now = performance.now();
      if (now < nextReadout) return;
      nextReadout = now + 250;
      show(
        'mesh-stats',
        `${root.name} · ${root.children.length} rocks · ${result.drawCalls} draw calls · ${result.triangles.toLocaleString()} submitted triangles · ${result.cachedMeshes} cached meshes · ${result.uploadedBytes.toLocaleString()} uploaded bytes`,
      );
      show(
        'camera-status',
        `Position ${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}, ${camera.z.toFixed(1)} · heading ${((camera.yaw * 180) / Math.PI).toFixed(0)}° · pitch ${((camera.pitch * 180) / Math.PI).toFixed(0)}°`,
      );
      show(
        'perf-resolution',
        `${canvas.width} × ${canvas.height} raster · native DPR ${window.devicePixelRatio} · antialias ${antialias ? 'on' : 'off'}${size.limited ? ' · GPU size limit applied' : ''}`,
      );
      const gpu = timer?.stats;
      show(
        'perf-gpu',
        gpu?.averageMs == null
          ? (gpu?.status ?? 'Unavailable')
          : `${gpu.averageMs.toFixed(3)} ms`,
      );
      show(
        'perf-gpu-peak',
        gpu?.maxMs == null ? '—' : `${gpu.maxMs.toFixed(3)} ms`,
      );
      show(
        'perf-gpu-samples',
        `${gpu?.samples ?? 0}/32 valid samples · ${gpu?.pending ?? 0}/4 pending · ${gpu?.status ?? 'unavailable'}`,
      );
      const stats = application.performance;
      if (stats)
        for (const [id, value] of [
          ['fps', stats.fps],
          ['frame', stats.frameMs],
          ['peak', stats.maxFrameMs],
          ['minimum', stats.minFrameMs],
          ['jitter', stats.frameJitterMs],
          ['update', stats.updateMs],
          ['render', stats.renderMs],
        ] as const)
          show(
            `perf-${id}`,
            value === null
              ? 'Warming up…'
              : id === 'fps'
                ? value.toFixed(1)
                : `${value.toFixed(2)} ms`,
          );
    },
    dispose() {
      events.abort();
      surface.dispose();
      retired++;
    },
  });
  surface.manage(() => {
    initialize();
    return {
      value: gl,
      dispose(): undefined {
        renderer?.dispose();
        renderer = undefined;
        timer?.dispose();
        timer = undefined;
      },
    };
  });
  await application.start();
  restart.disabled = false;
}
const failed = (error: unknown) => {
  status.value = String(error);
  restart.disabled = false;
};
restart.addEventListener('click', () => {
  void start().catch(failed);
});
window.addEventListener(
  'pagehide',
  () => {
    void app?.dispose();
  },
  { once: true },
);
await start().catch(failed);
