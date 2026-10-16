import {
  StreamedClassicCache,
  classicPixels,
  classicDemand,
} from './StreamedClassicCache.js';
import { Rocket, Scene2D, Input, Assets } from '../../src/index.js';
import type { WorkerChunks } from '../workers/WorkerChunks.js';
import type { View } from '../../src/View.js';
import type { Cell } from '../TileBoard.js';
import { TerrainBenchmark, benchmarkStops } from './TerrainBenchmark.js';
import { generateTerrain } from '../workers/task.js';
import { ChunkStream, MemoryEdits } from '../streaming/ChunkStream.js';
import type { DemandHandle, TileBounds } from '../streaming/ChunkStream.js';
import { PersistentEdits } from '../streaming/PersistentEdits.js';
import { IndexedDbEdits } from '../streaming/IndexedDbEdits.js';
import { DelayedChunks } from '../streaming/DelayedChunks.js';
import { TerrainGenerator, biomeNames } from './TerrainGenerator.js';
import { TerrainRasterCache, terrainPixels } from './TerrainRasterCache.js';
function element<T extends Element>(selector: string, kind: { new (): T }): T {
  const value = document.querySelector(selector);
  if (!(value instanceof kind)) throw new Error(`Missing ${selector}`);
  return value;
}
const seed = element('#world-seed', HTMLInputElement),
  scale = element('#world-scale', HTMLInputElement);
const apply = element('#world-apply', HTMLButtonElement),
  reset = element('#world-reset', HTMLButtonElement);
const far = element('#world-far', HTMLButtonElement),
  back = element('#world-back', HTMLButtonElement);
const closeClassic = element('#world-close-classic', HTMLButtonElement);
const close = element('#world-close', HTMLButtonElement),
  retry = element('#world-retry', HTMLButtonElement);
const fault = element('#world-fail', HTMLButtonElement),
  delay = element('#world-delay', HTMLInputElement);
const status = element('#world-status', HTMLOutputElement),
  details = element('#world-details', HTMLParagraphElement);
const cleanup = element('#world-cleanup', HTMLParagraphElement);
const workload = element('#benchmark-workload', HTMLSelectElement),
  run = element('#benchmark-run', HTMLButtonElement),
  cancel = element('#benchmark-cancel', HTMLButtonElement),
  results = element('#benchmark-results', HTMLPreElement),
  runJson = element('#benchmark-json', HTMLPreElement);
let benchmark: TerrainBenchmark | undefined;
let starting = false;
let renderBenchmark = () => {};
const query = new URLSearchParams(location.search);
const passesQuery = Number(query.get('passes') ?? 1);
if (![1, 16, 64, 256, 1024].includes(passesQuery))
  throw new Error('Unsupported generation passes');
workload.value = String(passesQuery);
const generator = new TerrainGenerator({
  seed: Number(query.get('seed') ?? 42),
  scale: Number(query.get('scale') ?? 96),
});
seed.value = String(generator.config.seed);
scale.value = String(generator.config.scale);
const storage = new IndexedDbEdits(undefined, {
  key: `procedural:${generator.identity}`,
  identity: generator.identity,
  valueCount: 6,
});
const edits = new PersistentEdits(
  storage,
  (cell) => generator.sample(cell.x, cell.y).biome,
  6,
);
const workerMode = document.body.dataset['workers'] === 'true';
let workerSource: WorkerChunks | undefined;
let mainCount = 0,
  mainMs = 0,
  mainPeak = 0;
let source = new DelayedChunks(
  (cell) =>
    generateTerrain({
      ...cell,
      ...generator.config,
      identity: generator.identity,
      passes: 1,
    }).bytes,
);
source.delayMs = 0;
delay.oninput = () => {
  source.delayMs = delay.valueAsNumber;
};
let selected: Cell | null = null,
  app: Rocket | undefined,
  previous: ChunkStream | undefined,
  previousCache: TerrainRasterCache | undefined,
  previousClassic: StreamedClassicCache | undefined;
void edits.load().then(() => {
  if (!benchmark) selected = edits.snapshot()[0] ?? null;
});
apply.onclick = () => {
  try {
    if (edits.stats.unsaved || edits.stats.saving)
      throw new Error('Wait for committed saves before changing worlds');
    const next = new TerrainGenerator({
      seed: seed.valueAsNumber,
      scale: scale.valueAsNumber,
    });
    location.assign(
      `./${workerMode ? 'terrain-workers' : 'terrain-streaming'}.html?seed=${next.config.seed}&scale=${next.config.scale}&passes=${workload.value}`,
    );
  } catch (error) {
    status.textContent = String(error);
  }
};
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    previous?.dispose();
    previousCache?.dispose();
    previousClassic?.dispose();
    edits.dispose();
    void app?.dispose().catch(showError);
  }
});
function locks() {
  const locked = starting || !!benchmark?.active;
  for (const control of [
    run,
    workload,
    seed,
    scale,
    delay,
    far,
    back,
    close,
    closeClassic,
    reset,
    fault,
    retry,
    apply,
  ]) {
    if (locked) control.disabled = true;
    else if (
      ![close, closeClassic, retry, apply].includes(
        control as HTMLButtonElement,
      )
    )
      control.disabled = false;
  }
  cancel.disabled = starting || !benchmark?.active;
}
run.onclick = () => {
  if (!document.hidden) void start(true).catch(showError);
};
cancel.onclick = () => {
  benchmark?.invalidate('Cancelled by user');
  renderBenchmark();
  locks();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    benchmark?.invalidate('Tab hidden during run');
    renderBenchmark();
    app?.stop();
  } else if (!starting) void app?.start().catch(showError);
});
async function start(measure = false) {
  if (starting) return;
  starting = true;
  locks();
  try {
    await recreate(measure);
  } finally {
    starting = false;
    locks();
  }
}
async function recreate(measure = false) {
  benchmark?.invalidate('Stream recreated');
  const passes = Number(workload.value);
  if (![1, 16, 64, 256, 1024].includes(passes))
    throw new Error('Unsupported generation passes');
  if (measure) {
    delay.value = '0';
    selected = null;
  }
  benchmark = measure ? new TerrainBenchmark() : undefined;
  const activeEdits = measure
    ? new MemoryEdits((c) => generator.sample(c.x, c.y).biome, 6)
    : edits;
  reset.disabled = close.disabled = closeClassic.disabled = true;
  await app?.dispose();
  const previousPool = workerSource?.stats.pool;
  if (previous)
    cleanup.textContent = `Previous stream: ${previous.stats.owners} owners, ${previous.stats.retained} chunks, ${previous.stats.running} jobs · artwork: ${previousCache?.stats.regions ?? 0} regions · classic: ${previousClassic?.stats.regions ?? 0} regions / ${previousClassic?.stats.records ?? 0} records · pool ${previousPool?.liveWorkers ?? 0} workers / ${previousPool?.occupied ?? 0} occupied / ${previousPool?.queued ?? 0} queued`;
  workerSource = undefined;
  if (workerMode) {
    const { WorkerChunks } = await import('../workers/WorkerChunks.js');
    workerSource = new WorkerChunks(generator, undefined, passes);
  }
  mainCount = mainMs = mainPeak = 0;
  const activeWorker = workerSource;
  source = new DelayedChunks(
    activeWorker
      ? activeWorker.load
      : (cell) => {
          const start = performance.now(),
            bytes = generateTerrain({
              ...cell,
              ...generator.config,
              identity: generator.identity,
              passes,
            }).bytes;
          const ms = performance.now() - start;
          mainCount++;
          mainMs += ms;
          mainPeak = Math.max(mainPeak, ms);
          return bytes;
        },
  );
  source.delayMs = delay.valueAsNumber;
  const application = new Rocket({ performance: true, onError: showError });
  app = application;
  const stream = new ChunkStream(activeEdits, 240, 1, {
    load: source.load,
    maxJobs: 4,
  });
  previous = stream;
  const cache = new TerrainRasterCache(stream, generator);
  previousCache = cache;
  const input = application.use(Input);
  const assets = application.use(Assets);
  let classicCache: StreamedClassicCache | undefined;
  const entries: {
    view: View;
    demand: DemandHandle;
    mode: 'biome' | 'height' | 'classic';
  }[] = [];
  const scene = application.scene(
    new Scene2D({
      async prepare({ signal }) {
        await activeWorker?.ready;
        signal.throwIfAborted();
        const view = entries.find((entry) => entry.mode === 'classic')?.view;
        if (!view) throw new Error('Missing classic view');
        const terrain = view.own(
          await assets.acquireImage('./examples/terrain/assets/terrain.png', {
            signal,
          }),
        );
        const decorations = view.own(
          await assets.acquireImage(
            './examples/terrain/assets/decorations.png',
            { signal },
          ),
        );
        classicCache = view.own(
          new StreamedClassicCache(
            stream,
            generator,
            terrain.image,
            decorations.image,
          ),
        );
        previousClassic = classicCache;
      },
      update(dt) {
        const clock = performance.now();
        const active = benchmark?.active ?? false;
        const stop = benchmark?.advance(clock);
        if (stop !== null && stop !== undefined) {
          const position = benchmarkStops[stop];
          if (position)
            for (const entry of entries) {
              entry.view.camera.x =
                position.x * pixels(entry.view) - entry.view.width / 2;
              entry.view.camera.y =
                position.y * pixels(entry.view) - entry.view.height / 2;
            }
        }
        const dx = active
          ? 0
          : Number(controls.down('right')) - Number(controls.down('left'));
        const dy = active
          ? 0
          : Number(controls.down('down')) - Number(controls.down('up'));
        const length = Math.hypot(dx, dy) || 1;
        for (const entry of entries) {
          if (entry.view.disposed) continue;
          entry.view.camera.x = Math.max(
            -99800 * pixels(entry.view),
            Math.min(
              99800 * pixels(entry.view),
              entry.view.camera.x +
                (dx * 32 * pixels(entry.view) * dt) / length,
            ),
          );
          entry.view.camera.y = Math.max(
            -99800 * pixels(entry.view),
            Math.min(
              99800 * pixels(entry.view),
              entry.view.camera.y +
                (dy * 32 * pixels(entry.view) * dt) / length,
            ),
          );
        }
        const demands = entries
          .filter((entry) => !entry.view.disposed)
          .map((entry) => ({
            handle: entry.demand,
            bounds:
              entry.mode === 'classic'
                ? classicDemand(bounds(entry.view))
                : bounds(entry.view),
          }));
        stream.setDemands(demands);
        if (stop !== null && stop !== undefined)
          benchmark?.demand(demands.map((d) => d.bounds));
        stream.advance(2);
        cache.prune();
        benchmark?.observe(performance.now(), (cell) => stream.read(cell));
        renderBenchmark();
        locks();
        if (!starting && !benchmark?.active) {
          close.disabled = entries[1]?.view.disposed ?? true;
          closeClassic.disabled =
            entries.find((e) => e.mode === 'classic')?.view.disposed ?? true;
        }
        for (const binding of controls.views) {
          if (!benchmark && binding.pointer.pressed && binding.pointer.world) {
            selected = {
              x: Math.floor(
                binding.pointer.world.x /
                  pixels(
                    entries.find((entry) => entry.view === binding.view)!.view,
                  ),
              ),
              y: Math.floor(
                binding.pointer.world.y /
                  pixels(
                    entries.find((entry) => entry.view === binding.view)!.view,
                  ),
              ),
            };
            stream.cycle(selected);
          }
        }
        const classicView = entries.find(
          (entry) => entry.mode === 'classic' && !entry.view.disposed,
        )?.view;
        if (classicView) classicCache?.prepare(bounds(classicView));
        const stats = stream.stats,
          saved = edits.stats,
          art = cache.stats;
        const current = selected ? stream.read(selected) : null;
        const selection = selected
          ? `(${selected.x},${selected.y}) ${current?.state === 'ready' ? biomeNames[current.value] : current?.state}`
          : 'click a ready tile';
        const text = `Selection ${selection} · ${activeEdits.stats.cells} active overrides${benchmark ? ' (saved edits excluded)' : ''} · ${stats.ready}/${stats.retained} ready`;
        if (status.textContent !== text) status.textContent = text;
        const state = `${generator.identity}\n${stats.owners} view${stats.owners === 1 ? '' : 's'} · ${stats.retained}/${stats.capacity} chunks · ${stats.running}/4 jobs · ${stats.queued} queued · ${stats.failed} failed\n${stats.evictions} evictions · ${stats.discarded} discarded results · ${art.regions} shared artwork regions (${(art.pixelBytes / 1048576).toFixed(2)} MiB RGBA) · ${application.performance?.fps?.toFixed(0) ?? '…'} FPS\nClassic: ${classicCache?.stats.regions ?? 0} artwork regions · ${classicCache?.stats.records ?? 0} object records · ${classicCache?.stats.builds ?? 0} builds · ${classicCache?.stats.lastMs.toFixed(2) ?? '…'} ms last / ${classicCache?.stats.peakMs.toFixed(2) ?? '…'} ms peak per region\nStorage: ${saved.phase}${saved.saving ? ' / saving' : ''} · ${saved.unsaved} uncommitted changes · ${saved.cells} saved overrides${benchmark ? ' (excluded from benchmark)' : ''}\nError: ${saved.loadError ?? saved.saveError ?? stats.error ?? 'none'}`;
        const pool = activeWorker?.stats;
        const perf = application.performance;
        const diagnostics =
          state +
          `\nPasses: ${passes} · Backend: ${workerMode ? '2 native workers' : 'main thread'} · generation ${pool?.computeMs.toFixed(3) ?? (mainCount ? mainMs / mainCount : 0).toFixed(3)} ms mean · ${pool ? `round trip ${pool.roundTripMs.toFixed(2)} ms / peak ${pool.peakMs.toFixed(2)}` : `peak ${mainPeak.toFixed(3)} ms`}\nFrame ${perf?.frameMs?.toFixed(2) ?? '…'} ms / max ${perf?.maxFrameMs?.toFixed(2) ?? '…'} ms (0.5s window) · update ${perf?.updateMs?.toFixed(2) ?? '…'} ms · render ${perf?.renderMs?.toFixed(2) ?? '…'} ms\n${pool ? `Pool: ${pool.pool.liveWorkers} workers · ${pool.pool.occupied} physical occupied · ${pool.pool.cancelledOccupied} cancelled occupied · ${pool.pool.queued}/4 queued · ${pool.pool.cancelled} cancellations · ${pool.pool.slots.map((s) => `${s.index}:${s.state}`).join(' / ')}` : 'Same 8×8 chunks, 240 retention, four stream jobs, artwork and saved edits as worker page.'}`;
        const timings = pool?.pool.timings;
        const summary = (value: number | null | undefined) =>
          value == null ? 'no samples' : value.toFixed(3) + ' ms';
        const extended =
          diagnostics +
          (pool && timings
            ? `\nDeclared cell-pass reservations ${pool.pool.admission.reservedCost}/${pool.pool.admission.maxCost} · occupied ${pool.pool.admission.occupiedCost} · cancelled occupied ${pool.pool.admission.cancelledOccupiedCost} · queued ${pool.pool.admission.queuedCost} (not heap bytes)\nHost queue wait ${summary(timings.queueWaitMs.meanMs)} · active validated response ${summary(timings.physical.active.result.durationMs.meanMs)} · cancelled physical response ${summary(timings.physical.cancelled.result.durationMs.meanMs)}\nPool task-reported compute ${summary(timings.reportedComputeMs.meanMs)} · censored deadline/disposed attempts ${timings.physical.active.deadline.events.value + timings.physical.cancelled.deadline.events.value}/${timings.physical.active.disposed.events.value + timings.physical.cancelled.disposed.events.value} (excluded from response means)`
            : '');
        if (details.textContent !== extended) details.textContent = extended;
        retry.disabled =
          saved.saving ||
          !(
            saved.loadError ||
            saved.saveError ||
            stats.failed ||
            saved.unsaved
          );
        apply.disabled =
          starting || !!benchmark?.active || !!saved.unsaved || saved.saving;
        locks();
        for (const entry of entries) {
          const label = `Procedural ${entry.mode} view: ${stats.ready}/${stats.retained} ready chunks, selection ${selection}, ${saved.unsaved} uncommitted changes`;
          if (entry.view.canvas.getAttribute('aria-label') !== label)
            entry.view.canvas.setAttribute('aria-label', label);
        }
      },
      draw(ctx) {
        const entry = entries.find(
          (entry) => !entry.view.disposed && entry.view.canvas === ctx.canvas,
        );
        if (!entry) return;
        if (entry.mode === 'classic')
          classicCache?.draw(ctx, bounds(entry.view));
        else cache.draw(ctx, bounds(entry.view), entry.mode);
        if (selected) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1;
          ctx.strokeRect(
            selected.x * pixels(entry.view),
            selected.y * pixels(entry.view),
            pixels(entry.view),
            pixels(entry.view),
          );
        }
      },
    }),
  );
  let lastReport = 0,
    finalReported = false;
  renderBenchmark = () => {
    if (!benchmark || (!benchmark.active && finalReported)) return;
    const now = performance.now();
    if (benchmark.active && now - lastReport < 250) return;
    lastReport = now;
    finalReported = !benchmark.active;
    const metrics = benchmark.result;
    runJson.textContent = JSON.stringify(
      {
        backend: workerMode ? 'workers' : 'main',
        world: generator.identity,
        passes,
        viewport: '3 × 640×360',
        route: 'six-stops-v1',
        delayMs: 0,
        edits: 'isolated unedited benchmark',
        ...metrics,
      },
      null,
      2,
    );
    const percentage = (n: number) =>
      metrics.frames ? ((100 * n) / metrics.frames).toFixed(1) : '0.0';
    results.textContent = `${workerMode ? 'WORKERS' : 'MAIN THREAD'} · ${passes} passes · ${metrics.state.toUpperCase()} · ${(metrics.elapsedMs / 1000).toFixed(1)}s · stop ${metrics.stop}/6${metrics.reason ? ` · ${metrics.reason}` : ''}
Frames: ${metrics.frames} · mean ${metrics.meanFrameMs.toFixed(2)} ms · p95 ${metrics.p95Over499ms ? '>499' : `≤${metrics.p95FrameMsUpper}`} ms · worst ${metrics.maxFrameMs.toFixed(2)} ms
Spikes >16.7ms: ${metrics.over16ms} (${percentage(metrics.over16ms)}%) · >33.3ms: ${metrics.over33ms} (${percentage(metrics.over33ms)}%) · >50ms: ${metrics.over50ms} (${percentage(metrics.over50ms)}%)
Chunk readiness: ${metrics.ready}/${metrics.requested} observed ready · mean ${metrics.meanReadyMs.toFixed(1)} ms · worst ${metrics.maxReadyMs.toFixed(1)} ms
Unready when leaving stop: ${metrics.unfinishedAtStop} · final pending: ${metrics.pending} (means include observed-ready chunks only)
All viewport chunks ready per stop: ${metrics.stops.map((s) => `${s.stop + 1}: ${s.allReadyMs === null ? 'not yet/all-ready missed' : `${s.allReadyMs.toFixed(0)}ms`}`).join(' · ')}
Ready means published terrain data, not completed artwork. Other demo tabs/processes can affect results.`;
  };
  if (activeWorker) scene.own(activeWorker);
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
  for (const [target, mode] of [
    ['#world-biomes', 'biome'],
    ['#world-elevation', 'height'],
    ['#world-classic', 'classic'],
  ] as const) {
    const view = application.view({ target, scene, width: 640, height: 360 });
    view.camera.x = -320;
    view.camera.y = mode === 'classic' ? -12 * classicPixels - 180 : -240;
    entries.push({ view, mode, demand: view.own(stream.createDemand()) });
    controls.bind(view);
  }
  function pixels(view: View) {
    return entries.find((entry) => entry.view === view)?.mode === 'classic'
      ? classicPixels
      : terrainPixels;
  }
  function bounds(view: View): TileBounds {
    return {
      minX: Math.floor(view.camera.x / pixels(view)),
      minY: Math.floor(view.camera.y / pixels(view)),
      maxX: Math.ceil((view.camera.x + view.width) / pixels(view)),
      maxY: Math.ceil((view.camera.y + view.height) / pixels(view)),
    };
  }
  function move(x: number, y: number) {
    for (const entry of entries)
      if (!entry.view.disposed) {
        entry.view.camera.x =
          (x / terrainPixels + 64) * pixels(entry.view) - entry.view.width / 2;
        entry.view.camera.y =
          (y / terrainPixels + 36) * pixels(entry.view) - entry.view.height / 2;
      }
  }
  far.onclick = () => {
    move(5000, -5000);
  };
  back.onclick = () => {
    move(
      (selected?.x ?? 0) * terrainPixels - 320,
      (selected?.y ?? 0) * terrainPixels - 180,
    );
  };
  close.onclick = () => {
    entries[1]?.view.dispose();
    close.disabled = true;
  };
  closeClassic.onclick = () => {
    entries.find((entry) => entry.mode === 'classic')?.view.dispose();
    closeClassic.disabled = true;
  };
  retry.onclick = () => {
    void (async () => {
      await activeWorker?.restartFailed();
      stream.retryFailures();
      await edits.retry();
    })().catch(showError);
  };
  fault.onclick = () => {
    source.failNext();
  };
  reset.onclick = () => {
    void start().catch(showError);
  };
  try {
    await application.start();
  } catch (error) {
    await application.dispose();
    throw error;
  }
  reset.disabled = close.disabled = closeClassic.disabled = false;
  locks();
}
function showError(error: unknown) {
  benchmark?.invalidate(`Failure: ${String(error)}`);
  renderBenchmark();
  status.textContent = String(error);
  reset.disabled = false;
  locks();
}
await start().catch(showError);
