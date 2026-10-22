import { textureProbe } from './TextureProbe.js';
import { loadTextureImage } from '../../src/webgl/index.js';
import { TextureImage } from '../../src/3d/index.js';
import type { TextureFilter, TextureWrap } from '../../src/3d/index.js';
import type { Light3D } from '../../src/3d/index.js';
import { Rocket, Scene2D } from '../../src/index.js';
import { WebGLMeshRenderer3D, WebGLGpuTimer } from '../../src/webgl/index.js';
import {
  Node3D,
  Mesh3D,
  PerspectiveCamera,
  MeshGeometry,
} from '../../src/3d/index.js';
import { faces, vertices } from '../3d/CubeGeometry.js';

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
  status.value = 'Loading three base-color maps…';
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
    'GPU lighting: three textured material samples with independent lighting.',
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
  const events = new AbortController(),
    signal = events.signal;
  window.addEventListener('pagehide', () => events.abort(), {
    once: true,
    signal,
  });
  const root = new Node3D('material samples');
  const assembly = new Node3D('objects');
  root.add(assembly);
  const names = ['black-satin-coating', 'dull-steel', 'rubber'];
  let images: TextureImage[];
  try {
    images = await Promise.all(
      names.map((name) =>
        loadTextureImage(
          new URL(
            `../../../examples/assets/cockpit-materials/${name}.png`,
            import.meta.url,
          ).href,
          {
            signal,
          },
        ),
      ),
    );
  } catch (error) {
    events.abort();
    canvas.remove();
    extensionCleanup(gl);
    await application.dispose();
    throw error;
  }
  if (app !== application) {
    events.abort();
    canvas.remove();
    return;
  }
  const checkerPixels = new Uint8Array(64 * 64 * 4);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 64; x++) {
      const c =
        ((x >> 2) + (y >> 2)) % 2 ? [230, 180, 70, 255] : [20, 65, 100, 255];
      checkerPixels.set(c, (y * 64 + x) * 4);
    }
  const checker = new TextureImage(64, 64, checkerPixels);
  const filter = document.querySelector<HTMLSelectElement>('#texture-filter')!;
  const wrap = document.querySelector<HTMLSelectElement>('#texture-wrap')!;
  const repeat = document.querySelector<HTMLInputElement>('#texture-repeat')!;
  const testPattern =
    document.querySelector<HTMLInputElement>('#test-pattern')!;
  const nodes = names.map((name, i) => {
    const node = new Node3D(name);
    node.transform = {
      ...node.transform,
      position: { x: (i - 1) * 2.8, y: 0, z: 0 },
      rotation: { x: 0, y: 0.3, z: 0 },
    };
    assembly.add(node);
    return node;
  });
  const updateMaterials = () => {
    document.querySelector('#material-caption')!.textContent =
      testPattern.checked
        ? 'Sampling test pattern on all three cubes.'
        : 'Left: black satin coating · middle: dull steel · right: rubber. Shared geometry, independent material images.';
    const r = Number(repeat.value);
    const geometry = new MeshGeometry(
      faces.flatMap((f) => f.indices.map((index) => vertices[index]!)),
      faces.map((f, i) => ({
        id: f.id,
        indices: [0, 1, 2, 3].map((j) => i * 4 + j),
        material: 0,
      })),
      [],
      {
        texCoords: faces.flatMap(
          () =>
            [
              [0, r],
              [0, 0],
              [r, 0],
              [r, r],
            ] as const,
        ),
      },
    );
    nodes.forEach((node, i) => {
      node.mesh = new Mesh3D(geometry, [
        {
          color: '#ffffff',
          baseColorTexture: {
            image: testPattern.checked ? checker : images[i]!,
            filter: filter.value as TextureFilter,
            wrapS: wrap.value as TextureWrap,
            wrapT: wrap.value as TextureWrap,
          },
        },
      ]);
    });
  };
  for (const control of [filter, wrap, repeat, testPattern])
    control.addEventListener('input', updateMaterials, { signal });
  updateMaterials();
  const lit = document.querySelector<HTMLInputElement>('#lighting-enabled')!;
  const ambient = document.querySelector<HTMLInputElement>('#ambient')!;
  const directional = document.querySelector<HTMLInputElement>('#directional')!;
  const pointStrength =
    document.querySelector<HTMLInputElement>('#point-strength')!;
  const pointX = document.querySelector<HTMLInputElement>('#point-x')!;
  const pointY = document.querySelector<HTMLInputElement>('#point-y')!;
  const pointZ = document.querySelector<HTMLInputElement>('#point-z')!;
  const orbitLight = document.querySelector<HTMLInputElement>('#orbit-light')!;
  lit.checked = true;
  ambient.value = '0.25';
  directional.value = '1';
  pointStrength.value = '6';
  pointX.value = '-1.5';
  pointY.value = '2';
  pointZ.value = '-2';
  orbitLight.checked = false;
  let lightPhase = 0;
  const camera = new PerspectiveCamera();
  const depthTest = document.querySelector<HTMLInputElement>('#depth-test')!;
  const reverseOrder =
    document.querySelector<HTMLInputElement>('#reverse-order')!;
  const cameraYaw = document.querySelector<HTMLInputElement>('#camera-yaw')!;
  const cameraPitch =
    document.querySelector<HTMLInputElement>('#camera-pitch')!;
  depthTest.checked = true;
  reverseOrder.checked = false;
  cameraYaw.value = '-20';
  cameraPitch.value = '-12';
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
  scale.value = '125';
  diagnostics.value =
    'Pixel readback runs only when requested, outside performance comparisons.';
  const initialize = () => {
    timer?.dispose();
    timer = new WebGLGpuTimer(gl);
    renderer?.dispose();
    renderer = undefined;
    try {
      const next = new WebGLMeshRenderer3D(gl, {
        lighting: true,
        textures: true,
      });
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
        if (orbitLight.checked)
          lightPhase = (lightPhase + dt * 0.6) % (Math.PI * 2);
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
      for (const target of [canvas]) {
        if (target.width !== w) target.width = w;
        if (target.height !== h) target.height = h;
        target.style.width = `${width}px`;
        target.style.height = `${height}px`;
      }
      const rotation = (Number(angle.value) * Math.PI) / 180 + phase;
      assembly.transform = {
        ...assembly.transform,
        rotation: { x: 0, y: rotation, z: 0 },
      };
      camera.yaw = (Number(cameraYaw.value) * Math.PI) / 180;
      camera.pitch = (Number(cameraPitch.value) * Math.PI) / 180;
      const distance = (10 * 85) / Number(scale.value);
      camera.x = -distance * Math.sin(camera.yaw) * Math.cos(camera.pitch);
      camera.y = -distance * Math.sin(camera.pitch);
      camera.z = -distance * Math.cos(camera.yaw) * Math.cos(camera.pitch);
      const lights: Light3D[] = [
        {
          kind: 'ambient',
          color: [0.65, 0.78, 1],
          intensity: Number(ambient.value),
        },
        {
          kind: 'directional',
          direction: { x: -0.5, y: 1, z: -0.6 },
          color: [1, 0.97, 0.9],
          intensity: Number(directional.value),
        },
        {
          kind: 'point',
          position: {
            x:
              Number(pointX.value) +
              (orbitLight.checked ? Math.sin(lightPhase) * 2 : 0),
            y: Number(pointY.value),
            z:
              Number(pointZ.value) +
              (orbitLight.checked ? Math.cos(lightPhase) * 2 : 0),
          },
          color: [1, 0.65, 0.28],
          intensity: Number(pointStrength.value),
          minimumDistance: 0.2,
        },
      ];
      document.querySelector('#light-status')!.textContent =
        `${lit.checked ? 'Lambert lighting' : 'Unlit base color'} · left: coating · middle: steel · right: rubber · UV repeat ${repeat.value}`;
      timer?.poll();
      const measuring = !sample && (timer?.begin() ?? false);
      try {
        const result = renderer.render(root, camera, w, h, {
          depthTest: depthTest.checked,
          reverseOrder: reverseOrder.checked,
          lights,
          lightingEnabled: lit.checked,
        });
        const resources = renderer.textureStats!;
        document.querySelector('#mesh-stats')!.textContent =
          `${result.drawCalls} draws · ${result.triangles} triangles · ${result.uploadedBytes} geometry bytes · ${resources.textures} textures · ${resources.samplers} samplers · ${(resources.textureBytes / 1048576).toFixed(2)} MiB RGBA8 + mip levels`;
      } finally {
        if (measuring) timer?.end();
      }
      const gpu = timer?.stats;
      document.querySelector('#perf-gpu')!.textContent =
        gpu?.averageMs == null
          ? (gpu?.status ?? 'unavailable')
          : `${gpu.averageMs.toFixed(3)} ms`;
      document.querySelector('#perf-gpu-peak')!.textContent =
        gpu?.maxMs == null ? '—' : `${gpu.maxMs.toFixed(3)} ms`;
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
        `${w} × ${h} raster pixels · ${width} × ${height} CSS · GPU antialias ${antialias ? 'on' : 'off'}`;
      if (sample) {
        diagnostics.value = `${textureProbe(renderer, w, h)} GL error ${gl.getError()} (0 = no error).`;
        renderer.render(root, camera, w, h, {
          lights,
          lightingEnabled: lit.checked,
          depthTest: depthTest.checked,
          reverseOrder: reverseOrder.checked,
        });
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
      scale.value = '125';
      animate.checked = false;
      cameraYaw.value = '-20';
      cameraPitch.value = '-12';
      lit.checked = true;
      ambient.value = '0.25';
      directional.value = '1';
      pointStrength.value = '6';
      pointX.value = '-1.5';
      pointY.value = '2';
      pointZ.value = '-2';
      orbitLight.checked = false;
      lightPhase = 0;
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

function extensionCleanup(gl: WebGL2RenderingContext) {
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}
