import { Rocket, Scene2D, Input, Cameras } from '../../src/index.js';
import type { ViewInput, CameraController } from '../../src/index.js';
import type { View } from '../../src/View.js';
import {
  ChunkStream,
  MemoryEdits,
  chunkSize,
  type DemandHandle,
} from '../streaming/ChunkStream.js';
import { DelayedChunks } from '../streaming/DelayedChunks.js';
import { TerrainGenerator } from './TerrainGenerator.js';
import { TerrainRasterCache, terrainPixels } from './TerrainRasterCache.js';
const tilePixels = 16;
function element<T extends Element>(id: string, kind: { new (): T }): T {
  const value = document.querySelector(id);
  if (!(value instanceof kind)) throw new Error(`Missing ${id}`);
  return value;
}
const status = element('#camera-status', HTMLOutputElement);
const proof = element('#camera-proof', HTMLParagraphElement);
const reset = element('#camera-reset', HTMLButtonElement);
const close = element('#camera-close', HTMLButtonElement);
const generator = new TerrainGenerator({ seed: 42, scale: 96 });
const edits = new MemoryEdits(
  (cell) => generator.sample(cell.x, cell.y).biome,
  6,
);
let selected: { x: number; y: number } | null = null;
let app: Rocket | undefined;
let previous:
  | { stream: ChunkStream; cameras: Cameras; cache: TerrainRasterCache }
  | undefined;
async function start() {
  reset.disabled = close.disabled = true;
  await app?.dispose();
  if (previous)
    proof.textContent = `Released previous app: ${previous.stream.stats.owners} demand owners, ${previous.stream.stats.retained} chunks, ${previous.cameras.size} camera controllers, ${previous.cache.stats.regions} cached regions. Shared tile edits preserved.`;
  const application = new Rocket({ performance: true, onError: showError });
  app = application;
  const cameras = application.use(Cameras),
    input = application.use(Input);
  const source = new DelayedChunks(
    (cell) => generator.chunk(cell.x, cell.y, chunkSize).biomes,
  );
  source.delayMs = 0;
  const stream = new ChunkStream(edits, 256, 1, {
    load: source.load,
    maxJobs: 4,
  });
  const cache = new TerrainRasterCache(stream, generator);
  previous = { stream, cameras, cache };
  const entries: {
    view: View;
    controller: CameraController;
    binding: ViewInput;
    demand: DemandHandle;
    mode: 'biome' | 'height';
  }[] = [];
  function bounds(view: View) {
    const b = view.worldBounds;
    return {
      minX: Math.floor(b.minX / tilePixels),
      minY: Math.floor(b.minY / tilePixels),
      maxX: Math.ceil(b.maxX / tilePixels),
      maxY: Math.ceil(b.maxY / tilePixels),
    };
  }
  const scene = application.scene(
    new Scene2D({
      update(dt) {
        for (const entry of entries) {
          if (entry.view.disposed) continue;
          // Input snapshots precede camera motion. Preserve logical cursor position, then repick.
          const pointer = entry.binding.pointer;
          const screen = pointer.world
            ? entry.view.worldToScreen(pointer.world)
            : null;
          const focused = document.activeElement === entry.view.canvas;
          entry.controller.update(dt, {
            x: focused
              ? Number(controls.down('right')) - Number(controls.down('left'))
              : 0,
            y: focused
              ? Number(controls.down('down')) - Number(controls.down('up'))
              : 0,
          });
          if (pointer.pressed && screen) {
            const world = entry.view.screenToWorld(screen);
            const cell = {
              x: Math.floor(world.x / tilePixels),
              y: Math.floor(world.y / tilePixels),
            };
            if (stream.read(cell).state === 'ready') {
              selected = cell;
              stream.cycle(cell);
            }
          }
        }
        stream.setDemands(
          entries
            .filter((e) => !e.view.disposed)
            .map((e) => ({ handle: e.demand, bounds: bounds(e.view) })),
        );
        stream.advance(4);
        cache.prune();
        const stats = stream.stats;
        const selection = selected ? stream.read(selected) : null;
        const text = `${cameras.size} cameras · ${stats.owners} demand owners · ${stats.ready}/${stats.retained} ready chunks (limit 256) · ${stats.running}/4 jobs · ${application.performance?.fps?.toFixed(0) ?? '…'} FPS\nShared selection: ${selected ? `tile (${selected.x}, ${selected.y}) · biome ${selection?.state === 'ready' ? selection.value : 'not loaded'}` : 'click a ready tile in either view'}\n${entries
          .filter((e) => !e.view.disposed)
          .map(
            (e) =>
              `${e.mode}: origin ${e.view.camera.x.toFixed(1)}, ${e.view.camera.y.toFixed(1)} · zoom ${e.view.camera.zoom.toFixed(2)} · tiles ${JSON.stringify(bounds(e.view))}`,
          )
          .join('\n')}`;
        if (status.textContent !== text) status.textContent = text;
        for (const e of entries)
          if (!e.view.disposed)
            e.view.canvas.setAttribute(
              'aria-label',
              `${e.mode} camera: zoom ${e.view.camera.zoom.toFixed(2)}, shared selection ${selected ? `${selected.x},${selected.y}` : 'none'}`,
            );
      },
      draw(ctx) {
        const entry = entries.find((e) => e.view.canvas === ctx.canvas);
        if (!entry) return;
        ctx.imageSmoothingEnabled = false;
        ctx.save();
        ctx.scale(tilePixels / terrainPixels, tilePixels / terrainPixels);
        cache.draw(ctx, bounds(entry.view), entry.mode);
        ctx.restore();
        if (selected) {
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 2 / entry.view.camera.zoom;
          ctx.strokeRect(
            selected.x * tilePixels,
            selected.y * tilePixels,
            tilePixels,
            tilePixels,
          );
        }
        const explorer = entries[0]?.view;
        if (entry.mode === 'height' && explorer && !explorer.disposed) {
          const b = explorer.worldBounds;
          ctx.strokeStyle = '#ffbf6b';
          ctx.lineWidth = 2 / entry.view.camera.zoom;
          ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
        }
      },
    }),
  );
  scene.own(stream);
  scene.own(cache);
  const controls = scene.own(
    input.scope(scene, {
      left: ['KeyA', 'ArrowLeft'],
      right: ['KeyD', 'ArrowRight'],
      up: ['KeyW', 'ArrowUp'],
      down: ['KeyS', 'ArrowDown'],
    }),
  );
  for (const [index, mode] of (['biome', 'height'] as const).entries()) {
    const view = application.view({
      target: `#camera-${mode}`,
      scene,
      width: 640,
      height: 360,
    });
    view.camera.zoom = index === 0 ? 2 : 0.5;
    view.camera.x = -view.width / (2 * view.camera.zoom);
    view.camera.y = -view.height / (2 * view.camera.zoom);
    const controller = cameras.bind(view, { minZoom: 0.5, maxZoom: 4 });
    entries.push({
      view,
      controller,
      mode,
      binding: controls.bind(view),
      demand: view.own(stream.createDemand()),
    });
    const zoom = element(`#zoom-${mode}`, HTMLSelectElement);
    zoom.value = String(view.camera.zoom);
    zoom.disabled = false;
    zoom.onchange = () => {
      if (!view.disposed)
        controller.zoomAt(Number(zoom.value), {
          x: view.width / 2,
          y: view.height / 2,
        });
    };
    const snap = element(`#snap-${mode}`, HTMLInputElement);
    snap.checked = false;
    snap.disabled = false;
    snap.onchange = () => {
      if (!view.disposed) view.pixelSnap = snap.checked;
    };
  }
  close.onclick = () => {
    entries[1]!.view.dispose();
    close.disabled = true;
    element('#zoom-height', HTMLSelectElement).disabled = true;
    element('#snap-height', HTMLInputElement).disabled = true;
    proof.textContent = `Overview closed: ${cameras.size} controller, ${stream.stats.owners} demand owner. Explorer and shared edits remain active.`;
  };
  await application.start();
  reset.disabled = close.disabled = false;
}
function showError(error: unknown) {
  status.textContent = String(error);
  reset.disabled = false;
}
reset.onclick = () => {
  void start().catch(showError);
};
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) void app?.dispose().catch(showError);
});
await start().catch(showError);
