import { Rocket, Scene2D } from '../../src/index.js';
import {
  Mesh3D,
  MeshGeometry,
  Node3D,
  PerspectiveCamera,
  TextureImage,
} from '../../src/3d/index.js';
import {
  WebGLBloomPass,
  WebGLRenderTarget,
  WebGLMeshRenderer3D,
  WebGLGpuTimer,
} from '../../src/webgl/index.js';
import type { BloomOptions } from '../../src/webgl/index.js';
import { viewportResolution } from './ViewportResolution.js';
import { paintInstrument } from './InstrumentDisplay.js';

const $ = (id: string) => document.getElementById(id)!;
const input = (id: string) => $(id) as HTMLInputElement;
const tint = (id: string): [number, number, number] => {
  const hex = input(id).value;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
};
const host = $('gpu-view');
let app: Rocket | undefined,
  retired = 0;
async function start() {
  const restart = $('restart') as HTMLButtonElement;
  restart.disabled = true;
  await app?.dispose();
  const application = new Rocket({
    performance: true,
    onError: (error) => ($('gpu-status').textContent = String(error)),
  });
  app = application;
  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.setAttribute(
    'aria-label',
    'Bloom study: bright bars, a sharp instrument panel, a dim tile and a foreground occluder. Controls below compare scene, extraction and glow.',
  );
  host.append(canvas);
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    depth: true,
    antialias: false,
  });
  if (!gl) {
    canvas.remove();
    await application.dispose();
    $('gpu-status').textContent = 'WebGL2 unavailable';
    restart.disabled = false;
    return;
  }
  const events = new AbortController(),
    signal = events.signal;
  const source = document.createElement('canvas');
  source.width = 512;
  source.height = 320;
  const ctx = source.getContext('2d')!;
  paintInstrument(ctx, 1, 1, '#71e5c3');
  const image = new TextureImage(
    512,
    320,
    new Uint8Array(ctx.getImageData(0, 0, 512, 320).data),
  );
  const root = new Node3D('bloom study');
  function quad(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    color: string,
    textured = false,
  ) {
    const node = new Node3D(name);
    node.mesh = new Mesh3D(
      new MeshGeometry(
        [
          { x: -w / 2, y: -h / 2, z: 0 },
          { x: w / 2, y: -h / 2, z: 0 },
          { x: w / 2, y: h / 2, z: 0 },
          { x: -w / 2, y: h / 2, z: 0 },
        ],
        [{ id: 'surface', indices: [0, 1, 2, 3], material: 0 }],
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
      [{ color, ...(textured ? { baseColorTexture: { image } } : {}) }],
    );
    node.transform = { ...node.transform, position: { x, y, z } };
    root.add(node);
    return node;
  }
  quad('white bar', -2.6, 0.7, 0, 1.2, 0.08, '#ffffff');
  quad('cyan bar', -2.6, 0, 0, 1.2, 0.08, '#70fff0');
  quad('amber bar', -2.6, -0.7, 0, 1.2, 0.08, '#ffc153');
  const panel = quad('instrument', 0, 0, 0, 2.8, 1.75, '#ffffff', true);
  quad('dim tile', 2.65, 0, 0, 1.1, 1.1, '#475769');
  quad('occluding strip', 0.8, -0.1, -0.4, 0.12, 1.8, '#10151b');
  const camera = new PerspectiveCamera();
  camera.z = -5;
  camera.far = 100;
  let renderer: WebGLMeshRenderer3D | undefined,
    bloom: WebGLBloomPass | undefined,
    target: WebGLRenderTarget | undefined,
    timer: WebGLGpuTimer | undefined,
    lost = false,
    phase = 0,
    check = false;
  const cleanup = () => {
    bloom?.dispose();
    target?.dispose();
    renderer?.dispose();
    timer?.dispose();
    bloom = undefined;
    target = undefined;
    renderer = undefined;
    timer = undefined;
  };
  const initialize = () => {
    cleanup();
    try {
      renderer = new WebGLMeshRenderer3D(gl, {
        lighting: true,
        textures: true,
      });
      target = new WebGLRenderTarget(gl, 1, 1);
      bloom = new WebGLBloomPass(gl);
      timer = new WebGLGpuTimer(gl);
      $('gpu-status').textContent =
        `Bloom ready · cleaned presentations ${retired}`;
    } catch (error) {
      cleanup();
      $('gpu-status').textContent = String(error);
    }
  };
  initialize();
  const limits = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
  const max = Math.min(
    gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
  );
  const scene = application.scene(
    new Scene2D({
      update(dt) {
        if (input('animate').checked) phase += dt;
      },
    }),
  );
  application.presentation({
    scene,
    render() {
      if (lost || gl.isContextLost() || !renderer || !bloom || !target) return;
      const width = Math.max(1, host.clientWidth),
        height = Math.max(1, Math.round((width * 9) / 16));
      const ratio = window.devicePixelRatio || 1,
        scale = Number(input('render-scale').value) / 100;
      const raster = viewportResolution(
        width,
        height,
        ratio,
        scale,
        Math.min(max, limits[0]!),
        Math.min(max, limits[1]!),
      );
      const w = raster.width,
        h = raster.height;
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      target.resize(w, h);
      panel.transform = {
        ...panel.transform,
        rotation: { x: 0, y: Math.sin(phase * 0.5) * 0.15, z: 0 },
      };
      const options: BloomOptions = {
        threshold: Number(input('threshold').value),
        strength: input('bloom-enabled').checked
          ? Number(input('strength').value)
          : 0,
        radius: Number(input('radius').value),
        midtoneLift: Number(input('midtone-lift').value),
        colorGrade: {
          shadows: tint('shadow-tint'),
          midtones: tint('midtone-tint'),
          highlights: tint('highlight-tint'),
          strength: Number(input('grade-strength').value),
        },
        view: ($('bloom-view') as HTMLSelectElement).value as NonNullable<
          BloomOptions['view']
        >,
      };
      timer?.poll();
      const measuring = !check && (timer?.begin() ?? false);
      try {
        const geometry = renderer.render(root, camera, w, h, {
          target,
          lightingEnabled: false,
        });
        bloom.render(target, options);
        const stats = bloom.stats;
        $('pass-stats').textContent =
          `${geometry.drawCalls} scene draws / ${geometry.triangles} triangles · ${stats.drawCalls} fullscreen passes · bloom ${stats.width} × ${stats.height} · ${((target.estimatedBytes + stats.estimatedBytes) / 1048576).toFixed(2)} MiB targets (RGBA8 + depth16, estimated) · geometry ${geometry.uploadedBytes} bytes`;
      } finally {
        if (measuring) timer?.end();
      }
      if (check) {
        try {
          $('gpu-diagnostic').textContent = probe(gl, bloom);
        } catch (error) {
          $('gpu-diagnostic').textContent = String(error);
        }
        check = false;
        renderer.render(root, camera, w, h, { target, lightingEnabled: false });
        bloom.render(target, options);
      }
      const gpu = timer?.stats;
      $('perf-gpu').textContent =
        gpu?.averageMs == null
          ? (gpu?.status ?? 'unavailable')
          : `${gpu.averageMs.toFixed(3)} ms`;
      $('perf-gpu-peak').textContent =
        gpu?.maxMs == null ? '—' : `${gpu.maxMs.toFixed(3)} ms`;
      $('perf-gpu-samples').textContent =
        `${gpu?.samples ?? 0}/32 valid · ${gpu?.pending ?? 0}/4 pending · ${gpu?.status ?? 'unavailable'}`;
      const perf = application.performance;
      if (perf)
        for (const [id, value] of [
          ['fps', perf.fps],
          ['frame', perf.frameMs],
          ['peak', perf.maxFrameMs],
          ['minimum', perf.minFrameMs],
          ['jitter', perf.frameJitterMs],
          ['update', perf.updateMs],
          ['render', perf.renderMs],
        ] as const)
          $('perf-' + id).textContent =
            value == null
              ? 'Warming up…'
              : id === 'fps'
                ? value.toFixed(1)
                : `${value.toFixed(2)} ms`;
      for (const id of [
        'threshold',
        'strength',
        'radius',
        'midtone-lift',
        'grade-strength',
        'render-scale',
      ])
        $('' + id + '-value').textContent =
          input(id).value + (id === 'render-scale' ? '%' : '');
      $('perf-resolution').textContent =
        `${w} × ${h} raster · ${width} × ${height} CSS · DPR ${ratio.toFixed(2)} · ${input('render-scale').value}% scale · offscreen MSAA off${raster.limited ? ' · GPU dimension limit' : ''}`;
    },
    dispose() {
      events.abort();
      cleanup();
      canvas.remove();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      retired++;
    },
  });
  const extension = gl.getExtension('WEBGL_lose_context');
  const lose = $('lose-context') as HTMLButtonElement,
    restore = $('restore-context') as HTMLButtonElement;
  lose.disabled = !extension;
  restore.disabled = true;
  lose.addEventListener('click', () => extension?.loseContext(), { signal });
  restore.addEventListener('click', () => extension?.restoreContext(), {
    signal,
  });
  $('read-pixel').addEventListener('click', () => (check = true), { signal });
  canvas.addEventListener(
    'webglcontextlost',
    (event) => {
      event.preventDefault();
      lost = true;
      cleanup();
      $('gpu-status').textContent =
        'Context lost · restore to rebuild scene and bloom targets';
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
  window.addEventListener('pagehide', () => void application.dispose(), {
    once: true,
    signal,
  });
  restart.disabled = false;
  await application.start();
}
function probe(gl: WebGL2RenderingContext, bloom: WebGLBloomPass): string {
  const target = new WebGLRenderTarget(gl, 32, 32, false);
  const readRgb = (sx: number, sy: number) => {
    const p = new Uint8Array(4);
    gl.readPixels(
      Math.floor(sx * gl.drawingBufferWidth),
      Math.floor(sy * gl.drawingBufferHeight),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      p,
    );
    return [...p.slice(0, 3)];
  };
  const read = (sx: number, sy: number) => readRgb(sx, sy)[0]!;
  try {
    target.bind(gl);
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.clearColor(0.02, 0.02, 0.02, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(14, 14, 4, 4);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.disable(gl.SCISSOR_TEST);
    bloom.render(target, { strength: 0 });
    const baseline = read(22 / 32, 16 / 32),
      center = read(0.5, 0.5);
    bloom.render(target, { threshold: 0.6, strength: 1, radius: 1 });
    const halo = read(22 / 32, 16 / 32),
      sharp = read(0.5, 0.5);
    bloom.render(target, { threshold: 1, strength: 1, radius: 1 });
    const cutoff = read(22 / 32, 16 / 32);
    bloom.render(target, { threshold: 0.6, view: 'bright' });
    const outside = read(22 / 32, 16 / 32);
    const graded: number[] = [];
    let rawMid = 0;
    for (const value of [0, 0.5, 1]) {
      target.bind(gl);
      gl.clearColor(value, value, value, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      bloom.render(target, { strength: 0, midtoneLift: 0.2 });
      graded.push(read(0.5, 0.5));
      if (value === 0.5) {
        bloom.render(target, { strength: 0, midtoneLift: 0.2, view: 'scene' });
        rawMid = read(0.5, 0.5);
      }
    }
    const splitGrade = {
      shadows: [0.5, 0.7, 1],
      midtones: [1, 0.7, 0.4],
      highlights: [1, 1, 0.7],
      strength: 0.5,
    } as const;
    const split: number[][] = [];
    let rawGradeMid: number[] = [];
    for (const value of [0, 0.1, 0.5, 0.9]) {
      target.bind(gl);
      gl.clearColor(value, value, value, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      bloom.render(target, { strength: 0, colorGrade: splitGrade });
      split.push(readRgb(0.5, 0.5));
      if (value === 0.5) {
        bloom.render(target, {
          strength: 0,
          colorGrade: splitGrade,
          view: 'scene',
        });
        rawGradeMid = readRgb(0.5, 0.5);
      }
    }
    const splitPass =
      split[0]!.every((v) => v === 0) &&
      split[1]![2]! > split[1]![1]! &&
      split[1]![1]! > split[1]![0]! &&
      split[2]![0]! > split[2]![1]! &&
      split[2]![1]! > split[2]![2]! &&
      split[3]![0]! > split[3]![2]! &&
      split[3]![1]! > split[3]![2]! &&
      rawGradeMid.every((v) => Math.abs(v - 128) <= 1);
    const error = gl.getError();
    const pass =
      halo > baseline + 2 &&
      center === 255 &&
      sharp === 255 &&
      Math.abs(cutoff - baseline) <= 1 &&
      outside === 0 &&
      graded[0] === 0 &&
      Math.abs(graded[1]! - 140) <= 1 &&
      graded[2] === 255 &&
      Math.abs(rawMid - 128) <= 1 &&
      splitPass &&
      error === 0;
    return `${pass ? 'PASS' : 'FAIL'} · halo ${baseline} → ${halo} · sharp center ${center}/${sharp} · threshold 1 ${cutoff} · extraction outside ${outside} · midtone curve black/mid/white ${graded.join('/')} · raw mid ${rawMid} · split tones ${splitPass ? 'PASS' : 'FAIL'} ${JSON.stringify(split)} raw ${JSON.stringify(rawGradeMid)} · GL error ${error}`;
  } finally {
    target.dispose();
  }
}
$('restart').addEventListener(
  'click',
  () =>
    void start().catch(
      (error) => ($('gpu-status').textContent = String(error)),
    ),
);
void start().catch((error) => ($('gpu-status').textContent = String(error)));
