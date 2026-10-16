import { loadAsteroidFamily } from './AsteroidFamily.js';
import { Rocket, Scene2D } from '../../src/index.js';
import { Node3D, PerspectiveCamera } from '../../src/3d/index.js';

import {
  WebGLSurface,
  WebGLMeshRenderer3D,
  WebGLGpuTimer,
} from '../../src/webgl/index.js';

// Example-owned adapter for this asset contract; images are shared by identity.
const select = (id: string) =>
  document.querySelector<HTMLSelectElement>(`#${id}`)!;
const input = (id: string) =>
  document.querySelector<HTMLInputElement>(`#${id}`)!;
const status = document.querySelector<HTMLOutputElement>('#family-status')!;
const metrics = document.querySelector<HTMLOutputElement>('#family-metrics')!;
const restart = document.querySelector<HTMLButtonElement>('#restart')!;
let app: Rocket | undefined;
let retired = 0;
async function start() {
  restart.disabled = true;
  await app?.dispose();
  const events = new AbortController(),
    signal = events.signal;
  const application = new Rocket({
    performance: true,
    onError: (e) => {
      status.value = String(e);
    },
  });
  app = application;
  let phase = 0;
  const scene = application.scene(
    new Scene2D({
      update(dt) {
        if (input('rotate').checked) phase += dt * 0.15;
      },
    }),
  );
  const surface = new WebGLSurface({
    target: document.querySelector<HTMLElement>('#family-view')!,
    scene,
    label: 'Original asteroid family rendered in Rocket',
  });
  let renderer: WebGLMeshRenderer3D | undefined,
    timer: WebGLGpuTimer | undefined;
  application.presentation({
    scene,
    render() {},
    dispose() {
      events.abort();
      surface.dispose();
      retired++;
    },
  });
  window.addEventListener(
    'pagehide',
    () => {
      void application.dispose();
    },
    { once: true, signal },
  );
  status.value = 'Loading original meshes and nine full-resolution PNG maps…';
  try {
    const { catalog, materials, variants } = await loadAsteroidFamily(signal);
    const root = new Node3D('Original asteroid family');
    const nodes = catalog.asteroids.map((entry) => {
      const node = new Node3D(entry.name);
      root.add(node);
      return node;
    });
    select('shape').replaceChildren(
      new Option('All twelve · actual metre scale', 'all'),
      ...catalog.asteroids.map(
        (entry, i) =>
          new Option(
            `${entry.name} · ${entry.longestDimensionMetres} m`,
            String(i),
          ),
      ),
    );
    select('material').replaceChildren(
      new Option('Mixed · fixed per asteroid', 'mixed'),
      ...materials.map((m, i) => new Option(m.name!, String(i))),
    );
    const camera = new PerspectiveCamera();
    camera.far = 3000;
    const arrange = () => {
      const all = select('shape').value === 'all';
      nodes.forEach((node, i) => {
        node.visible = all || i === Number(select('shape').value);
        node.mesh =
          variants[i]![
            select('material').value === 'mixed'
              ? i % materials.length
              : Number(select('material').value)
          ]!;
        node.transform = {
          position: all
            ? {
                x: ((i % 4) - 1.5) * 130,
                y: (1 - Math.floor(i / 4)) * 120,
                z: 0,
              }
            : { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: phase, z: 0 },
          scale: { x: 1, y: 1, z: 1 },
        };
      });
      const size = all
        ? 360
        : catalog.asteroids[Number(select('shape').value)]!
            .longestDimensionMetres;
      camera.x = 0;
      camera.y = 0;
      camera.z = -size * Number(input('distance').value);
      camera.near = Math.max(0.01, size / 1000);
    };
    for (const id of ['shape', 'material'])
      select(id).addEventListener('change', arrange, { signal });
    input('distance').addEventListener('input', arrange, { signal });
    arrange();
    surface.manage(() => {
      renderer = new WebGLMeshRenderer3D(surface.gl, {
        lighting: true,
        textures: true,
        materialResponse: true,
        materialMaps: true,
        normalMapping: true,
      });
      timer = new WebGLGpuTimer(surface.gl);
      return {
        value: surface.gl,
        dispose() {
          renderer?.dispose();
          renderer = undefined;
          timer?.dispose();
          timer = undefined;
        },
      };
    });
    let readout = 0;
    application.presentation({
      scene,
      render() {
        if (!renderer || surface.gl.isContextLost()) return;
        arrange();
        surface.resize(1);
        timer?.poll();
        const timing = timer?.begin();
        const angle = Number(input('sun-angle').value);
        let result;
        try {
          result = renderer.render(
            root,
            camera,
            surface.canvas.width,
            surface.canvas.height,
            {
              clearColor: [0, 0, 0],
              normalMappingEnabled: input('normal').checked,
              lights: [
                { kind: 'ambient', color: [1, 1, 1], intensity: 0.015 },
                {
                  kind: 'directional',
                  direction: {
                    x: Math.sin(angle),
                    y: 0.5,
                    z: -Math.cos(angle),
                  },
                  color: [1, 0.97, 0.9],
                  intensity: 2,
                },
              ],
            },
          );
        } finally {
          if (timing) timer?.end();
        }
        const now = performance.now();
        if (now < readout) return;
        readout = now + 250;
        const gpu = timer?.stats;
        status.value = `Ready · 12 original meshes · 9 shared 2048² maps · no resizing/compression · cleaned presentations ${retired}`;
        metrics.value = `${application.performance?.fps?.toFixed(1) ?? '—'} callback FPS · CPU submit ${application.performance?.renderMs?.toFixed(2) ?? '—'} ms · ${result.triangles.toLocaleString()} submitted triangles · ${result.drawCalls} draws · GPU ${gpu?.averageMs?.toFixed(2) ?? gpu?.status ?? 'pending'} ms · ${surface.canvas.width} × ${surface.canvas.height} · ${select('material').selectedOptions[0]!.textContent}`;
      },
    });
    await application.start();
  } catch (error) {
    await application.dispose();
    status.value =
      signal.aborted && app !== application ? 'Superseded' : String(error);
  } finally {
    restart.disabled = false;
  }
}
restart.addEventListener('click', () => {
  void start();
});
void start();
