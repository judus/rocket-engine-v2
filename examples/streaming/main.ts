import { Rocket, Scene2D, Input } from '../../src/index.js';
import type { InputScope, ViewInput } from '../../src/index.js';
import type { View } from '../../src/View.js';
import type { Cell } from '../TileBoard.js';
import { ChunkStream, chunkSize, tileSize } from './ChunkStream.js';
import type { DemandHandle, TileBounds } from './ChunkStream.js';
import { PersistentEdits } from './PersistentEdits.js';
import { DelayedChunks } from './DelayedChunks.js';
import { IndexedDbEdits, generatorVersion } from './IndexedDbEdits.js';

function element<T extends Element>(selector: string, kind: { new (): T }): T {
  const match = document.querySelector(selector);
  if (!(match instanceof kind)) throw new Error(`Missing ${selector}`);
  return match;
}
const status = element('#stream-status', HTMLOutputElement);
const cleanup = element('#stream-cleanup', HTMLParagraphElement);
const far = element('#stream-far', HTMLButtonElement);
const back = element('#stream-back', HTMLButtonElement);
const restart = element('#stream-restart', HTMLButtonElement);
const retry = element('#stream-retry', HTMLButtonElement);
const failSave = element('#stream-fail-save', HTMLButtonElement);
const storageStatus = element('#stream-storage', HTMLParagraphElement);
const delay = element('#chunk-delay', HTMLInputElement);
const varied = element('#chunk-varied', HTMLInputElement);
const failChunk = element('#chunk-fail', HTMLButtonElement);
const retryChunks = element('#chunk-retry', HTMLButtonElement);
const chunkStatus = element('#chunk-status', HTMLParagraphElement);
const closeA = element('#stream-close-a', HTMLButtonElement);
const closeB = element('#stream-close-b', HTMLButtonElement);
const overlap = element('#stream-overlap', HTMLButtonElement);
type TerrainView = {
  label: string;
  view: View;
  demand: DemandHandle;
  controls: InputScope<'left' | 'right' | 'up' | 'down'>;
  binding: ViewInput;
};
const source = new DelayedChunks();
delay.oninput = () => {
  source.delayMs = Number(delay.value);
};
varied.onchange = () => {
  source.varied = varied.checked;
};
// Host/session ownership: replacing the stream or its views preserves this store.
const storage = new IndexedDbEdits();
const edits = new PersistentEdits(storage);
let selected: Cell | null = null;
let app: Rocket | undefined;
let previous: ChunkStream | undefined;
function selectSavedTile() {
  if (edits.ready && !selected) selected = edits.snapshot()[0] ?? null;
}
void edits.load().then(selectSavedTile);
retry.onclick = () => {
  void edits.retry().then(selectSavedTile);
};
failSave.onclick = () => {
  storage.failNextSave();
  failSave.textContent = 'Next save will fail';
};
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    previous?.dispose(); // Abort timers synchronously during final navigation.
    void app?.dispose().catch(showError);
    edits.dispose();
  }
});

async function start() {
  far.disabled =
    back.disabled =
    restart.disabled =
    failChunk.disabled =
    retryChunks.disabled =
    closeA.disabled =
    closeB.disabled =
    overlap.disabled =
      true;
  await app?.dispose();
  if (previous)
    cleanup.textContent = `Previous stream: ${previous.stats.owners} owners, ${previous.stats.retained} chunks, ${previous.stats.pending} pending, ${previous.stats.running} job slots · edits preserved: ${edits.stats.cells}`;
  const application = new Rocket({ performance: true, onError: showError });
  app = application;
  const stream = new ChunkStream(edits, 64, 1, {
    load: source.load,
    maxJobs: 4,
  });
  previous = stream;
  const input = application.use(Input);
  const entries: TerrainView[] = [];
  const scene = application.scene(
    new Scene2D({
      update(dt) {
        for (const entry of entries) {
          if (entry.view.disposed) continue;
          const dx =
            Number(entry.controls.down('right')) -
            Number(entry.controls.down('left'));
          const dy =
            Number(entry.controls.down('down')) -
            Number(entry.controls.down('up'));
          const length = Math.hypot(dx, dy) || 1;
          entry.view.camera.x = Math.max(
            -500000,
            Math.min(500000, entry.view.camera.x + (dx * 300 * dt) / length),
          );
          entry.view.camera.y = Math.max(
            -500000,
            Math.min(500000, entry.view.camera.y + (dy * 300 * dt) / length),
          );
          entry.demand.set(bounds(entry.view));
        }
        stream.advance();
        for (const entry of entries) {
          if (entry.view.disposed) continue;
          const pointer = entry.binding.pointer;
          if (pointer.pressed && pointer.world) {
            selected = {
              x: Math.floor(pointer.world.x / tileSize),
              y: Math.floor(pointer.world.y / tileSize),
            };
            stream.cycle(selected);
          }
        }
      },
      draw(ctx) {
        const entry = entries.find(
          (entry) => !entry.view.disposed && entry.view.canvas === ctx.canvas,
        );
        if (!entry) return;
        const area = bounds(entry.view);
        for (let y = area.minY; y < area.maxY; y++)
          for (let x = area.minX; x < area.maxX; x++) {
            const tile = stream.read({ x, y });
            ctx.fillStyle =
              tile.state === 'ready'
                ? (['#253b50', '#80dbbd', '#f1b973'][tile.value] ?? '#253b50')
                : tile.state === 'failed'
                  ? '#6c2f45'
                  : '#192534';
            ctx.fillRect(
              x * tileSize + 1,
              y * tileSize + 1,
              tileSize - 2,
              tileSize - 2,
            );
          }
        ctx.strokeStyle = '#74859d';
        ctx.lineWidth = 1;
        ctx.font = '12px monospace';
        ctx.fillStyle = '#e5edf6';
        const size = chunkSize * tileSize;
        for (
          let y = Math.floor(area.minY / chunkSize);
          y <= Math.floor((area.maxY - 1) / chunkSize);
          y++
        )
          for (
            let x = Math.floor(area.minX / chunkSize);
            x <= Math.floor((area.maxX - 1) / chunkSize);
            x++
          ) {
            const tile = stream.read({ x: x * chunkSize, y: y * chunkSize });
            ctx.strokeRect(x * size, y * size, size, size);
            ctx.fillText(
              `chunk (${x},${y}) ${tile.state}`,
              x * size + 6,
              y * size + 18,
            );
          }
        ctx.strokeStyle = '#eb8fba';
        ctx.beginPath();
        ctx.moveTo(0, area.minY * tileSize);
        ctx.lineTo(0, area.maxY * tileSize);
        ctx.moveTo(area.minX * tileSize, 0);
        ctx.lineTo(area.maxX * tileSize, 0);
        ctx.stroke();
        if (selected) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.strokeRect(
            selected.x * tileSize + 2,
            selected.y * tileSize + 2,
            tileSize - 4,
            tileSize - 4,
          );
        }
      },
    }),
  );
  scene.own(stream);
  for (const [target, label, x, y] of [
    ['#stream-world', 'A', -320, -180],
    ['#stream-second', 'B', 3072, -3072],
  ] as const) {
    const view = application.view({
      target,
      scene,
      width: 640,
      height: 360,
      overlay(ctx) {
        ctx.fillStyle = '#101b2be6';
        ctx.fillRect(8, 8, 390, 28);
        ctx.fillStyle = '#c6d5e6';
        ctx.font = '12px monospace';
        ctx.fillText(
          `View ${label} · WASD pan here · click edits · ${application.performance?.fps?.toFixed(0) ?? '…'} FPS`,
          16,
          27,
        );
      },
    });
    view.camera.x = x;
    view.camera.y = y;
    view.canvas.setAttribute(
      'aria-label',
      `Terrain view ${label}: WASD or arrows pan this view, click a ready tile to edit`,
    );
    const demand = view.own(stream.createDemand());
    const controls = view.own(
      input.scope(scene, {
        left: ['ArrowLeft', 'KeyA'],
        right: ['ArrowRight', 'KeyD'],
        up: ['ArrowUp', 'KeyW'],
        down: ['ArrowDown', 'KeyS'],
      }),
    );
    entries.push({
      label,
      view,
      demand,
      controls,
      binding: controls.bind(view),
    });
  }
  function bounds(view: View): TileBounds {
    return {
      minX: Math.floor(view.camera.x / tileSize),
      minY: Math.floor(view.camera.y / tileSize),
      maxX: Math.ceil((view.camera.x + view.width) / tileSize),
      maxY: Math.ceil((view.camera.y + view.height) / tileSize),
    };
  }
  function report() {
    const stats = stream.stats;
    const saved = edits.stats;
    retryChunks.disabled = !stats.failed;
    failChunk.textContent = source.failureArmed
      ? 'Next chunk will fail'
      : 'Fail next chunk';
    const loading = `${source.delayMs} ms base delay · ${source.varied ? 'varied completion order' : 'uniform delays'} · ${stats.running}/${stats.maxJobs} job slots · ${stats.queued} queued · ${stats.failed} failed${stats.error ? `: ${stats.error}` : ''}`;
    if (chunkStatus.textContent !== loading) chunkStatus.textContent = loading;
    const persistence = saved.loadError
      ? `Load failed: ${saved.loadError}. Retry storage; terrain remains pending.`
      : saved.saveError
        ? `Save failed: ${saved.saveError}. ${saved.unsaved} unsaved changes remain in memory; retry before reload.`
        : saved.phase === 'loading'
          ? 'Loading saved edits; terrain remains pending…'
          : saved.saving || saved.unsaved
            ? `Saving to IndexedDB… ${saved.unsaved} uncommitted changes`
            : `IndexedDB committed · ${saved.cells} overrides restored or saved`;
    if (storageStatus.textContent !== persistence)
      storageStatus.textContent = persistence;
    retry.disabled =
      saved.saving || (!saved.loadError && !saved.saveError && !saved.unsaved);
    failSave.disabled = !edits.ready || saved.saving || !!saved.saveError;
    if (saved.saveError) failSave.textContent = 'Fail next save';
    const selection = selected ? stream.read(selected) : null;
    const label = selected
      ? `tile (${selected.x}, ${selected.y}) ${selection?.state === 'ready' ? `= ${selection.value}` : selection?.state}`
      : 'Click a tile to edit';
    const text = `${label} · ${edits.stats.cells} overrides · ${stats.ready}/${stats.retained} ready`;
    if (status.textContent !== text) status.textContent = text;
    const aria = `Chunk diagnostics: ${stats.owners} demand owners, ${stats.retained} retained, ${stats.pending} pending, ${stats.evictions} evictions, ${edits.stats.cells} overrides, ${saved.unsaved} unsaved changes, storage ${saved.phase}, ${stats.running} job slots, ${stats.failed} failed chunks, ${stats.discarded} discarded results${saved.saveError ? ', save failed' : ''}`;
    if (diagnostic.canvas.getAttribute('aria-label') !== aria)
      diagnostic.canvas.setAttribute('aria-label', aria);

    far.disabled =
      back.disabled =
      closeA.disabled =
        !!entries[0]?.view.disposed;
    closeB.disabled = !!entries[1]?.view.disposed;
    overlap.disabled = entries.some((entry) => entry.view.disposed);
  }
  const diagnostic = application.view({
    target: '#stream-diagnostics',
    width: 640,
    height: 540,
    scene: application.scene({
      update() {
        report();
      },
      draw(ctx) {
        const stats = stream.stats,
          saved = edits.stats;
        const current = selected ? stream.read(selected) : null;
        ctx.fillStyle = '#c6d5e6';
        ctx.font = '14px monospace';
        for (const [index, text] of [
          `Demand owners: ${stats.owners} · chunks: ${stats.retained}/${stats.capacity}`,
          `Ready: ${stats.ready} · pending: ${stats.pending} · failed: ${stats.failed}`,
          `Job slots: ${stats.running}/${stats.maxJobs} · queued: ${stats.queued}`,
          `Results buffered: ${stats.buffered} · discarded: ${stats.discarded}`,
          `Last result: ${stats.lastResult}`,
          `Visible: ${stats.visibleReady}/${stats.visible} ready`,
          `Generated: ${stats.generations} · evicted: ${stats.evictions}`,
          `Cancelled: ${stats.cancelled} · tile bytes: ${stats.tileBytes}`,
          `Memory edits: ${saved.cells} tiles / ${saved.chunks} chunks`,
          `Storage: ${saved.phase} · ${saved.saving ? 'saving' : 'idle'}`,
          `Uncommitted changes: ${saved.unsaved}`,
          `Error: ${(saved.loadError ?? saved.saveError ?? 'none').slice(0, 60)}`,
          `Generator: ${generatorVersion}`,
          ...entries.map((entry) =>
            entry.view.disposed
              ? `View ${entry.label}: closed / demand released`
              : `View ${entry.label} chunk: (${Math.floor(entry.view.camera.x / (chunkSize * tileSize))},${Math.floor(entry.view.camera.y / (chunkSize * tileSize))})`,
          ),
          selected
            ? `Selection (${selected.x},${selected.y}): ${current?.state === 'ready' ? `ready = ${current.value}` : current?.state}`
            : 'Selection: none',
          'One update controller · read-only diagnostic canvas',
        ].entries())
          ctx.fillText(text, 16, 28 + index * 29);
      },
    }),
  });
  failChunk.onclick = () => {
    source.failNext();
  };
  retryChunks.onclick = () => {
    stream.retryFailures();
  };
  const a = entries[0],
    b = entries[1];
  if (!a || !b) throw new Error('Missing terrain views');
  closeA.onclick = () => {
    a.view.dispose();
    report();
  };
  closeB.onclick = () => {
    b.view.dispose();
    report();
  };
  overlap.textContent = 'Overlap views';
  overlap.onclick = () => {
    const same =
      a.view.camera.x === b.view.camera.x &&
      a.view.camera.y === b.view.camera.y;
    b.view.camera.x = same ? 3072 : a.view.camera.x;
    b.view.camera.y = same ? -3072 : a.view.camera.y;
    overlap.textContent = same ? 'Overlap views' : 'Separate views';
  };
  far.onclick = () => {
    a.view.camera.x = 3072;
    a.view.camera.y = -3072;
  };
  back.onclick = () => {
    a.view.camera.x = (selected?.x ?? 0) * tileSize - 320;
    a.view.camera.y = (selected?.y ?? 0) * tileSize - 180;
  };
  restart.onclick = () => {
    void start().catch(showError);
  };
  await application.start();
  far.disabled =
    back.disabled =
    restart.disabled =
    failChunk.disabled =
    closeA.disabled =
    closeB.disabled =
    overlap.disabled =
      false;
}
function showError(error: unknown) {
  status.textContent = String(error);
  restart.disabled = false;
}
await start().catch(showError);
