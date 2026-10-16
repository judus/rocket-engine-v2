import { cubeGeometry } from '../3d/CubeGeometry.js';
import { Rocket, Scene2D } from '../../src/index.js';
import {
  directionalShadowMatrix,
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
    'Directional shadows: two boxes and a hovering sphere above a floor. Settings below the canvas.',
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
  const root = new Node3D('shadow demonstration');
  const floor = new Node3D('receiver floor');
  floor.castsShadow = false;
  floor.mesh = new Mesh3D(
    new MeshGeometry(
      [
        { x: -8, y: 0, z: -8 },
        { x: 8, y: 0, z: -8 },
        { x: 8, y: 0, z: 8 },
        { x: -8, y: 0, z: 8 },
      ],
      [{ id: 'ground', indices: [0, 3, 2, 1], material: 0 }],
    ),
    [{ color: '#c6cbd1', metallicFactor: 0, roughnessFactor: 0.9 }],
  );
  root.add(floor);
  const colors = ['#d39057', '#67a7ce', '#ab87c5'];
  const nodes = [-2.5, 0, 2.5].map((x, i) => {
    const node = new Node3D('caster ' + i);
    node.transform = {
      ...node.transform,
      position: { x, y: i === 1 ? 2 : 1, z: i === 1 ? 1 : 0 },
      scale: { x: i === 1 ? 0.9 : 0.8, y: i === 1 ? 0.9 : 1, z: 0.8 },
    };
    node.mesh = new Mesh3D(
      i === 1 ? sphereGeometry() : cubeGeometry,
      Array.from({ length: i === 1 ? 1 : 6 }, () => ({
        color: colors[i]!,
        metallicFactor: 0,
        roughnessFactor: 0.65,
      })),
    );
    root.add(node);
    return node;
  });
  const camera = new PerspectiveCamera();
  camera.z = -11;
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
      shadows: true,
    });
    timer = new WebGLGpuTimer(gl);
    status.textContent = `Shadow renderer ready · cleaned presentations ${retired}`;
  };
  const resize = new ResizeObserver(() => {
    width = Math.max(1, host.clientWidth);
    height = Math.round((width * 9) / 16);
  });
  resize.observe(host);
  const scene = application.scene(
    new Scene2D({
      update(dt) {
        if (input('animate-light').checked)
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
        (Number(input('light-yaw').value) * Math.PI) / 180 + phase;
      timer?.poll();
      const measuring = !check && (timer?.begin() ?? false);
      try {
        const direction = {
          x: Math.sin(rotation) * 5,
          y: Number(input('light-height').value),
          z: Math.cos(rotation) * 5,
        };
        nodes.forEach((node) => {
          node.castsShadow = input('casters-enabled').checked;
        });
        floor.receivesShadow = input('receiver-enabled').checked;
        const result = renderer.render(root, camera, 960, 540, {
          lights: [
            {
              kind: 'ambient',
              color: [0.75, 0.85, 1],
              intensity: Number(input('ambient').value) / 100,
            },
            {
              kind: 'directional',
              direction,
              color: [1, 0.96, 0.87],
              intensity: 2,
            },
          ],
          shadow: {
            lightIndex: 1,
            matrix: directionalShadowMatrix(
              direction,
              { x: 0, y: 1, z: 0 },
              Number(input('coverage').value),
              30,
            ),
            resolution: Number(
              document.querySelector<HTMLSelectElement>('#shadow-resolution')!
                .value,
            ),
            bias: Number(input('bias').value) / 10000,
            slopeBias: Number(input('slope-bias').value) / 10000,
            filter: input('pcf').checked ? 'pcf' : 'hard',
            enabled: input('shadows-enabled').checked,
          },
          shadowDebug: input('shadow-debug').checked,
        });
        const shadow = renderer.shadowStats!;
        $('mesh-stats').textContent =
          `Color: ${result.drawCalls} draws / ${result.triangles} triangles · depth: ${shadow.drawCalls} draws / ${shadow.triangles} triangles · ${shadow.resolution}² depth texture / ${(shadow.depthBytes / 1048576).toFixed(2)} MiB estimated · shared ${result.uploadedBytes} geometry bytes`;
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
      $('shadow-status').textContent =
        `Light yaw ${(((rotation * 180) / Math.PI) % 360).toFixed(0)}° · coverage ${(Number(input('coverage').value) * 2).toFixed(0)} units · bias ${(Number(input('bias').value) / 10000).toFixed(4)} + slope ${(Number(input('slope-bias').value) / 10000).toFixed(4)} · ${input('pcf').checked ? '3 × 3 PCF' : 'hard nearest comparison'}`;
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
        'Context lost · restore to rebuild the depth target and shader resources';
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
      input('camera-x').value = '8';
      input('camera-y').value = '7';
      input('camera-z').value = '-11';
      input('camera-yaw').value = '-36';
      input('camera-pitch').value = '-24';
      input('light-yaw').value = '-145';
      input('light-height').value = '6';
      input('animate-light').checked = false;
    },
    { signal },
  );
  initialize();
  await application.start();
  restart.disabled = false;
}
function probe(renderer: WebGLMeshRenderer3D, w: number, h: number) {
  const root = new Node3D('shadow probe'),
    floor = new Node3D('receiver'),
    caster = new Node3D('occluder');
  const plane = (size: number) =>
    new Mesh3D(
      new MeshGeometry(
        [
          { x: -size, y: -size, z: 0 },
          { x: size, y: -size, z: 0 },
          { x: size, y: size, z: 0 },
          { x: -size, y: size, z: 0 },
        ],
        [{ id: 'plane', indices: [0, 3, 2, 1], material: 0 }],
      ),
      [{ color: '#ffffff', metallicFactor: 0, roughnessFactor: 1 }],
    );
  floor.mesh = plane(2);
  floor.castsShadow = false;
  caster.mesh = plane(0.3);
  caster.transform = { ...caster.transform, position: { x: 0, y: 0, z: -1 } };
  root.add(floor);
  root.add(caster);
  const camera = new PerspectiveCamera();
  camera.x = 3;
  camera.z = -5;
  camera.yaw = Math.atan2(-3, 5);
  const direction = { x: 0, y: 0, z: -1 };
  const draw = (enabled: boolean, debug = false) => {
    renderer.render(root, camera, w, h, {
      lights: [
        { kind: 'ambient', color: [1, 1, 1], intensity: 0.1 },
        { kind: 'directional', direction, color: [1, 1, 1], intensity: 0.6 },
      ],
      materialResponseEnabled: false,
      shadow: {
        lightIndex: 1,
        matrix: directionalShadowMatrix(direction, { x: 0, y: 0, z: 0 }, 3, 10),
        resolution: 256,
        bias: 0.001,
        slopeBias: 0,
        filter: 'hard',
        enabled,
      },
      shadowDebug: debug,
    });
    return renderer.readPixel(Math.floor(w / 2), Math.floor(h / 2))[0]!;
  };
  const shaded = draw(true),
    lit = draw(false),
    mask = draw(true, true);
  caster.castsShadow = false;
  const noCaster = draw(true, true);
  caster.castsShadow = true;
  floor.receivesShadow = false;
  const noReceiver = draw(true, true);
  const pass =
    Math.abs(shaded - 89) <= 3 &&
    Math.abs(lit - 218) <= 3 &&
    mask === 0 &&
    noCaster === 255 &&
    noReceiver === 255;
  return `${pass ? 'PASS' : 'FAIL'} · shadow ${shaded}/89 · lit ${lit}/218 (±3 RGB8) · visibility ${mask}/0 · caster off ${noCaster}/255 · receiver off ${noReceiver}/255`;
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
