import { Rocket, Scene2D, Input } from '../src/index.js';
import type { View } from '../src/View.js';
import { TileRegionCache } from './TileRegionCache.js';
import { TileBoard } from './TileBoard.js';
import { createTileSummary } from './createTileSummary.js';
import { createTileBoard } from './createTileBoard.js';

function element<T extends Element>(selector: string, kind: { new (): T }): T {
  const match = document.querySelector(selector);
  if (!(match instanceof kind)) throw new Error(`Missing ${selector}`);
  return match;
}
const status = element('#board-status', HTMLOutputElement);
const restart = element('#restart-board', HTMLButtonElement);
const closeDetail = element('#close-detail', HTMLButtonElement);
const cacheStatus = element('#cache-status', HTMLParagraphElement);
const cleanup = element('#board-cleanup', HTMLParagraphElement);
let app: Rocket | undefined;
let cleaned = 0;

async function startBoard() {
  restart.disabled = closeDetail.disabled = true;
  await app?.dispose();
  const application = new Rocket({ onError: showError, performance: true });
  app = application;
  const input = application.use(Input);
  const board = new TileBoard({ width: 128, height: 80 });
  const cache = new TileRegionCache(board);
  const presentation = createTileBoard(
    board,
    () => {
      cleanup.textContent = `${++cleaned} board presentations cleaned up`;
    },
    cache,
  );
  const views: View[] = [];
  const scene = application.scene(
    new Scene2D({
      update(dt) {
        const dx =
          Number(controls.down('right')) - Number(controls.down('left'));
        const dy = Number(controls.down('down')) - Number(controls.down('up'));
        const length = Math.hypot(dx, dy) || 1;
        for (const view of views) {
          if (view.disposed) continue;
          view.camera.x += (dx * 120 * dt) / length;
          view.camera.y += (dy * 120 * dt) / length;
        }
        for (const binding of controls.views) {
          const { pressed, world } = binding.pointer;
          if (pressed && world && presentation.edit(world)) report();
        }
      },
    }),
  );
  scene.own(cache);
  scene.root.add(presentation.node);
  const controls = scene.own(
    input.scope(scene, {
      left: ['ArrowLeft', 'KeyA'],
      right: ['ArrowRight', 'KeyD'],
      up: ['ArrowUp', 'KeyW'],
      down: ['ArrowDown', 'KeyS'],
    }),
  );
  for (const [target, label, zoom] of [
    ['#board-world', 'World tile controls', 1],
    ['#board-detail', 'Detail tile controls', 1.7],
  ] as const) {
    const view = application.view({
      target,
      scene,
      width: 640,
      height: 360,
      overlay(ctx) {
        const stats = cache.stats;
        const fps = application.performance?.fps;
        ctx.fillStyle = '#101b2be6';
        ctx.fillRect(8, 8, 530, 46);
        ctx.fillStyle = '#c6d5e6';
        ctx.font = '12px monospace';
        ctx.fillText(
          `${stats.regions}/${stats.maxRegions} regions · ${stats.builds} rebuilds · ${stats.evictions} evictions`,
          16,
          26,
        );
        ctx.fillText(
          `${(stats.pixelBytes / 1048576).toFixed(2)} MiB RGBA estimate · ${fps?.toFixed(0) ?? '…'} FPS`,
          16,
          44,
        );
        const message = `Shared cache: ${stats.regions}/${stats.maxRegions} regions · ${stats.builds} rebuilds · ${stats.evictions} evictions\n${(stats.pixelBytes / 1048576).toFixed(2)} MiB RGBA estimate (6 MiB limit)`;
        if (cacheStatus.textContent !== message)
          cacheStatus.textContent = message;
      },
    });
    view.camera.zoom = zoom;
    view.camera.x = -view.width / (2 * zoom);
    view.camera.y = -view.height / (2 * zoom);
    view.canvas.setAttribute('aria-label', label);
    controls.bind(view);
    views.push(view);
  }
  const summary = application.view({
    target: '#board-summary',
    scene: application.scene(createTileSummary(board)),
    width: 640,
    height: 220,
  });
  closeDetail.onclick = () => {
    views[1]?.dispose();
    closeDetail.disabled = true;
    report();
  };
  function report() {
    const cell = presentation.selected;
    const selection = cell ? `tile (${cell.x}, ${cell.y})` : 'no tile selected';
    const count = controls.views.length + 1;
    const { active, total, mint, sand } = board.counts;
    summary.canvas.setAttribute(
      'aria-label',
      `Tile activity: ${active} of ${total} active, ${mint} mint, ${sand} sand`,
    );
    status.textContent = `${selection} · ${board.revision} edits · ${count} ${count === 1 ? 'canvas' : 'canvases'}`;
  }
  await application.start();
  report();
  restart.disabled = closeDetail.disabled = false;
}
function showError(error: unknown) {
  status.textContent = error instanceof Error ? error.message : String(error);
  restart.disabled = false;
  console.error(error);
}
restart.addEventListener('click', () => {
  void startBoard().catch(showError);
});
await startBoard().catch(showError);
