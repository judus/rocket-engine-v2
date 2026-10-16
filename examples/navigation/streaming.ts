import { Rocket, Scene2D, type Point, type Bounds2D } from '../../src/index.js';
import type { View } from '../../src/View.js';
import {
  ChunkStream,
  MemoryEdits,
  chunkSize,
  tileSize,
  type DemandHandle,
} from '../streaming/ChunkStream.js';
import { DelayedChunks } from '../streaming/DelayedChunks.js';
import { StreamedWalker } from './StreamedWalker.js';
const base = (cell: { x: number; y: number }): 0 | 1 | 2 =>
  (cell.x === 12 || cell.x === 13) && cell.y >= -3 && cell.y < 8
    ? 1
    : cell.y >= 4
      ? 2
      : 0;
const edits = new MemoryEdits(base);
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
source.delayMs = 200;
const stream = new ChunkStream(edits, 64, 0, { load: source.load, maxJobs: 4 });
let actor = new StreamedWalker(stream),
  alive = true,
  message = '';
const goalX = document.querySelector<HTMLInputElement>('#walker-goal-x')!;
const goalY = document.querySelector<HTMLInputElement>('#walker-goal-y')!;
const routeBudget =
  document.querySelector<HTMLSelectElement>('#walker-budget')!;
const output = document.querySelector<HTMLOutputElement>('#walker-status')!;
const progress =
  document.querySelector<HTMLParagraphElement>('#walker-progress')!;
const counters = document.querySelector<HTMLPreElement>('#walker-counters')!;
const budget = () => ({
  maxChunks: Number(routeBudget.value),
  maxExpansions: 4,
  maxVisited: 4096,
});
const coordinates = (p: Readonly<Point>) =>
  `(${Number(p.x.toFixed(1))}, ${Number(p.y.toFixed(1))})`;
const app = new Rocket({
  fixed: {},
  onError(error) {
    message = String(error);
    output.textContent = message;
  },
});
const cameras: { view: View; demand: DemandHandle }[] = [];
function explanation(): string {
  if (message) return message;
  if (!alive)
    return 'Actor disposed. Its terrain demand has been released. Reset the example to try again.';
  const state = actor.snapshot(),
    journey = state.journey;
  if (!journey)
    return 'Choose a destination and Plan journey. Blue will show the area the planner is allowed to search.';
  if (journey.status === 'arrived')
    return `Arrived at ${coordinates(journey.destination)}. Route data was released; the actor keeps its local terrain.`;
  if (journey.status === 'cancelled')
    return 'Journey cancelled. The actor stopped and released its route search area.';
  if (journey.status === 'unreachable')
    return journey.reason === 'no-route'
      ? 'No route exists in the fully loaded finite demo world.'
      : 'The actor or target is on blocked terrain. Choose a walkable destination.';
  if (journey.status === 'moving')
    return `Route found${state.planning.expansions ? ' after expanding the search area' : ''}. Walking to ${coordinates(journey.destination)}.`;
  if (journey.reason === 'corridor-limit')
    return `No complete route inside the blue area. This budget does not allow a wider search, so the actor stays put. ${state.planning.budget.maxChunks < 24 ? 'Choose 24 chunks and Plan again.' : 'Try another target or reset the example.'}`;
  if (journey.reason === 'demand-limit')
    return 'The requested search area exceeds the terrain budget. Increase the budget or choose a nearer target, then Plan again.';
  if (journey.reason === 'search-limit')
    return 'The search reached its work limit. This does not mean the target is unreachable.';
  return 'Loading the blue search area. The actor waits for terrain data before it can plan a complete route.';
}
const scene = app.scene(
  new Scene2D({
    fixedUpdate(dt) {
      stream.advance(2);
      if (alive) actor.update(dt);
    },
    update() {
      for (const { view, demand } of cameras) {
        const b = view.worldBounds;
        demand.set({
          minX: Math.floor(b.minX / tileSize),
          minY: Math.floor(b.minY / tileSize),
          maxX: Math.ceil(b.maxX / tileSize),
          maxY: Math.ceil(b.maxY / tileSize),
        });
      }
      const stats = stream.stats,
        state = actor.snapshot();
      const text = explanation();
      if (output.textContent !== text) output.textContent = text;
      progress.textContent = `Actor ${coordinates(actor.position)} · ${state.journey && state.journey.status !== 'cancelled' ? 'Requested target ' + coordinates(state.journey.destination) + ' · ' : ''}${cameras.length ? cameras.length + ' terrain views' : 'Both views closed; simulation continues'}`;
      counters.textContent = `${state.journey?.status ?? 'idle'}${state.journey?.reason ? ' / ' + state.journey.reason : ''}\nActor chunk ${Math.floor(actor.position.x / 256)},${Math.floor(actor.position.y / 256)} · ${stats.owners} demand owners\n${stats.retained}/64 retained chunks · ${stats.running}/4 jobs · ${stats.failed} failed chunks\nSearch: ${state.planning.requestedChunks}/${state.planning.budget.maxChunks} chunks · ${state.planning.expansions} expansions · ${state.planning.phase}`;
    },
  }),
  { keepAlive: true },
);
scene.own(stream);
scene.own(() => actor.dispose());
function shadeOutside(
  ctx: CanvasRenderingContext2D,
  viewport: Bounds2D,
  area: Bounds2D,
  color: string,
): void {
  ctx.beginPath();
  ctx.rect(
    viewport.minX,
    viewport.minY,
    viewport.maxX - viewport.minX,
    viewport.maxY - viewport.minY,
  );
  ctx.rect(area.minX, area.minY, area.maxX - area.minX, area.maxY - area.minY);
  ctx.fillStyle = color;
  ctx.fill('evenodd');
}
function drawWorld(ctx: CanvasRenderingContext2D, view: View): void {
  const viewport = view.worldBounds,
    state = actor.snapshot(),
    scope = state.planning.bounds,
    zoom = view.camera.zoom;
  for (
    let y = Math.floor(viewport.minY / 32);
    y < Math.ceil(viewport.maxY / 32);
    y++
  )
    for (
      let x = Math.floor(viewport.minX / 32);
      x < Math.ceil(viewport.maxX / 32);
      x++
    ) {
      const tile = stream.read({ x, y });
      ctx.fillStyle =
        tile.state === 'ready'
          ? (['#294a41', '#9cabb7', '#6a593c'][tile.value] ?? '#294a41')
          : tile.state === 'failed'
            ? '#a94c51'
            : tile.state === 'pending'
              ? '#454b63'
              : '#172333';
      ctx.fillRect(x * 32, y * 32, 31, 31);
    }
  ctx.strokeStyle = '#718d9c';
  ctx.lineWidth = 1 / zoom;
  for (
    let x = Math.floor(viewport.minX / 256);
    x <= Math.ceil(viewport.maxX / 256);
    x++
  ) {
    ctx.beginPath();
    ctx.moveTo(x * 256, viewport.minY);
    ctx.lineTo(x * 256, viewport.maxY);
    ctx.stroke();
  }
  for (
    let y = Math.floor(viewport.minY / 256);
    y <= Math.ceil(viewport.maxY / 256);
    y++
  ) {
    ctx.beginPath();
    ctx.moveTo(viewport.minX, y * 256);
    ctx.lineTo(viewport.maxX, y * 256);
    ctx.stroke();
  }
  // Camera-loaded data outside this box remains irrelevant to the current search.
  if (scope && state.routeDemand) {
    const area = {
      minX: scope.minX * 32,
      minY: scope.minY * 32,
      maxX: scope.maxX * 32,
      maxY: scope.maxY * 32,
    };
    ctx.fillStyle = '#57bdff18';
    ctx.fillRect(
      area.minX,
      area.minY,
      area.maxX - area.minX,
      area.maxY - area.minY,
    );
    shadeOutside(ctx, viewport, area, '#07111cb8');
    ctx.strokeStyle = '#68d5ff';
    ctx.lineWidth = 3 / zoom;
    ctx.setLineDash(
      state.planning.phase === 'loading' ? [8 / zoom, 5 / zoom] : [],
    );
    ctx.strokeRect(
      area.minX,
      area.minY,
      area.maxX - area.minX,
      area.maxY - area.minY,
    );
    ctx.setLineDash([]);
  }
  const world = { minX: -1024, minY: -256, maxX: 2048, maxY: 256 };
  shadeOutside(ctx, viewport, world, '#080e18dd');
  ctx.strokeStyle = '#b4bfd1';
  ctx.lineWidth = 2 / zoom;
  ctx.setLineDash([8 / zoom, 5 / zoom]);
  ctx.strokeRect(
    world.minX,
    world.minY,
    world.maxX - world.minX,
    world.maxY - world.minY,
  );
  ctx.setLineDash([]);
  const journey = state.journey,
    route =
      journey?.status === 'moving'
        ? [actor.position, ...journey.route.slice(journey.nextWaypoint)]
        : [];
  ctx.strokeStyle = '#ffd884';
  ctx.lineWidth = 3 / zoom;
  ctx.beginPath();
  route.forEach((p, i) =>
    i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
  );
  ctx.stroke();
  if (journey && journey.status !== 'cancelled') {
    ctx.fillStyle = '#ffd884';
    ctx.fillRect(journey.destination.x - 5, journey.destination.y - 5, 10, 10);
  }
  if (alive) {
    ctx.fillStyle = '#a4f0cc';
    ctx.beginPath();
    ctx.arc(actor.position.x, actor.position.y, 9, 0, Math.PI * 2);
    ctx.fill();
  }
}
function label(
  ctx: CanvasRenderingContext2D,
  view: View,
  text: string,
  p: Point,
  color: string,
): void {
  ctx.font = 'bold 13px system-ui';
  const width = ctx.measureText(text).width + 16;
  const x = Math.max(8, Math.min(view.width - width - 8, p.x)),
    y = Math.max(8, Math.min(view.height - 28, p.y));
  ctx.fillStyle = '#0c1320e8';
  ctx.fillRect(x, y, width, 22);
  ctx.fillStyle = color;
  ctx.fillText(text, x + 8, y + 15);
}
function drawOverlay(ctx: CanvasRenderingContext2D, view: View): void {
  const state = actor.snapshot(),
    scope = state.planning.bounds;
  if (scope && state.routeDemand) {
    const p = view.worldToScreen({ x: scope.minX * 32, y: scope.minY * 32 });
    label(
      ctx,
      view,
      `Allowed search area · ${state.planning.requestedChunks} chunks`,
      { x: p.x + 10, y: p.y + 8 },
      '#68d5ff',
    );
  }
  const opening = view.worldToScreen({ x: 384, y: -144 });
  if (
    opening.x >= 0 &&
    opening.x < view.width &&
    opening.y >= 0 &&
    opening.y < view.height
  )
    label(ctx, view, 'Opening above wall', opening, '#a4f0cc');
  const bottom = view.worldToScreen({ x: 0, y: 256 });
  if (bottom.y > 24 && bottom.y <= view.height)
    label(
      ctx,
      view,
      'World edge — no route below',
      { x: 12, y: bottom.y - 26 },
      '#b4bfd1',
    );
  const actorPoint = view.worldToScreen(actor.position);
  if (
    alive &&
    actorPoint.x >= 0 &&
    actorPoint.x < view.width &&
    actorPoint.y >= 0 &&
    actorPoint.y < view.height
  )
    label(
      ctx,
      view,
      'Actor',
      { x: actorPoint.x + 12, y: actorPoint.y + 12 },
      '#a4f0cc',
    );
  const journey = state.journey;
  if (journey && journey.status !== 'cancelled') {
    const p = view.worldToScreen(journey.destination);
    if (p.x >= 0 && p.x < view.width && p.y >= 0 && p.y < view.height)
      label(
        ctx,
        view,
        `Target ${coordinates(journey.destination)}`,
        { x: p.x + 12, y: p.y + 12 },
        '#ffd884',
      );
  }
}
function fitJourney(
  destination: Readonly<Point> = actor.snapshot().journey?.destination ?? {
    x: goalX.valueAsNumber,
    y: goalY.valueAsNumber,
  },
): void {
  const view = cameras[0]?.view;
  if (
    !view ||
    !Number.isFinite(destination.x) ||
    !Number.isFinite(destination.y)
  )
    return;
  const minX = Math.min(actor.position.x, destination.x, 384),
    maxX = Math.max(actor.position.x, destination.x, 448),
    minY = Math.min(-160, actor.position.y, destination.y),
    maxY = 256;
  const desired = Math.min(
    1,
    (view.width - 64) / Math.max(1, maxX - minX),
    (view.height - 48) / (maxY - minY),
  );
  view.camera.zoom = Math.max(0.6, desired);
  view.camera.x =
    desired >= 0.6
      ? minX - 32 / view.camera.zoom
      : actor.position.x - 48 / view.camera.zoom;
  view.camera.y = minY - 24 / view.camera.zoom;
}
function createViews(): void {
  for (const [i, target] of [
    '#streamed-walker-near',
    '#streamed-walker-far',
  ].entries()) {
    const view = app.view({
      target,
      scene,
      width: 640,
      height: 384,
      overlay(ctx) {
        const origin = this.worldToScreen({ x: 0, y: 0 }),
          x = this.worldToScreen({ x: 1, y: 0 }),
          y = this.worldToScreen({ x: 0, y: 1 });
        ctx.save();
        ctx.transform(
          x.x - origin.x,
          x.y - origin.y,
          y.x - origin.x,
          y.y - origin.y,
          origin.x,
          origin.y,
        );
        drawWorld(ctx, this);
        ctx.restore();
        drawOverlay(ctx, this);
      },
    });
    view.camera.x = i === 0 ? 0 : 960;
    view.camera.y = -128;
    const demand = stream.createDemand(),
      record = { view, demand };
    cameras.push(record);
    view.canvas.setAttribute(
      'aria-label',
      i === 0
        ? 'Journey view with allowed search area, wall opening, actor and target'
        : 'Independent camera; loaded terrain does not enlarge the allowed search area',
    );
    view.own(() => {
      demand.dispose();
      cameras.splice(cameras.indexOf(record), 1);
    });
  }
  fitJourney();
  for (const { view, demand } of cameras) {
    const b = view.worldBounds;
    demand.set({
      minX: Math.floor(b.minX / 32),
      minY: Math.floor(b.minY / 32),
      maxX: Math.ceil(b.maxX / 32),
      maxY: Math.ceil(b.maxY / 32),
    });
  }
}
createViews();
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
        action(b);
        message = '';
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
    },
    { signal: listeners.signal },
  );
}
function request(destination: Point): void {
  actor.go(destination, budget());
  goalX.value = String(destination.x);
  goalY.value = String(destination.y);
  fitJourney(destination);
}
const movementButtons = [
  '#walker-east',
  '#walker-west',
  '#walker-go',
  '#walker-cancel',
];
button('#walker-go', () => {
  request({ x: goalX.valueAsNumber, y: goalY.valueAsNumber });
});
button('#walker-east', () => {
  request({ x: actor.position.x + 256, y: actor.position.y });
});
button('#walker-west', () => {
  request({ x: actor.position.x - 256, y: actor.position.y });
});
button('#walker-cancel', () => {
  actor.cancel();
});
button('#walker-reset', () => {
  actor.dispose();
  actor = new StreamedWalker(stream);
  alive = true;
  goalX.value = '816';
  goalY.value = '48';
  for (const id of movementButtons)
    document.querySelector<HTMLButtonElement>(id)!.disabled = false;
  fitJourney({ x: 816, y: 48 });
});
button('#walker-return', () => {
  fitJourney();
});
button('#walker-away', () => {
  for (const [i, { view }] of cameras.entries()) {
    view.camera.x = 960 + i * 700;
    view.camera.y = -128;
    view.camera.zoom = 1;
  }
});
button('#walker-views', (b) => {
  if (cameras.length) {
    for (const { view } of [...cameras]) view.dispose();
    b.textContent = 'Reopen terrain views';
  } else {
    app.stop();
    createViews();
    b.textContent = 'Close both terrain views';
    void app.start().catch((error: unknown) => {
      message = String(error);
    });
  }
});
button('#walker-fail', () => {
  source.failNext();
});
button('#walker-retry', () => {
  stream.retryFailures();
});
button('#walker-dispose', () => {
  actor.dispose();
  alive = false;
  for (const id of movementButtons)
    document.querySelector<HTMLButtonElement>(id)!.disabled = true;
});
window.addEventListener(
  'pagehide',
  () => {
    void app.dispose();
  },
  { once: true },
);
void app.start().catch((error: unknown) => {
  message = String(error);
  output.textContent = message;
});
