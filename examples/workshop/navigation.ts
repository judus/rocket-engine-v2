import { Rocket, Scene2D } from '../../src/index.js';
import type { View } from '../../src/View.js';
import {
  GridTraversal,
  GridNavigator,
  Movement,
  type NavigationObstacle,
} from '../../src/navigation/index.js';
import { FactoryDemo } from './FactoryDemo.js';
import { WorkplaceOperator } from './WorkplaceOperator.js';
const factory = new FactoryDemo(1, true, true);
const smelter = factory.ids[1]!,
  press = factory.ids[2]!;
const places = new Map([
  [smelter, { x: 240, y: 208 }],
  [press, { x: 560, y: 208 }],
]);
const actor = { radius: 9, clearance: 2, capabilities: ['walk'] };
const domain = { minX: 0, minY: 0, columns: 20, rows: 12, tileSize: 32 };
let revision = 0,
  gate = false,
  unknown = false;
const footprints: NavigationObstacle[] = [
  { id: smelter, bounds: { minX: 192, minY: 112, maxX: 256, maxY: 176 } },
  { id: press, bounds: { minX: 512, minY: 112, maxX: 576, maxY: 176 } },
  { id: 'wall-upper', bounds: { minX: 352, minY: 32, maxX: 384, maxY: 160 } },
  { id: 'wall-lower', bounds: { minX: 352, minY: 256, maxX: 384, maxY: 352 } },
];
const world = new GridTraversal(
  domain,
  (x) =>
    unknown && x >= 13
      ? { status: 'unknown' }
      : { status: 'passable', cost: 1 },
  () => revision,
  () =>
    gate
      ? [
          ...footprints,
          {
            id: 'gate',
            bounds: { minX: 352, minY: 160, maxX: 384, maxY: 256 },
          },
        ]
      : footprints,
);
const operator = new WorkplaceOperator(
  new Movement(new GridNavigator(world, domain), { x: 48, y: 208 }, actor),
  {
    workplace(id) {
      return factory.ids.includes(id) ? places.get(id) : undefined;
    },
    canStand(point) {
      return world.point(point, actor).status === 'passable';
    },
    setPresent(id, present) {
      if (factory.ids.includes(id)) factory.operatorOnSite(id, present);
    },
  },
);
const output = document.querySelector('output')!;
const app = new Rocket({
  fixed: {},
  onError(error) {
    output.textContent = String(error);
  },
});
let state = factory.read();
const scene = app.scene(
  new Scene2D({
    fixedUpdate(dt) {
      operator.reconcile();
      factory.advance(dt);
      operator.update(dt);
    },
    update() {
      state = factory.read();
      diagnostic?.canvas.setAttribute(
        'aria-label',
        state.facilities
          .map(
            (f) =>
              `${f.definitionId}: ${f.jobs[0]?.state}, ${f.attendance.operator ?? 0} operator on site, ${f.jobs[0]?.batchesCompleted ?? 0} batches`,
          )
          .join('; '),
      );
      const s = operator.snapshot();
      output.textContent = `${s.journey?.status ?? 'idle'} · assigned ${s.target ?? 'none'} · present ${s.present ?? 'none'} · tick ${state.summary.tick} · parts ${state.completed}`;
    },
    draw(ctx) {
      for (let y = 0; y < 12; y++)
        for (let x = 0; x < 20; x++) {
          ctx.fillStyle = unknown && x >= 13 ? '#454b63' : '#294a41';
          ctx.fillRect(x * 32, y * 32, 31, 31);
        }
      for (const footprint of gate
        ? [
            ...footprints,
            {
              id: 'gate',
              bounds: { minX: 352, minY: 160, maxX: 384, maxY: 256 },
            },
          ]
        : footprints) {
        const b = footprint.bounds;
        ctx.fillStyle = footprint.id === 'gate' ? '#d99665' : '#9cabb7';
        ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
      }
      for (const [id, p] of places) {
        ctx.fillStyle = '#ffd884';
        ctx.strokeStyle = '#ffd884';
        ctx.strokeRect(p.x - 8, p.y - 8, 16, 16);
        ctx.font = '14px monospace';
        ctx.fillText(id === smelter ? 'Smelter' : 'Press', p.x - 35, 100);
      }
      const route = operator.snapshot().journey?.route;
      ctx.strokeStyle = '#ffd884';
      ctx.beginPath();
      route?.forEach((p, i) =>
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
      );
      ctx.stroke();
      ctx.fillStyle = '#a4f0cc';
      ctx.beginPath();
      ctx.arc(operator.position.x, operator.position.y, 9, 0, Math.PI * 2);
      ctx.fill();
    },
  }),
);
scene.own(factory);
scene.own(operator);
const worldView = app.view({
  target: '#staffing-world',
  scene,
  width: 640,
  height: 384,
});
worldView.canvas.setAttribute(
  'aria-label',
  'Operator route and blocking workplace footprints',
);
let diagnostic: View | undefined;
function addDiagnostic(): View {
  const view = app.view({
    target: '#staffing-diagnostics',
    scene,
    width: 640,
    height: 384,
    overlay(ctx) {
      ctx.fillStyle = '#101b29';
      ctx.fillRect(0, 0, 640, 384);
      ctx.font = '16px monospace';
      ctx.fillStyle = '#d5e6ef';
      ctx.fillText('One operator. One simulation owner.', 20, 30);
      for (const [i, f] of state.facilities.entries()) {
        const y = 70 + i * 75,
          job = f.jobs[0]!;
        ctx.fillText(`${f.definitionId} · ${job.state}`, 20, y);
        ctx.fillText(
          `on site ${f.attendance.operator ?? 0} · ${job.batchesCompleted} batches · ${(job.progress * 100).toFixed(0)}%`,
          20,
          y + 24,
        );
      }
      ctx.fillText(
        `tick ${state.summary.tick} · ${state.completed} parts produced`,
        20,
        315,
      );
      const s = operator.snapshot();
      ctx.fillText(
        `Attendance: ${s.present ?? 'none'} · ${s.journey?.status ?? 'idle'}`,
        20,
        345,
      );
    },
  });
  view.canvas.setAttribute(
    'aria-label',
    'Workshop attendance and production diagnostics',
  );
  return view;
}
diagnostic = addDiagnostic();
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
      } catch (error) {
        output.textContent = String(error);
      }
    },
    { signal: listeners.signal },
  );
}
button('#staffing-smelter', () => {
  operator.assign(smelter);
});
button('#staffing-press', () => {
  operator.assign(press);
});
button('#staffing-off', () => {
  operator.cancel();
});
button('#staffing-retry', () => {
  operator.retry();
});
button('#staffing-gate', (b) => {
  gate = !gate;
  revision++;
  b.textContent = gate ? 'Open gate' : 'Close gate';
});
button('#staffing-unknown', (b) => {
  unknown = !unknown;
  revision++;
  b.textContent = unknown
    ? 'Restore press terrain'
    : 'Make press terrain unknown';
});
button('#staffing-collect', () => {
  factory.collect();
});
button('#staffing-view', (b) => {
  if (diagnostic) {
    diagnostic.dispose();
    diagnostic = undefined;
    b.textContent = 'Reopen diagnostics';
  } else {
    app.stop();
    diagnostic = addDiagnostic();
    void app.start().catch((error: unknown) => {
      output.textContent = String(error);
    });
    b.textContent = 'Close diagnostics';
  }
});
window.addEventListener(
  'pagehide',
  () => {
    void app.dispose();
  },
  { once: true },
);
void app.start().catch((error: unknown) => {
  output.textContent = String(error);
});
