import { Rocket, Scene2D } from '../../src/index.js';
import type { View } from '../../src/View.js';
import { chunkSize, type DemandHandle } from '../streaming/ChunkStream.js';
import { DelayedChunks } from '../streaming/DelayedChunks.js';
import {
  createWorkplace,
  restoreWorkplace,
  workplaceTerrain as base,
  type WorkplaceCheckpoint,
} from './WorkplaceCheckpoint.js';
import { FactoryStorage } from './FactoryStorage.js';

const storage = new FactoryStorage<WorkplaceCheckpoint>(
  globalThis.indexedDB,
  'workplace-worker-v1',
);
const checkpointStatus =
  document.querySelector<HTMLParagraphElement>('#checkpoint-status')!;
document.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
  b.disabled = b.id !== 'retry-start';
});
let pageClosed = false;
window.addEventListener(
  'pagehide',
  () => {
    pageClosed = true;
    storage.dispose();
  },
  { once: true },
);
async function boot(): Promise<void> {
  const stored = await storage.read();
  if (pageClosed) return;
  const source = new DelayedChunks((chunk) => {
    const values = new Uint8Array(chunkSize * chunkSize);
    for (let y = 0; y < chunkSize; y++)
      for (let x = 0; x < chunkSize; x++)
        values[y * chunkSize + x] = base({
          x: chunk.x * chunkSize + x,
          y: chunk.y * chunkSize + y,
        });
    return values;
  });
  source.delayMs = 150;
  const model =
    stored === undefined
      ? createWorkplace(undefined, undefined, undefined, source.load)
      : restoreWorkplace(stored, source.load);
  const { factory, edits, stream, walker, operator, smelter, press, places } =
    model;
  document.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.disabled = false;
  });
  checkpointStatus.textContent =
    stored === undefined
      ? 'No checkpoint yet. Save explicitly; reload restores only the last successful save.'
      : `Restored tick ${factory.read().summary.tick}, worker (${operator.position.x.toFixed(1)}, ${operator.position.y.toFixed(1)}). No offline time applied; attendance waits for ready terrain.`;
  const output = document.querySelector<HTMLOutputElement>('output')!;
  let state = factory.read(),
    gateClosed = edits.get({ x: 12, y: -8 }) === 1,
    blockedEntrance = [...places].find(
      ([, p]) =>
        edits.get({ x: Math.floor(p.x / 32), y: Math.floor(p.y / 32) }) === 1,
    )?.[0],
    error = '';
  const names = (id: string | null) =>
    id === smelter ? 'Smelter' : id === press ? 'Press' : 'none';
  const app = new Rocket({
    fixed: {},
    onError(value) {
      error = String(value);
    },
  });
  let map: View | undefined, diagnostic: View | undefined;
  const scene = app.scene(
    new Scene2D({
      fixedUpdate(dt) {
        // Readiness and edits become authoritative before crediting any production.
        stream.advance(4);
        operator.reconcile();
        factory.advance(dt);
        operator.update(dt);
      },
      update() {
        state = factory.read();
        const s = operator.snapshot(),
          status = s.status;
        const message =
          error ||
          (s.present
            ? `Working at ${names(s.present)}. Attendance: 1 on site.`
            : status === 'moving'
              ? `Walking to ${names(s.target)}. Attendance: 0; no remote work.`
              : status === 'blocked'
                ? `Waiting for terrain or a route (${s.reason}). Attendance: 0.`
                : status === 'unreachable'
                  ? 'No route. Open the passage or restore the entrance, then assign again. Attendance: 0.'
                  : status === 'arrived'
                    ? 'Work paused: the entrance is blocked or unknown. Attendance: 0.'
                    : 'Off duty. Assign the Smelter first to produce alloy, then the Press to produce parts.');
        if (output.textContent !== message) output.textContent = message;
        diagnostic?.canvas.setAttribute(
          'aria-label',
          state.facilities
            .map(
              (f) =>
                `${f.definitionId}: ${f.attendance.operator ?? 0} operator, ${f.jobs[0]?.state}, ${f.jobs[0]?.batchesCompleted ?? 0} batches`,
            )
            .join('; '),
        );
      },
    }),
    { keepAlive: true },
  );
  scene.own(model);

  function addMap(): View {
    const demand: DemandHandle = stream.createDemand();
    let view: View;
    try {
      demand.set({ minX: -3, minY: -8, maxX: 30, maxY: 8 });
      view = app.view({
        target: '#journey-world',
        scene,
        width: 1024,
        height: 512,
        overlay(ctx) {
          const origin = this.worldToScreen({ x: 0, y: 0 });
          ctx.save();
          ctx.translate(origin.x, origin.y);
          for (let y = -8; y < 8; y++)
            for (let x = -3; x < 30; x++) {
              const tile = stream.read({ x, y });
              ctx.fillStyle =
                tile.state !== 'ready'
                  ? tile.state === 'failed'
                    ? '#853e50'
                    : '#454b63'
                  : tile.value === 1
                    ? '#9cabb7'
                    : tile.value === 2
                      ? '#695638'
                      : '#294a41';
              ctx.fillRect(x * 32, y * 32, 31, 31);
            }
          ctx.font = '16px monospace';
          ctx.fillStyle = '#e5edf6';
          ctx.fillText('Upper passage', 352, -176);
          ctx.fillText('World edge — no route below', 280, 244);
          for (const [id, p] of places) {
            ctx.fillStyle = '#ffd884';
            ctx.strokeStyle = '#ffd884';
            ctx.strokeRect(p.x - 8, p.y - 8, 16, 16);
            ctx.fillText(`${names(id)} entrance`, p.x - 75, p.y - 20);
          }
          const s = operator.snapshot().journey;
          ctx.strokeStyle = '#ffd884';
          ctx.beginPath();
          ctx.moveTo(operator.position.x, operator.position.y);
          s?.route.slice(s.nextWaypoint).forEach((p) => ctx.lineTo(p.x, p.y));
          ctx.stroke();
          ctx.fillStyle = '#a4f0cc';
          ctx.beginPath();
          ctx.arc(operator.position.x, operator.position.y, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        },
      });
    } catch (value) {
      demand.dispose();
      throw value;
    }
    view.camera.x = -80;
    view.camera.y = -256;
    view.canvas.setAttribute(
      'aria-label',
      'Streamed workplace journey, Smelter and Press entrances, upper passage and world boundary',
    );
    view.own(demand);
    return view;
  }
  function addDiagnostic(): View {
    return app.view({
      target: '#journey-diagnostics',
      scene,
      width: 640,
      height: 512,
      overlay(ctx) {
        ctx.fillStyle = '#101b29';
        ctx.fillRect(0, 0, 640, 512);
        ctx.font = '16px monospace';
        ctx.fillStyle = '#e5edf6';
        ctx.fillText('Workshop owns production and goods.', 20, 32);
        for (const [i, f] of state.facilities.entries()) {
          const y = 80 + i * 88,
            job = f.jobs[0]!;
          ctx.fillText(`${f.definitionId}: ${job.state}`, 20, y);
          ctx.fillText(
            `On site: ${f.attendance.operator ?? 0} · batches: ${job.batchesCompleted}`,
            20,
            y + 26,
          );
          ctx.fillText(
            `Progress: ${(job.progress * 100).toFixed(0)}%`,
            20,
            y + 52,
          );
        }
        const s = operator.snapshot(),
          w = walker.snapshot();
        ctx.fillText(
          `Assigned: ${names(s.target)} · present: ${names(s.present)}`,
          20,
          370,
        );
        ctx.fillText(
          `Actor (${operator.position.x.toFixed(1)}, ${operator.position.y.toFixed(1)}) · ${s.status ?? 'idle'}`,
          20,
          400,
        );
        ctx.fillText(
          `${stream.stats.owners} demand owners · ${stream.stats.retained}/64 chunks · ${stream.stats.running}/4 jobs`,
          20,
          430,
        );
        ctx.fillText(
          `Route demand: ${w.routeDemand ? 'active' : 'released'} · views: ${Number(!!map) + Number(!!diagnostic)}`,
          20,
          460,
        );
        ctx.fillText(
          `Tick ${state.summary.tick} · ${state.completed} parts · mine is autonomous`,
          20,
          490,
        );
      },
    });
  }
  map = addMap();
  diagnostic = addDiagnostic();
  document.querySelector<HTMLButtonElement>('#gate')!.textContent = gateClosed
    ? 'Open upper passage'
    : 'Seal upper passage';
  document.querySelector<HTMLButtonElement>('#entrance')!.textContent =
    blockedEntrance
      ? `Restore ${names(blockedEntrance)} entrance`
      : 'Block assigned entrance';
  const listeners = new AbortController();
  scene.own(() => {
    listeners.abort();
  });
  function button(id: string, action: (b: HTMLButtonElement) => void): void {
    const b = document.querySelector<HTMLButtonElement>(id)!;
    b.addEventListener(
      'click',
      () => {
        try {
          error = '';
          action(b);
        } catch (value) {
          error = String(value);
        }
      },
      { signal: listeners.signal },
    );
  }
  button('#assign-smelter', () => {
    operator.assign(smelter);
  });
  button('#assign-press', () => {
    operator.assign(press);
  });
  button('#release', () => {
    operator.cancel();
  });
  button('#gate', (b) => {
    for (let y = -8; y < -3; y++)
      for (const x of [12, 13])
        if (stream.read({ x, y }).state !== 'ready')
          throw new Error('Wait for passage terrain to load.');
    gateClosed = !gateClosed;
    for (let y = -8; y < -3; y++)
      for (const x of [12, 13]) stream.set({ x, y }, gateClosed ? 1 : 0);
    operator.reconcile();
    b.textContent = gateClosed ? 'Open upper passage' : 'Seal upper passage';
  });
  button('#entrance', (b) => {
    const id = blockedEntrance ?? operator.snapshot().target;
    if (!id)
      throw new Error('Assign a workplace before blocking its entrance.');
    const p = places.get(id)!;
    if (
      !stream.set(
        { x: Math.floor(p.x / 32), y: Math.floor(p.y / 32) },
        blockedEntrance ? 0 : 1,
      )
    )
      throw new Error('Wait for workplace terrain to load.');
    blockedEntrance = blockedEntrance ? undefined : id;
    operator.reconcile();
    b.textContent = blockedEntrance
      ? `Restore ${names(id)} entrance`
      : 'Block assigned entrance';
  });
  button('#fail', () => {
    source.failNext();
  });
  button('#retry-loads', () => {
    stream.retryFailures();
  });
  button('#views', (b) => {
    if (map || diagnostic) {
      map?.dispose();
      diagnostic?.dispose();
      map = undefined;
      diagnostic = undefined;
      b.textContent = 'Reopen both views';
    } else {
      app.stop();
      map = addMap();
      diagnostic = addDiagnostic();
      void app.start().catch((value) => {
        error = String(value);
      });
      b.textContent = 'Close both views';
    }
  });
  const saveButton = document.querySelector<HTMLButtonElement>('#save-worker')!;
  saveButton.addEventListener(
    'click',
    () => {
      saveButton.disabled = true;
      checkpointStatus.textContent = 'Saving checkpoint…';
      void (async () => {
        const snapshot = model.save();
        await storage.write(snapshot);
        checkpointStatus.textContent = `Saved tick ${snapshot.factory.simulation.tick}, worker (${snapshot.worker.position.x.toFixed(1)}, ${snapshot.worker.position.y.toFixed(1)}). Reload to restore this checkpoint.`;
      })()
        .catch((value) => {
          checkpointStatus.textContent = `Save failed: ${String(value)}. Previous checkpoint kept; live state remains. Retry Save.`;
        })
        .finally(() => {
          saveButton.disabled = false;
        });
    },
    { signal: listeners.signal },
  );
  button('#fail-save', () => {
    storage.failNextWrite();
    checkpointStatus.textContent =
      'Next Save will fail; the previous checkpoint will remain intact.';
  });
  window.addEventListener(
    'pagehide',
    () => {
      void app.dispose();
    },
    { once: true },
  );
  try {
    await app.start();
  } catch (value) {
    await app.dispose();
    throw value;
  }
}
void boot().catch((value) => {
  document.querySelector('output')!.textContent =
    'Simulation stopped: checkpoint loading failed.';
  checkpointStatus.textContent = `Load/start failed: ${String(value)}. Saved data kept; simulation did not start. Retry loading.`;
  document.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.disabled = b.id !== 'retry-start';
  });
});
document.querySelector('#retry-start')!.addEventListener('click', () => {
  location.reload();
});
