import { Rocket, Scene2D } from '../../src/index.js';
import {
  DynamicTextureImage,
  VideoTextureImage,
  Mesh3D,
  MeshGeometry,
  Node3D,
  PerspectiveCamera,
} from '../../src/3d/index.js';
import {
  WebGLMeshRenderer3D,
  WebGLSurface,
  updateTextureFromCanvas,
} from '../../src/webgl/index.js';
const $ = <T extends HTMLElement>(id: string) => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing ${id}`);
  return element as T;
};
const video = $<HTMLVideoElement>('source'),
  mode = $<HTMLSelectElement>('transport'),
  saturation = $<HTMLInputElement>('saturation');
const error = (e: unknown) => {
  $('error').textContent = String(e);
};
const app = new Rocket({ onError: error });
const canvas = document.createElement('canvas');
canvas.width = 2048;
canvas.height = 1408;
const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
if (!ctx) throw new Error('Demo source canvas unavailable');
function background() {
  ctx!.fillStyle = '#080b0e';
  ctx!.fillRect(0, 0, 2048, 1408);
  ctx!.strokeStyle = 'white';
  ctx!.lineWidth = 3;
  ctx!.strokeRect(319, 390, 690, 690);
  ctx!.font = '34px monospace';
  ctx!.fillStyle = 'white';
  ctx!.fillText('CALL / VIDEO TEXTURE', 319, 280);
  [
    'How are things over there?',
    'Does the crew need anything?',
    'I will let you get back to work.',
  ].forEach((text, i) => {
    ctx!.strokeRect(1170, 390 + i * 150, 560, 120);
    ctx!.font = '24px monospace';
    ctx!.fillText(text, 1190, 455 + i * 150, 520);
  });
}
background();
const pixels = new Uint8Array(ctx.getImageData(0, 0, 2048, 1408).data);
const staticUI = new DynamicTextureImage(2048, 1408, pixels),
  composite = new DynamicTextureImage(2048, 1408, pixels);
const root = new Node3D(),
  panel = new Node3D(),
  movie = new Node3D();
root.add(panel);
root.add(movie);
function rectangle(x: number, y: number, w: number, h: number, z: number) {
  const point = (u: number, v: number) => ({
    x: (u / 2048 - 0.5) * 5,
    y: (0.5 - v / 1408) * 3.4375,
    z,
  });
  return new MeshGeometry(
    [point(x, y + h), point(x + w, y + h), point(x + w, y), point(x, y)],
    [{ id: 'screen', indices: [0, 1, 2, 3], material: 0 }],
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
}
const geometry = rectangle(0, 0, 2048, 1408, 0),
  movieGeometry = rectangle(319, 390, 690, 690, -0.001);
let source: VideoTextureImage | null = null,
  lastFrame = -1,
  publications = 0,
  cpuMs = 0,
  frames = 0,
  elapsed = 0,
  baselineBytes = 0,
  baselineUpdates = 0,
  baselineMips = 0;
const camera = new PerspectiveCamera();
camera.z = -4;
camera.far = 100;
function rebuild() {
  panel.mesh = new Mesh3D(geometry, [
    {
      color: '#ffffff',
      unlit: true,
      baseColorTexture: {
        image: mode.value === 'direct' ? staticUI : composite,
        filter: 'linear',
      },
    },
  ]);
  movie.visible = mode.value === 'direct' && source !== null;
  if (source)
    movie.mesh = new Mesh3D(movieGeometry, [
      {
        color: '#ffffff',
        unlit: true,
        saturation: Number(saturation.value),
        baseColorTexture: { image: source, filter: 'linear' },
      },
    ]);
}
const scene = app.scene(
  new Scene2D({
    update(dt) {
      elapsed += dt;
      if (video.readyState < 2 || (video.paused && lastFrame >= 0)) return;
      const frame = Math.floor(video.currentTime * 24);
      if (frame === lastFrame) return;
      lastFrame = frame;
      const start = performance.now();
      if (!source) {
        source = new VideoTextureImage(video);
        rebuild();
      }
      if (mode.value === 'direct') source.update();
      else {
        background();
        ctx!.filter = `saturate(${saturation.value})`;
        ctx!.drawImage(video, 319, 390, 690, 690);
        ctx!.filter = 'none';
        updateTextureFromCanvas(composite, ctx!);
      }
      cpuMs += performance.now() - start;
      publications++;
    },
  }),
);
const surface = new WebGLSurface({
  target: $('view'),
  scene,
  onError: error,
  label: 'Angled UI panel with a separate video surface',
});
const renderer = surface.manage((gl) => {
  const value = new WebGLMeshRenderer3D(gl, { lighting: true, textures: true });
  return { value, dispose: () => value.dispose() };
});
rebuild();
const reset = () => {
  publications = cpuMs = frames = elapsed = 0;
  const uploads = renderer.current?.textureUploadStats;
  baselineBytes = uploads?.sourceBytes ?? 0;
  baselineUpdates = uploads?.updates ?? 0;
  baselineMips = uploads?.mipmapBuilds ?? 0;
  lastFrame = -1;
  rebuild();
};
mode.addEventListener('change', reset);
saturation.addEventListener('input', reset);
$('play').addEventListener('click', () => {
  if (video.paused) void video.play().catch(error);
  else video.pause();
});
video.addEventListener('error', () =>
  error(new Error('Demo video failed to load')),
);
app.presentation({
  scene,
  render() {
    panel.transform = {
      ...panel.transform,
      rotation: { x: 0.12, y: 0.16, z: 0 },
    };
    movie.transform = panel.transform;
    const gpu = renderer.current;
    if (!gpu) return;
    surface.resize(1 / (window.devicePixelRatio || 1), 960 / 660);
    gpu.render(root, camera, surface.canvas.width, surface.canvas.height, {
      lightingEnabled: false,
    });
    frames++;
    const uploads = gpu.textureUploadStats!;
    $('stats').textContent =
      `${mode.value} · ${video.paused ? 'paused' : 'playing'}\n${elapsed ? (frames / elapsed).toFixed(1) : '—'} presentation fps · ${publications} video publications\n${publications ? (cpuMs / publications).toFixed(3) : '0'} ms average CPU preparation / publication\n${((uploads.sourceBytes - baselineBytes) / 1048576).toFixed(2)} MiB submitted · ${uploads.updates - baselineUpdates} in-place updates · ${uploads.mipmapBuilds - baselineMips} mipmap builds\nStatic UI revision ${staticUI.revision} · composite revision ${composite.revision} · video revision ${source?.revision ?? 0}`;
  },
  dispose() {
    video.pause();
    video.removeAttribute('src');
    video.load();
    surface.dispose();
  },
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) video.pause();
});
window.addEventListener(
  'pagehide',
  () => {
    void app.dispose();
  },
  { once: true },
);
await app.start();
