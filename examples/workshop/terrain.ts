import { Panel } from '../../src/ui/index.js';
import { pickFactory, type FactoryPickTarget } from './FactoryPicking.js';
import type { SpatialEntry } from '../../src/SpatialIndex.js';
import { cargoObjects } from './CargoVisuals.js';
import { Rocket, Scene2D, Input, Assets, Cameras } from '../../src/index.js';
import { FactoryStorage } from './FactoryStorage.js';
import { captureFactory, restoreFactory } from './FactoryCheckpoint.js';
import { Construction, type PlacementPreview } from './Construction.js';
import { scatterFacilities } from './StressPlacements.js';
import { FrameSpikes } from './FrameSpikes.js';
import { FactoryDemo, buildingWork } from './FactoryDemo.js';
import { drawDiagnostics } from './FactoryRenderers.js';
import { FacilityVisuals, type Placement } from './FacilityVisuals.js';
import { TerrainGenerator } from '../terrain/TerrainGenerator.js';
import {
  StreamedClassicCache,
  classicDemand,
  classicPixels,
} from '../terrain/StreamedClassicCache.js';
import {
  ChunkStream,
  MemoryEdits,
  chunkSize,
  type TileBounds,
} from '../streaming/ChunkStream.js';
import { DelayedChunks } from '../streaming/DelayedChunks.js';
import {
  factoryArtworkBounds,
  factoryCameraSpeed,
  factoryChunkCapacity,
  factoryCanvasWidth,
  factoryCanvasHeight,
} from './TerrainViewport.js';
function element<T extends Element>(selector: string, kind: { new (): T }): T {
  const el = document.querySelector(selector);
  if (!(el instanceof kind)) throw new Error(`Missing ${selector}`);
  return el;
}
const status = element('#factory-world-status', HTMLOutputElement),
  proof = element('#factory-world-proof', HTMLParagraphElement);
const fpsLimit = element('#factory-world-fps', HTMLSelectElement);
const cameraZoom = element('#factory-world-zoom', HTMLSelectElement);
const saveFactory = element('#factory-world-save', HTMLButtonElement);
const retryLoad = element('#factory-world-retry-load', HTMLButtonElement);
const saveStatus = element('#factory-world-save-status', HTMLOutputElement);
const routeControls = element('#factory-world-route-controls', HTMLDivElement);
const routeSource = element('#factory-world-route-source', HTMLSelectElement);
const routeDestination = element(
  '#factory-world-route-destination',
  HTMLSelectElement,
);
const routeConnect = element('#factory-world-route-connect', HTMLButtonElement);
const routeStatus = element('#factory-world-route-status', HTMLOutputElement);
const routeDisconnect = element(
  '#factory-world-route-disconnect',
  HTMLButtonElement,
);
const openInspector = element(
  '#factory-world-open-inspector',
  HTMLButtonElement,
);
const inspectorHost = element('#factory-world-inspector-host', HTMLDivElement);
let inspectionPanel: Panel | undefined;
let inspectedId = '';
const selected = element('#factory-world-selected', HTMLSelectElement);
const drain = element('#factory-world-drain', HTMLButtonElement);
const remove = element('#factory-world-remove', HTMLButtonElement);
const inspector = element('#factory-world-inspector', HTMLOutputElement);
const pickStatus = element('#factory-world-pick-status', HTMLOutputElement);
const workshopControls = element(
  '#factory-world-workshop-controls',
  HTMLDivElement,
);
const siteCancel = element('#factory-world-site-cancel', HTMLButtonElement);
const facilityPause = element(
  '#factory-world-facility-pause',
  HTMLButtonElement,
);
const operator = element('#factory-world-operator', HTMLButtonElement);
const supply = element('#factory-world-supply', HTMLButtonElement);

const buildingSelect = element('#factory-world-building', HTMLSelectElement);
const buildingStatus = element(
  '#factory-world-building-status',
  HTMLOutputElement,
);
const buildingControls = element(
  '#factory-world-building-controls',
  HTMLDivElement,
);
const cameraRendering = element(
  '#factory-world-camera-rendering',
  HTMLSelectElement,
);
const spikeOutput = element('#factory-world-spikes', HTMLPreElement);
const clearSpikes = element('#factory-world-clear-spikes', HTMLButtonElement);
fpsLimit.value = '0';
const far = element('#factory-world-far', HTMLButtonElement),
  home = element('#factory-world-home', HTMLButtonElement),
  close = element('#factory-world-close', HTMLButtonElement),
  recreate = element('#factory-world-recreate', HTMLButtonElement),
  pause = element('#factory-world-pause', HTMLButtonElement),
  collect = element('#factory-world-collect', HTMLButtonElement);
// Page-owned domain and placements; view teardown has no authority to remove either.
const parameters = new URLSearchParams(location.search);
const stress = parameters.get('stress') === '6000';
const radius = Number(parameters.get('range') ?? 128);
const workshop = !stress && parameters.get('workshop') === '1';
const transport = !stress && (workshop || parameters.get('transport') === '1');
workshopControls.hidden = !workshop;
workshopControls.style.display = workshop ? 'flex' : 'none';
routeControls.hidden = !transport;
routeControls.style.display = transport ? 'flex' : 'none';
const storage = stress
  ? null
  : new FactoryStorage(
      undefined,
      workshop
        ? 'workshop-w2-v4'
        : transport
          ? 'transport-w2-v4'
          : 'normal-w2-v4',
    );
let pageClosed = false;
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    pageClosed = true;
    storage?.dispose();
  }
});
for (const button of [
  far,
  home,
  close,
  recreate,
  pause,
  collect,
  saveFactory,
  routeConnect,
  routeDisconnect,
  drain,
  remove,
])
  button.disabled = true;
buildingSelect.disabled = true;
async function loadSavedFactory() {
  if (!storage) {
    saveStatus.textContent = 'Stress mode: saving disabled.';
    return null;
  }
  return new Promise<ReturnType<typeof restoreFactory> | null>((resolve) => {
    let busy = false;
    const attempt = async () => {
      if (busy || pageClosed) return;
      busy = true;
      retryLoad.disabled = true;
      saveStatus.textContent = 'Loading factory checkpoint…';
      try {
        const record = await storage.read();
        const world = record === undefined ? null : restoreFactory(record);
        if (
          world &&
          (world.factory.transport !== transport ||
            world.factory.workshop !== workshop)
        ) {
          world.factory.dispose();
          throw new Error('Checkpoint belongs to another factory mode');
        }
        if (pageClosed) {
          world?.factory.dispose();
          return;
        }
        saveStatus.textContent = world
          ? `Restored tick ${world.factory.read([]).summary.tick}. No offline progression. Save explicitly to keep later changes.`
          : 'No saved factory. Save explicitly to keep buildings and production.';
        retryLoad.hidden = true;
        retryLoad.style.display = 'none';
        resolve(world);
      } catch (error) {
        if (!pageClosed) {
          saveStatus.textContent = `Load failed: ${String(error)}. Saved data was not changed. Retry load to continue.`;
          retryLoad.disabled = false;
        }
      } finally {
        busy = false;
      }
    };
    retryLoad.onclick = () => {
      void attempt();
    };
    void attempt();
  });
}
const restored = await loadSavedFactory();
const factory =
    restored?.factory ??
    new FactoryDemo(stress ? 2000 : 1, transport, workshop),
  generator =
    restored?.generator ?? new TerrainGenerator({ seed: 42, scale: 48 });
const placements: readonly Placement[] = restored
  ? restored.construction.placements
  : stress
    ? scatterFacilities(factory.ids, radius)
    : Object.freeze(
        factory.ids.map((facilityId, index) =>
          Object.freeze({
            facilityId,
            label: ['Mine', 'Smelter', 'Press'][index] ?? '',
            cell: Object.freeze({ x: 4 + index * 8, y: 4 }),
          }),
        ),
      );
const construction = stress
  ? null
  : (restored?.construction ?? new Construction(placements));
if (stress) {
  retryLoad.hidden = true;
  retryLoad.style.display = 'none';
}
let saving = false;
saveFactory.onclick = () => {
  if (!storage || !construction || saving || pageClosed) return;
  saving = true;
  saveFactory.disabled = true;
  let snapshot;
  try {
    snapshot = captureFactory(factory, construction.placements, generator);
  } catch (error) {
    saving = false;
    saveFactory.disabled = false;
    saveStatus.textContent = `Save failed: ${String(error)}. Current world remains in memory.`;
    return;
  }
  const tick = snapshot.factory.simulation.tick;
  saveStatus.textContent = `Saving tick ${tick}…`;
  void storage
    .write(snapshot)
    .then(
      () => {
        if (!pageClosed)
          saveStatus.textContent = `Saved tick ${tick} (${snapshot.placements.length} buildings). Later progress is not saved until you Save again.`;
      },
      (error) => {
        if (!pageClosed)
          saveStatus.textContent = `Save failed: ${String(error)}. Previous checkpoint kept; current world remains in memory. Retry Save.`;
      },
    )
    .finally(() => {
      saving = false;
      if (!pageClosed) saveFactory.disabled = false;
    });
};
let lastBuild = '';
let routeOptionsKey = '';
let selectionOptionsKey: string | null = null;
function refreshRoutes() {
  const key = factory.ids.join(',');
  if (!transport || routeOptionsKey === key) return;
  routeOptionsKey = key;
  const previous = [routeSource.value, routeDestination.value];
  const rows = factory.read().facilities;
  for (const [i, select] of [routeSource, routeDestination].entries()) {
    select.replaceChildren();
    for (const facility of rows) {
      const option = document.createElement('option');
      option.value = facility.id;
      option.textContent = `${facility.definitionId} · ${facility.id}`;
      select.appendChild(option);
    }
    if (factory.ids.includes(previous[i] ?? '')) select.value = previous[i]!;
  }
  if (!previous[1] && factory.ids[1]) routeDestination.value = factory.ids[1];
}
function refreshInspection() {
  renderInspection();
  const panel = inspectionPanel;
  const id = selected.value;
  openInspector.disabled = !panel || panel.disposed || !id;
  if (!panel || panel.disposed) return;
  if (!id) panel.close();
  else if (id !== inspectedId) panel.show();
  inspectedId = id;
}
function renderInspection() {
  if (stress) return;
  const state = factory.read();
  const key = [...factory.ids, ...state.orders.map((o) => o.id)].join(',');
  if (selectionOptionsKey !== key) {
    selectionOptionsKey = key;
    const previous = selected.value;
    selected.replaceChildren();
    const none = document.createElement('option');
    none.value = '';
    none.textContent = 'No building selected';
    selected.appendChild(none);
    for (const row of [
      ...state.facilities.map((f) => ({ id: f.id, label: f.definitionId })),
      ...state.orders.map((o) => ({
        id: o.id,
        label: `${o.definitionId} site`,
      })),
    ]) {
      const option = document.createElement('option');
      option.value = row.id;
      option.textContent = `${row.label} · ${row.id}`;
      selected.appendChild(option);
    }
    if (key.split(',').includes(previous)) selected.value = previous;
  }
  selected.disabled = !key;
  routeDisconnect.disabled =
    !transport ||
    !state.transports.some(
      (r) => r.destination === routeDestination.value && !r.draining,
    );
  siteCancel.disabled = facilityPause.disabled = operator.disabled = true;
  supply.disabled = !workshop || paused;
  const id = selected.value;
  const site = state.orders.find((o) => o.id === id);
  const quantities = (row: Readonly<Record<string, number>>) =>
    Object.entries(row)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ') || 'empty';
  if (site) {
    inspector.textContent = `${site.definitionId} site · ${site.id} · ${site.state} · ${(site.progress * 100).toFixed(0)}%\nCost ${buildingWork[site.definitionId as keyof typeof buildingWork].ore} ore · ${site.durationMicroseconds / 1000000}s work\nReserved: ${quantities(site.reservedMaterials)} · Missing: ${quantities(site.missingMaterials)}\nCancellation releases reserved materials. No production or workforce benefits until completion.`;
    drain.disabled = remove.disabled = true;
    siteCancel.disabled = paused;
    return;
  }
  const f = state.facilities.find((row) => row.id === id);
  if (!f) {
    inspector.textContent = key
      ? 'No building selected. Pick a building/site or use the dropdown.'
      : 'No buildings. Freed foundations can be built on again.';
    drain.disabled = remove.disabled = true;
    return;
  }
  const routes = state.transports.filter(
    (r) => r.source === id || r.destination === id,
  );
  const buffer = state.buffers.find((b) => b.facilityId === id);
  const reason = factory.removalReason(id);
  const text = `${f.definitionId} · ${id} · ${f.enabled ? 'production enabled' : 'production paused'} · ${f.draining ? 'draining' : 'accepting work'}\n${f.jobs.map((j) => `${j.state} · ${(j.progress * 100).toFixed(0)}% · ${j.batchesCompleted} batches`).join('; ')}\n${buffer ? `Input: ${quantities(buffer.input.quantities)} · Output: ${quantities(buffer.output.quantities)}` : `Shared stock: ${quantities(state.stock.quantities)}`}\n${workshop ? (f.definitionId === 'mine' ? 'Autonomous mine; no operator required.\n' : `Operator required: 1 · present on site: ${f.attendance.operator ?? 0}\n`) : ''}${routes.map((r) => `${r.source} → ${r.destination}: ${r.draining ? 'disconnecting' : 'connected'}${r.cargo ? ` · ${r.cargo.state}` : ''}`).join('; ') || 'No routes'}\n${reason ?? 'Ready to remove. Leftover materials move to the shared stockpile.'}`;
  if (inspector.textContent !== text) inspector.textContent = text;
  drain.disabled = false;
  drain.textContent = f.draining ? 'Stop draining' : 'Drain building';
  remove.disabled = reason !== null;
  facilityPause.disabled = !workshop || paused;
  facilityPause.textContent = f.enabled
    ? 'Pause building production'
    : 'Resume building production';
  operator.disabled = !workshop || paused || f.definitionId === 'mine';
  operator.textContent =
    (f.attendance.operator ?? 0) > 0
      ? 'Remove operator from site'
      : 'Place operator on site';
}
selected.onchange = refreshInspection;
routeDestination.onchange = refreshInspection;
drain.onclick = () => {
  const f = factory.read([selected.value]).facilities[0];
  if (f) factory.draining(f.id, !f.draining);
  refreshInspection();
};
routeDisconnect.onclick = () => {
  try {
    factory.disconnect(routeDestination.value);
    routeStatus.textContent =
      'Dispatch stopped. Any active cargo will finish before the route is released.';
  } catch (error) {
    routeStatus.textContent = String(error);
  }
  refreshInspection();
};
refreshRoutes();
routeConnect.onclick = () => {
  if (!construction || !transport || paused) return;
  const a = construction.placements.find(
    (p) => p.facilityId === routeSource.value,
  );
  const b = construction.placements.find(
    (p) => p.facilityId === routeDestination.value,
  );
  if (!a || !b) return;
  const seconds = Math.max(
    0.5,
    (Math.hypot(a.cell.x - b.cell.x, a.cell.y - b.cell.y) * 16) / 64,
  );
  try {
    factory.connect(a.facilityId, b.facilityId, seconds);
    routeStatus.textContent = `Connected ${a.label} → ${b.label} · ${seconds.toFixed(1)}s travel`;
  } catch (error) {
    routeStatus.textContent = String(error);
  }
};
if (transport) {
  element('h1', HTMLHeadingElement).textContent =
    'Cargo travels. Production waits.';
  element('#factory-world-description', HTMLParagraphElement).textContent =
    'Transport mode: each facility has separate input/output buffers (capacity 20 each). Two initial routes connect Mine → Smelter → Press with 2s journeys. New buildings need a compatible supply route: choose endpoints and Connect. Travel time follows straight-line distance at 64 pixels/s (minimum 0.5s); routes cross water and terrain freely. Orange cargo carries ore; blue carries alloy; red waits for unloading. Collect withdraws finished parts from all Press outputs and salvaged stock. Inspect a building to Drain/Resume or remove it after work and cargo finish. Disconnect stops dispatch and lets active cargo unload. Removal salvages materials into shared stock (capacity 20); empty private buffers are retired by Workshop. Save restores cargo and arrival deadlines in a separate checkpoint slot.';
  collect.textContent = 'Collect all finished parts';
}
if (workshop) {
  element('h1', HTMLHeadingElement).textContent =
    'Build it. Staff it. Then produce.';
  element('#factory-world-description', HTMLParagraphElement).textContent =
    'Construction/staffing proof: Mine 2 ore / 6s, Smelter 4 ore / 10s, Press 6 ore / 12s. Build places a site; Workshop reserves ore from the shared depot, advances work and charges once on completion. Cancel releases unused reservations and frees the footprint. Place an operator on a completed Smelter/Press to permit production; remove them or pause that building to freeze progress. Yellow-head/blue-body markers indicate explicit local attendance. Each workplace has one allocated operator slot; this is manual on-site placement, with no population, pathfinding or worker travel model. Supply moves actual mine-output ore to the depot directly; construction-material hauling is not modeled. Production routes still need connecting for new facilities. Save includes pending sites, materials, jobs, pause and attendance.';
}
if (stress) {
  element('#factory-world-inspector-controls', HTMLDivElement).style.display =
    'none';
  inspector.style.display = 'none';
  buildingControls.hidden = true;
  buildingControls.style.display = 'none';
  buildingSelect.disabled = true;
  element('h1', HTMLHeadingElement).textContent =
    '6,000 factories. One shared world.';
  element('#factory-world-description', HTMLParagraphElement).textContent =
    `Main-thread stress: 2,000 independent ore → alloy → parts chains, 6,000 facilities and 6,000 inventories. Seed 42, unique anchors within ±${radius} tiles of (0, 0). Buildings may overlap or sit on water; this tests workload, not construction rules. Stock/collection diagnostics show the first chain’s finished inventory; completed parts count all chains. Storage capacity is 1,000,000 per material.`;
  proof.textContent =
    'All 6,000 facilities simulate regardless of visibility. Travel or close terrain to compare simulation cost with rendering.';
  collect.textContent = 'Collect sample chain parts';
}
const edits = new MemoryEdits(
  (cell) => generator.sample(cell.x, cell.y).biome,
  6,
);
let app: Rocket | undefined,
  previousStream: ChunkStream | undefined,
  previousCache: StreamedClassicCache | undefined,
  previousVisuals: FacilityVisuals | undefined,
  previousCameras: Cameras | undefined;
let paused = false,
  departureTick: number | null = null;
async function start() {
  buildingSelect.disabled = true;
  cameraZoom.disabled = true;
  for (const button of [far, home, close, recreate, pause, collect])
    button.disabled = true;
  await app?.dispose();
  if (previousStream)
    proof.textContent = `Previous views released: ${previousStream.stats.owners} demand owners, ${previousStream.stats.retained} chunks, ${previousCache?.stats.regions ?? 0} artwork regions, ${previousVisuals?.stats.retained ?? 0} building visuals, ${previousCameras?.size ?? 0} camera controllers. Workshop tick ${factory.read([]).summary.tick} preserved.`;
  paused = false;
  pause.textContent = 'Pause production';
  const application = new Rocket({
    performance: true,
    onError: showError,
    maxFps: Number(fpsLimit.value) || null,
  });
  pickStatus.textContent = stress
    ? 'Stress mode: selection disabled.'
    : 'Pan mode: click roofs, building bodies or tree bounds. Frontmost hit wins.';
  const cameras = application.use(Cameras);
  previousCameras = cameras;
  const spikes = new FrameSpikes();
  const source = new DelayedChunks((cell) =>
    spikes.measure(
      'generation',
      () => generator.chunk(cell.x, cell.y, chunkSize).biomes,
    ),
  );
  source.delayMs = 0;
  let spikeRevision = -1;
  clearSpikes.onclick = () => {
    spikes.clear();
  };
  function showSpikes() {
    if (spikeRevision === spikes.revision) return;
    spikeRevision = spikes.revision;
    spikeOutput.textContent =
      spikes.rows.length === 0
        ? 'No spikes recorded yet.'
        : [
            'frame   gap   work   gen(n)   scene   stream   art(n)   render  unmeasured',
            ...spikes.rows.map((row) => {
              const c = row.costs;
              const scene = c.domain + c.camera + c.visuals + c.hud;
              const fmt = (value: number) => value.toFixed(1).padStart(5);
              return `${String(row.frame).padStart(5)} ${fmt(row.intervalMs)} ${fmt(row.workMs)} ${fmt(c.generation)}(${row.chunks}) ${fmt(scene)} ${fmt(c.stream)} ${fmt(c.artwork)}(${row.builds}) ${fmt(c.render)} ${fmt(Math.max(0, row.intervalMs - row.workMs))}`;
            }),
          ].join('\n');
  }
  showSpikes();
  fpsLimit.onchange = () => {
    application.maxFps = Number(fpsLimit.value) || null;
    spikes.reset();
  };
  app = application;
  const stream = new ChunkStream(edits, factoryChunkCapacity, 1, {
    load: source.load,
    maxJobs: 8,
  });
  previousStream = stream;
  const visuals = new FacilityVisuals(construction?.placements ?? placements);
  previousVisuals = visuals;
  const input = application.use(Input),
    assets = application.use(Assets);
  let cache: StreamedClassicCache | undefined,
    state = factory.read(stress ? [] : factory.ids);
  let preview: PlacementPreview | null = null;
  let picked: SpatialEntry<FactoryPickTarget> | null = null;
  selected.onchange = () => {
    picked = null;
    pickStatus.textContent = selected.value
      ? `Inspector selected ${selected.value}.`
      : 'No building selected.';
    refreshInspection();
  };
  const ground = (cell: Readonly<{ x: number; y: number }>) => {
    const tier = cache?.tier(cell);
    return tier === undefined
      ? ('unloaded' as const)
      : tier <= 2
        ? ('water' as const)
        : ('land' as const);
  };
  const scene = application.scene(
    new Scene2D({
      async prepare({ signal }) {
        const terrain = world.own(
          await assets.acquireImage(
            new URL(
              '../../../examples/terrain/assets/terrain.png',
              import.meta.url,
            ).href,
            {
              signal,
            },
          ),
        );
        const decorations = world.own(
          await assets.acquireImage(
            new URL(
              '../../../examples/terrain/assets/decorations.png',
              import.meta.url,
            ).href,
            { signal },
          ),
        );
        cache = world.own(
          new StreamedClassicCache(
            stream,
            generator,
            terrain.image,
            decorations.image,
          ),
        );
        previousCache = cache;
      },
      update(dt) {
        spikes.begin(dt, null); // Updates now follow RAF, independently of the render cap.
        // Advance independently of camera demand, loaded terrain, and visual lifetime.
        spikes.measure('domain', () => {
          factory.advance(dt);
          for (const completed of factory.takeCompletedSites()) {
            if (!construction) throw new Error('Missing construction registry');
            const wasSelected = selected.value === completed.orderId;
            const placed = construction.completeSite(
              completed.orderId,
              completed.facilityId,
              completed.kind === 'mine'
                ? 'Mine'
                : completed.kind === 'smelter'
                  ? 'Smelter'
                  : 'Press',
            );
            if (!world.disposed) {
              visuals.removePlacement(completed.orderId);
              visuals.addPlacement(placed);
            }
            if (picked?.id === completed.orderId) {
              picked = null;
              pickStatus.textContent = `Completed ${placed.label} · ${placed.facilityId}`;
            }
            refreshRoutes();
            refreshInspection();
            if (wasSelected) selected.value = completed.facilityId;
          }
        });
        const screenPointer =
          !world.disposed && pointer.pointer.world
            ? world.worldToScreen(pointer.pointer.world)
            : null;
        spikes.measure('camera', () => {
          if (!world.disposed) {
            const dx =
                Number(controls.down('right')) - Number(controls.down('left')),
              dy = Number(controls.down('down')) - Number(controls.down('up'));
            camera.update(dt, { x: dx, y: dy });
            world.camera.x = Math.max(
              -100000,
              Math.min(100000, world.camera.x),
            );
            world.camera.y = Math.max(
              -100000,
              Math.min(100000, world.camera.y),
            );
            demand.set(
              classicDemand(factoryArtworkBounds(bounds(), world.camera.zoom)),
            );
          }
        });
        const pickedPoint =
          !world.disposed && screenPointer
            ? world.screenToWorld(screenPointer)
            : null;
        spikes.measure('stream', () => stream.advance(4));
        if (!world.disposed) {
          const before = cache?.stats.builds ?? 0;
          spikes.measure('artwork', () =>
            cache?.prepare(
              factoryArtworkBounds(bounds(), world.camera.zoom),
              4,
              3,
            ),
          );
          spikes.built((cache?.stats.builds ?? 0) - before);
          spikes.measure('visuals', () => {
            if (construction) {
              const point = pickedPoint;
              const kind = buildingSelect.value;
              preview =
                point && kind !== 'pan'
                  ? construction.preview(
                      {
                        x: Math.floor(point.x / classicPixels),
                        y: Math.floor(point.y / classicPixels),
                      },
                      ground,
                    )
                  : null;
              if (
                pointer.pointer.pressed &&
                preview?.valid &&
                (kind === 'mine' || kind === 'smelter' || kind === 'press')
              ) {
                const placed = construction.place(
                  kind,
                  preview.cell,
                  ground,
                  (type) =>
                    workshop
                      ? factory.orderFacility(type)
                      : factory.addFacility(type),
                );
                if (placed) {
                  const shown = workshop
                    ? { ...placed, label: `${placed.label} site` }
                    : placed;
                  visuals.addPlacement(shown);
                  lastBuild = `${workshop ? 'Ordered' : 'Built'} ${placed.label} at (${placed.cell.x}, ${placed.cell.y}) · ${placed.facilityId}`;
                  preview = construction.preview(placed.cell, ground);
                }
              }
              const text =
                kind === 'pan'
                  ? `Pan mode: click a building or tree to inspect; click terrain to focus WASD. ${lastBuild}`
                  : `${preview?.reason ?? 'Move onto terrain to preview'}${preview ? ` at (${preview.cell.x}, ${preview.cell.y})` : ''}. ${lastBuild}`;
              if (buildingStatus.textContent !== text)
                buildingStatus.textContent = text;
            }
            visuals.update(
              (cell) => !!cache?.ready(cell),
              classicDemand(factoryArtworkBounds(bounds(), world.camera.zoom)),
            );
            if (
              !stress &&
              pointer.pointer.pressed &&
              buildingSelect.value === 'pan' &&
              pickedPoint &&
              cache
            ) {
              picked = pickFactory(pickedPoint, visuals, cache);
              selected.value =
                picked?.value.kind === 'building' ? picked.id : '';
              refreshInspection();
              if (selected.value && inspectionPanel?.shown === false)
                inspectionPanel.show();
              pickStatus.textContent = picked
                ? `Picked ${picked.value.kind === 'building' ? picked.value.placement.label : picked.value.label} · ${picked.id}`
                : 'No object at the pointer.';
            }
            if (picked) {
              const b = picked.bounds,
                center = { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
              const live =
                picked.value.kind === 'building'
                  ? visuals.candidates(center)
                  : (cache?.candidates(center) ?? []);
              if (!live.some((entry) => entry.id === picked?.id)) {
                picked = null;
                pickStatus.textContent =
                  'Picked object released from this view.';
              }
            }
          });
        }
        state = spikes.measure('domain', () =>
          factory.read(stress ? visuals.ids() : factory.ids),
        );
        spikes.measure('hud', () => {
          showSpikes();
          refreshRoutes();
          refreshInspection();
          const stats = stream.stats,
            v = visuals.stats;
          const text = `Workshop tick ${state.summary.tick} · ${state.completed} parts produced · ${state.stock.quantities.parts ?? 0} stored · ${state.collected} collected\n${stats.owners} terrain demand owner · ${stats.retained}/${factoryChunkCapacity} chunks · ${stats.running}/8 jobs · ${cache?.stats.regions ?? 0} artwork regions\n${v.retained}/${factory.ids.length + state.orders.length} nearby building/site visuals · ${cache?.drawStats.extras ?? 0} visible ${transport ? 'buildings/cargo' : 'buildings'} · ${v.builds} built / ${v.released} released · ${state.summary.facilityCount} domain facilities · zoom ${world.camera.zoom.toFixed(2)}× · ${application.performance?.fps?.toFixed(0) ?? '…'} FPS\nFrame avg / max ${application.performance?.frameMs?.toFixed(1) ?? '…'} / ${application.performance?.maxFrameMs?.toFixed(1) ?? '…'} ms · update ${application.performance?.updateMs?.toFixed(1) ?? '…'} ms · draw ${application.performance?.renderMs?.toFixed(1) ?? '…'} ms\nDecorations scanned ${cache?.drawStats.scannedRecords ?? 0}/${cache?.stats.records ?? 0} cached · ${cache?.drawStats.queriedRegions ?? 0} queried regions · ${cache?.drawStats.objects ?? 0} visible depth objects${transport ? `\n${state.transports.length} routes · ${state.transports.filter((r) => r.cargo).length} cargo in transit/blocked · ${state.transports.reduce((sum, r) => sum + r.completed, 0)} deliveries completed · ${state.summary.inventoryCount} inventories` : ''}${workshop ? `\nConstruction depot: ${state.depot.quantities.ore ?? 0} ore (${state.depot.reserved.ore ?? 0} reserved) · ${state.orders.length} active sites · ${state.facilities.filter((f) => (f.attendance.operator ?? 0) > 0).length} operators on site` : ''}`;
          if (status.textContent !== text) status.textContent = text;
          collect.disabled = (state.stock.quantities.parts ?? 0) === 0;
          for (const view of [world, diagnostic])
            if (!view.disposed)
              view.canvas.setAttribute(
                'aria-label',
                `Streamed factory ${view === world ? 'terrain' : 'diagnostics'}: tick ${state.summary.tick}, ${v.retained} building visuals, ${state.summary.facilityCount} facilities, ${state.completed} parts produced`,
              );
        });
      },
      draw(ctx) {
        spikes.measure('render', () => {
          if (ctx.canvas === world.canvas) {
            cache?.draw(ctx, bounds(), [
              ...visuals.objects(state),
              ...cargoObjects(state, construction?.placements ?? placements),
            ]);
            if (picked) {
              const b = picked.bounds;
              ctx.save();
              ctx.strokeStyle = '#ffee79';
              ctx.lineWidth = 2 / world.camera.zoom;
              ctx.strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
              ctx.restore();
            }
            if (preview) {
              const b = preview.footprint;
              ctx.save();
              ctx.fillStyle = preview.valid
                ? 'rgba(72, 240, 151, 0.3)'
                : 'rgba(255, 80, 80, 0.4)';
              ctx.strokeStyle = preview.valid ? '#48f097' : '#ff5050';
              ctx.lineWidth = 1;
              ctx.fillRect(
                b.minX * classicPixels,
                b.minY * classicPixels,
                (b.maxX - b.minX) * classicPixels,
                (b.maxY - b.minY) * classicPixels,
              );
              ctx.strokeRect(
                b.minX * classicPixels,
                b.minY * classicPixels,
                (b.maxX - b.minX) * classicPixels,
                (b.maxY - b.minY) * classicPixels,
              );
              ctx.restore();
            }
            return;
          }
          drawDiagnostics(ctx, state);
          ctx.fillStyle = '#84d9b6';
          ctx.font = '15px monospace';
          ctx.fillText(
            workshop
              ? `${state.orders.length} sites · depot ${state.depot.quantities.ore ?? 0} ore / ${state.depot.reserved.ore ?? 0} reserved`
              : `${visuals.stats.retained} visuals / ${state.summary.facilityCount} facilities · ${stream.stats.retained} chunks`,
            20,
            384,
          );
          ctx.fillText(
            workshop
              ? `${state.facilities.filter((f) => (f.attendance.operator ?? 0) > 0).length} on-site operators · individual pause/attendance persisted`
              : `IDs: ${factory.ids.slice(0, 6).join(', ')}${stress ? ' …' : ''}`,
            20,
            410,
          );
          ctx.fillText(
            departureTick === null
              ? 'Visit far away to evict the factory terrain.'
              : `Departure tick ${departureTick} → current ${state.summary.tick}`,
            20,
            438,
          );
        });
      },
    }),
  );
  scene.own(spikes);
  scene.own(stream);
  const controls = scene.own(
    input.scope(scene, {
      left: ['KeyA', 'ArrowLeft'],
      right: ['KeyD', 'ArrowRight'],
      up: ['KeyW', 'ArrowUp'],
      down: ['KeyS', 'ArrowDown'],
    }),
  );
  const world = application.view({
    target: '#factory-world',
    scene,
    width: factoryCanvasWidth,
    height: factoryCanvasHeight,
    pixelSnap: cameraRendering.value === 'snapped',
  });
  cameraRendering.onchange = () => {
    world.pixelSnap = cameraRendering.value === 'snapped';
  };
  if (!stress) {
    const panel = new Panel({
      target: '#factory-world-panel',
      title: 'Building inspection',
      view: world,
    });
    inspectionPanel = panel;
    inspectedId = '';
    panel.element.classList.add('factory-inspection-panel');
    const actions = document.createElement('div');
    actions.className = 'toolbar';
    actions.append(drain, remove);
    panel.append(inspector, actions, workshopControls);
    // These are the original command controls, moved rather than duplicated.
    // Return page-owned nodes before the view-owned panel removes its DOM.
    panel.own(() => {
      inspectorHost.append(inspector, workshopControls, drain, remove);
      if (inspectionPanel === panel) inspectionPanel = undefined;
      selected.value = '';
      inspectedId = '';
      openInspector.disabled = true;
    });
    panel.close();
    openInspector.onclick = () => {
      if (!selected.value || panel.disposed) return;
      refreshInspection();
      panel.show();
      panel.focus();
    };
  }
  const camera = cameras.bind(world, {
    speed: factoryCameraSpeed,
    minZoom: 0.75,
    maxZoom: 4,
  });
  cameraZoom.disabled = false;
  cameraZoom.value = '1';
  cameraZoom.onchange = () => {
    if (!world.disposed)
      camera.zoomAt(Number(cameraZoom.value), {
        x: world.width / 2,
        y: world.height / 2,
      });
  };
  world.own(visuals);
  const demand = world.own(stream.createDemand());
  const pointer = controls.bind(world);
  world.camera.x = world.camera.y = -128;
  const diagnostic = application.view({
    target: '#factory-world-diagnostics',
    scene,
    width: 640,
    height: 460,
  });
  function bounds(): TileBounds {
    const b = world.worldBounds;
    return {
      minX: Math.floor(b.minX / classicPixels),
      minY: Math.floor(b.minY / classicPixels),
      maxX: Math.ceil(b.maxX / classicPixels),
      maxY: Math.ceil(b.maxY / classicPixels),
    };
  }
  far.onclick = () => {
    camera.resetMotion();
    departureTick = state.summary.tick;
    world.camera.x = 16000;
    world.camera.y = -16000;
  };
  home.onclick = () => {
    camera.resetMotion();
    world.camera.zoom = 1;
    cameraZoom.value = '1';
    world.camera.x = world.camera.y = -128;
  };
  close.onclick = () => {
    world.dispose();
    refreshInspection();
    preview = null;
    picked = null;
    pickStatus.textContent = 'Terrain view closed; pick records released.';
    cameraZoom.disabled = true;
    buildingSelect.disabled = true;
    buildingStatus.textContent =
      'Terrain view is closed. Placements are preserved.';
    far.disabled = home.disabled = close.disabled = true;
  };
  remove.onclick = () => {
    if (!construction || !selected.value) return;
    const id = selected.value;
    try {
      factory.removeFacility(id);
      construction.remove(id);
      if (picked?.id === id) {
        picked = null;
        pickStatus.textContent = 'Picked building removed.';
      }
      if (!world.disposed) visuals.removePlacement(id);
      lastBuild = `Removed ${id}. Foundation released; materials preserved in stockpile.`;
      refreshRoutes();
      refreshInspection();
    } catch (error) {
      inspector.textContent = String(error);
    }
  };
  siteCancel.onclick = () => {
    if (!construction) return;
    const id = selected.value;
    try {
      factory.cancelSite(id);
      construction.remove(id);
      if (!world.disposed) visuals.removePlacement(id);
      if (picked?.id === id) picked = null;
      selected.value = '';
      pickStatus.textContent = `Cancelled ${id}; reservation and footprint released.`;
      refreshInspection();
    } catch (error) {
      inspector.textContent = String(error);
    }
  };
  facilityPause.onclick = () => {
    const f = factory
      .read()
      .facilities.find((row) => row.id === selected.value);
    if (f) factory.pauseFacility(f.id, f.enabled);
    refreshInspection();
  };
  operator.onclick = () => {
    const f = factory
      .read()
      .facilities.find((row) => row.id === selected.value);
    if (f) factory.operatorOnSite(f.id, (f.attendance.operator ?? 0) === 0);
    refreshInspection();
  };
  supply.onclick = () => {
    const amount = factory.supplyDepot();
    lastBuild = `Moved ${amount} mine ore into the construction depot.`;
    refreshInspection();
  };
  collect.onclick = () => {
    factory.collect();
    refreshInspection();
  };
  pause.onclick = () => {
    camera.resetMotion();
    paused = !paused;
    routeConnect.disabled = paused;
    cameraZoom.disabled = paused || world.disposed;
    buildingSelect.disabled = stress || paused || world.disposed;
    for (const button of [far, home, close, recreate, collect])
      button.disabled =
        paused || (button !== recreate && world.disposed && button !== collect);
    pause.textContent = paused ? 'Resume production' : 'Pause production';
    refreshInspection();
    if (paused) application.stop();
    else void application.start().catch(showError);
  };
  await application.start();
  routeConnect.disabled = !transport;
  refreshInspection();
  buildingSelect.disabled = stress;
  saveFactory.disabled = stress || saving;
  for (const button of [far, home, close, recreate, pause])
    button.disabled = false;
}
function showError(error: unknown) {
  status.textContent = String(error);
  recreate.disabled = false;
}
recreate.onclick = () => {
  void start().catch(showError);
};
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    factory.dispose();
    void app?.dispose().catch(showError);
  }
});
await start().catch(showError);
