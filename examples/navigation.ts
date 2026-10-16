import { Rocket, Scene2D } from '../src/index.js';
import {
  GridTraversal,
  GridNavigator,
  Movement,
  type Journey,
  type NavigationObstacle,
} from '../src/navigation/index.js';
import type { View } from '../src/View.js';
const domain = { minX: 0, minY: 0, columns: 20, rows: 12, tileSize: 32 };
let revision = 0,
  gate = false,
  unknown = false,
  updates = 0;
const walls: NavigationObstacle[] = [
  { id: 'upper-wall', bounds: { minX: 288, minY: 32, maxX: 320, maxY: 144 } },
  { id: 'lower-wall', bounds: { minX: 288, minY: 240, maxX: 320, maxY: 352 } },
];
const world = new GridTraversal(
  domain,
  (x, y, actor) => {
    if (unknown && x >= 12 && x <= 14) return { status: 'unknown' };
    if (
      x >= 3 &&
      x <= 6 &&
      y >= 3 &&
      y <= 7 &&
      !actor.capabilities.includes('swim')
    )
      return { status: 'blocked' };
    return { status: 'passable', cost: y >= 9 ? 3 : 1 };
  },
  () => revision,
  () =>
    gate
      ? [
          ...walls,
          {
            id: 'gate',
            bounds: { minX: 288, minY: 144, maxX: 320, maxY: 240 },
          },
        ]
      : walls,
);
const mover = new Movement(
  new GridNavigator(world, domain),
  { x: 48, y: 192 },
  { radius: 9, clearance: 2, capabilities: ['walk'] },
);
let journey: Journey | undefined;
const output = document.querySelector('output')!;
const app = new Rocket({
  fixed: {},
  onError(error) {
    output.textContent = String(error);
  },
});
function draw(ctx: CanvasRenderingContext2D): void {
  for (let y = 0; y < 12; y++)
    for (let x = 0; x < 20; x++) {
      ctx.fillStyle =
        unknown && x >= 12 && x <= 14
          ? '#454b63'
          : x >= 3 && x <= 6 && y >= 3 && y <= 7
            ? '#285e8d'
            : y >= 9
              ? '#6a593c'
              : '#294a41';
      ctx.fillRect(x * 32, y * 32, 31, 31);
    }
  for (const o of gate
    ? [
        ...walls,
        { id: 'gate', bounds: { minX: 288, minY: 144, maxX: 320, maxY: 240 } },
      ]
    : walls) {
    ctx.fillStyle = o.id === 'gate' ? '#d99665' : '#9cabb7';
    const b = o.bounds;
    ctx.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
  }
  const state = journey?.snapshot();
  if (state) {
    ctx.strokeStyle = '#ffd884';
    ctx.lineWidth = 2;
    ctx.beginPath();
    state.route.forEach((p, i) =>
      i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y),
    );
    ctx.stroke();
    ctx.fillStyle = '#ffd884';
    ctx.fillRect(state.destination.x - 4, state.destination.y - 4, 8, 8);
  }
  ctx.fillStyle = '#a4f0cc';
  ctx.beginPath();
  ctx.arc(mover.position.x, mover.position.y, 9, 0, Math.PI * 2);
  ctx.fill();
}
function drawDiagnostics(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = '#fff';
  ctx.beginPath();
  ctx.arc(mover.position.x, mover.position.y, 11, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = '13px monospace';
  ctx.fillText(`revision ${revision} · fixed updates ${updates}`, 12, 18);
}

const scene = app.scene(
  new Scene2D({
    fixedUpdate(dt) {
      updates++;
      mover.update(dt);
    },
    update() {
      const s = journey?.snapshot();
      output.textContent = `${s?.id ?? 'No journey'} · ${s?.status ?? 'idle'}${s?.reason ? ' / ' + s.reason : ''} · x ${mover.position.x.toFixed(1)}, y ${mover.position.y.toFixed(1)} · ${updates} updates`;
    },
    draw(ctx) {
      draw(ctx);
    },
  }),
);
scene.own(mover);
let second: View | undefined;
function bind(target: string, diagnostic = false): View {
  const view = app.view({
    target,
    scene,
    width: 640,
    height: 384,
    overlay(ctx) {
      if (diagnostic) drawDiagnostics(ctx);
    },
  });
  view.canvas.setAttribute(
    'aria-label',
    target === '#navigation-world'
      ? 'Navigation world; click a destination'
      : 'Navigation clearance and route diagnostics; click a destination',
  );
  const click = (event: MouseEvent) => {
    journey = mover.move({
      destination: view.clientToWorld({ x: event.clientX, y: event.clientY }),
      speed: 90,
      arrivalTolerance: 0.1,
      replan: mode.value === 'manual' ? 'manual' : 'on-change',
    });
  };
  view.canvas.addEventListener('click', click);
  view.own(() => {
    view.canvas.removeEventListener('click', click);
  });
  return view;
}
const mode = document.querySelector<HTMLSelectElement>('#navigation-mode')!;
bind('#navigation-world');
second = bind('#navigation-diagnostics', true);
const listeners = new AbortController();
scene.own(() => {
  listeners.abort();
});
function button(id: string, action: (button: HTMLButtonElement) => void): void {
  const b = document.querySelector<HTMLButtonElement>(id)!;
  b.addEventListener(
    'click',
    () => {
      action(b);
    },
    { signal: listeners.signal },
  );
}
button('#navigation-go', () => {
  journey = mover.move({
    destination: { x: 592, y: 192 },
    speed: 90,
    arrivalTolerance: 0.1,
    replan: mode.value === 'manual' ? 'manual' : 'on-change',
  });
});
button('#navigation-gate', (b) => {
  gate = !gate;
  revision++;
  b.textContent = gate ? 'Open gate' : 'Close gate';
});
button('#navigation-unknown', (b) => {
  unknown = !unknown;
  revision++;
  b.textContent = unknown ? 'Restore terrain data' : 'Make strip unknown';
});
button('#navigation-retry', () => {
  journey?.retry();
});
button('#navigation-cancel', () => {
  journey?.cancel();
});
button('#navigation-view', (b) => {
  if (second) {
    second.dispose();
    second = undefined;
    b.textContent = 'Reopen diagnostic view';
  } else {
    app.stop();
    second = bind('#navigation-diagnostics', true);
    void app.start().catch((error: unknown) => {
      output.textContent = String(error);
    });
    b.textContent = 'Close diagnostic view';
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
