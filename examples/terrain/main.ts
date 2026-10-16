import { Input, Rocket, Scene2D } from '../../src/index.js';
import {
  TerrainGenerator,
  biomeNames,
  type TerrainChunk,
} from './TerrainGenerator.js';

function element<T extends Element>(selector: string, kind: { new (): T }): T {
  const value = document.querySelector(selector);
  if (!(value instanceof kind)) throw new Error(`Missing ${selector}`);
  return value;
}
const seed = element('#terrain-seed', HTMLInputElement),
  scale = element('#terrain-scale', HTMLInputElement);
const reverse = element('#terrain-reverse', HTMLInputElement);
const status = element('#terrain-status', HTMLOutputElement);
const details = element('#terrain-details', HTMLParagraphElement);
const colors = [
  '#315f91',
  '#d9c18a',
  '#83b85f',
  '#326d51',
  '#92969b',
  '#e9f0f4',
] as const;
const width = 128,
  height = 96,
  size = 32,
  pixels = 5;
let originX = -64,
  originY = -64;
let generator = new TerrainGenerator({ seed: 42 });
const biomeCanvas = document.createElement('canvas'),
  heightCanvas = document.createElement('canvas');
biomeCanvas.width = heightCanvas.width = width * pixels;
biomeCanvas.height = heightCanvas.height = height * pixels;
function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  return ctx;
}
const biomeCtx = context(biomeCanvas),
  heightCtx = context(heightCanvas);
const app = new Rocket({ performance: true });
let cameraX = originX,
  cameraY = originY;
let rebuildMs = 0,
  generated = 0,
  rebuilds = 0;
let chunksByKey = new Map<string, TerrainChunk>();
const meter = element('#terrain-meter', HTMLOutputElement);
const scene = app.scene(
  new Scene2D({
    update(dt) {
      const dx = Number(controls.down('right')) - Number(controls.down('left'));
      const dy = Number(controls.down('down')) - Number(controls.down('up'));
      if (dx || dy) {
        const length = Math.hypot(dx, dy);
        attempt(() =>
          moveCamera(
            cameraX + (dx * 32 * dt) / length,
            cameraY + (dy * 32 * dt) / length,
          ),
        );
      }
      const perf = app.performance;
      meter.textContent = `${perf?.fps?.toFixed(0) ?? '…'} FPS · frame ${perf?.frameMs?.toFixed(2) ?? '…'} ms · update ${perf?.updateMs?.toFixed(2) ?? '…'} ms · render ${perf?.renderMs?.toFixed(2) ?? '…'} ms\nCamera (${cameraX.toFixed(1)}, ${cameraY.toFixed(1)}) tiles · ${chunksByKey.size} retained chunks · ${generated} generated total · ${rebuilds} raster rebuilds · last rebuild ${rebuildMs.toFixed(1)} ms\nShared raster buffers: ${((biomeCanvas.width * biomeCanvas.height * 8) / 1048576).toFixed(2)} MiB RGBA`;
    },
    draw(ctx) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        ctx.canvas === views[0]?.canvas ? biomeCanvas : heightCanvas,
        originX * pixels,
        originY * pixels,
      );
    },
    dispose() {
      chunksByKey.clear();
      biomeCanvas.width = heightCanvas.width = 0;
    },
  }),
);
const controls = scene.own(
  app.use(Input).scope(scene, {
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
  }),
);
const views = ['#terrain-biomes', '#terrain-height'].map((target) => {
  const view = app.view({
    target,
    width: width * pixels,
    height: height * pixels,
    scene,
  });
  controls.bind(view);
  return view;
});
function moveCamera(x: number, y: number) {
  x = Math.max(-999968, Math.min(999840, x));
  y = Math.max(-999968, Math.min(999840, y));
  const alignedX = Math.floor(x / size) * size,
    alignedY = Math.floor(y / size) * size;
  const neededWidth = Math.ceil((x + width) / size) * size - alignedX;
  const neededHeight = Math.ceil((y + height) / size) * size - alignedY;
  if (
    alignedX !== originX ||
    alignedY !== originY ||
    neededWidth * pixels !== biomeCanvas.width ||
    neededHeight * pixels !== biomeCanvas.height
  )
    rebuild(generator, alignedX, alignedY, x, y);
  cameraX = x;
  cameraY = y;
  for (const view of views) {
    view.camera.x = x * pixels;
    view.camera.y = y * pixels;
  }
}
function rebuild(
  next: TerrainGenerator,
  x: number,
  y: number,
  viewX = cameraX,
  viewY = cameraY,
) {
  const patchWidth = Math.ceil((viewX + width) / size) * size - x;
  const patchHeight = Math.ceil((viewY + height) / size) * size - y;
  const started = performance.now();
  const coordinates: { x: number; y: number }[] = [];
  for (let cy = 0; cy < patchHeight / size; cy++)
    for (let cx = 0; cx < patchWidth / size; cx++)
      coordinates.push({ x: x / size + cx, y: y / size + cy });
  if (reverse.checked) coordinates.reverse();
  const retained = new Map<string, TerrainChunk>();
  let newChunks = 0;
  const chunks = coordinates.map((cell) => {
    const key = `${cell.x},${cell.y}`;
    const cached = next === generator ? chunksByKey.get(key) : undefined;
    const chunk = cached ?? next.chunk(cell.x, cell.y, size);
    if (!cached) newChunks++;
    retained.set(key, chunk);
    return chunk;
  });
  const heights = new Float32Array(patchWidth * patchHeight),
    moisture = new Float32Array(patchWidth * patchHeight),
    biomes = new Uint8Array(patchWidth * patchHeight);
  for (const chunk of chunks)
    for (let cy = 0; cy < size; cy++)
      for (let cx = 0; cx < size; cx++) {
        const source = cy * size + cx;
        const target =
          (chunk.y * size - y + cy) * patchWidth + chunk.x * size - x + cx;
        heights[target] = chunk.heights[source] ?? 0;
        moisture[target] = chunk.moisture[source] ?? 0;
        biomes[target] = chunk.biomes[source] ?? 0;
      }
  // Publish both presentations only after every chunk has generated successfully.
  chunksByKey = retained;
  generated += newChunks;
  rebuilds++;
  biomeCanvas.width = heightCanvas.width = patchWidth * pixels;
  biomeCanvas.height = heightCanvas.height = patchHeight * pixels;
  generator = next;
  originX = x;
  originY = y;
  const counts = [0, 0, 0, 0, 0, 0];
  let digest = 2166136261;
  const heightBits = new Uint32Array(heights.buffer),
    moistureBits = new Uint32Array(moisture.buffer);
  for (let py = 0; py < patchHeight; py++)
    for (let px = 0; px < patchWidth; px++) {
      const index = py * patchWidth + px,
        biome = biomes[index] ?? 0;
      counts[biome] = (counts[biome] ?? 0) + 1;
      digest = Math.imul(digest ^ (heightBits[index] ?? 0), 16777619);
      digest = Math.imul(digest ^ (moistureBits[index] ?? 0) ^ biome, 16777619);
      biomeCtx.fillStyle = colors[biome] ?? colors[0];
      biomeCtx.fillRect(px * pixels, py * pixels, pixels, pixels);
      const shade = Math.round((heights[index] ?? 0) * 255);
      heightCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
      heightCtx.fillRect(px * pixels, py * pixels, pixels, pixels);
    }
  for (const ctx of [biomeCtx, heightCtx]) {
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 1;
    for (let cx = 1; cx < patchWidth / size; cx++) {
      ctx.beginPath();
      ctx.moveTo(cx * size * pixels, 0);
      ctx.lineTo(cx * size * pixels, patchHeight * pixels);
      ctx.stroke();
    }
    for (let cy = 1; cy < patchHeight / size; cy++) {
      ctx.beginPath();
      ctx.moveTo(0, cy * size * pixels);
      ctx.lineTo(patchWidth * pixels, cy * size * pixels);
      ctx.stroke();
    }
  }
  rebuildMs = performance.now() - started;
  const checksum = (digest >>> 0).toString(16).padStart(8, '0');
  status.textContent = `Seed ${next.config.seed} · origin (${x}, ${y}) · checksum ${checksum}`;
  details.textContent = `${next.identity}\n${chunks.length} independent 32 × 32 chunks · ${patchWidth * patchHeight} samples · ${rebuildMs.toFixed(1)} ms rebuild (${newChunks} new chunks)\n${biomeNames.map((name, index) => `${name}: ${counts[index] ?? 0}`).join(' · ')}\nChunk lines mark partition boundaries. Reverse generation order or regenerate: the checksum must stay the same.`;
  views[0]?.canvas.setAttribute(
    'aria-label',
    `Procedural biome map: seed ${next.config.seed}, origin ${x}, ${y}, checksum ${checksum}`,
  );
  views[1]?.canvas.setAttribute(
    'aria-label',
    `Same terrain elevation: seed ${next.config.seed}, origin ${x}, ${y}, checksum ${checksum}`,
  );
}
function attempt(action: () => void) {
  try {
    action();
  } catch (error) {
    status.textContent = String(error);
  }
}
element('#terrain-apply', HTMLButtonElement).onclick = () =>
  attempt(() =>
    rebuild(
      new TerrainGenerator({
        seed: seed.valueAsNumber,
        scale: scale.valueAsNumber,
      }),
      originX,
      originY,
    ),
  );
element('#terrain-regenerate', HTMLButtonElement).onclick = () =>
  attempt(() => {
    chunksByKey.clear();
    rebuild(generator, originX, originY);
  });
reverse.onchange = () =>
  attempt(() => {
    chunksByKey.clear();
    rebuild(generator, originX, originY);
  });
for (const [id, dx, dy] of [
  ['west', -32, 0],
  ['east', 32, 0],
  ['north', 0, -32],
  ['south', 0, 32],
] as const)
  element(`#terrain-${id}`, HTMLButtonElement).onclick = () =>
    attempt(() => moveCamera(cameraX + dx, cameraY + dy));
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) void app.dispose();
});
rebuild(generator, originX, originY);
moveCamera(cameraX, cameraY);
await app.start();
