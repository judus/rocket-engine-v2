import { Rocket, Scene2D, Input } from '../src/index.js';

function element<T extends Element>(selector: string, kind: { new (): T }): T {
  const match = document.querySelector(selector);
  if (!(match instanceof kind)) throw new Error(`Missing ${selector}`);
  return match;
}
const status = element('#fixed-status', HTMLOutputElement);
const pause = element('#fixed-pause', HTMLButtonElement);
const stall = element('#fixed-stall', HTMLButtonElement);
const app = new Rocket({
  fixed: {},
  performance: true,
  onError(error) {
    status.textContent = String(error);
  },
});
const input = app.use(Input);
let x = 80,
  velocity = 90,
  reversals = 0;
const scene = app.scene(
  new Scene2D({
    fixedUpdate(dt) {
      if (controls.fixed.pressed('reverse') || binding.fixedPointer.pressed) {
        velocity = -velocity;
        reversals++;
      }
      x += velocity * dt;
      if (x < 20 || x > 620) {
        x = Math.max(20, Math.min(620, x));
        velocity = -velocity;
      }
    },
    update() {
      const callback = app.performance?.fps,
        render = app.renderPerformance?.fps;
      document.querySelector('#timing-cadence')!.textContent =
        `Callbacks ${callback?.toFixed(1) ?? '…'} FPS · draws ${render?.toFixed(1) ?? '…'} FPS · fixed ticks ${app.fixed!.totalSteps} · simulated ${app.fixed!.time.toFixed(2)} s`;
      const message = `${reversals} input reversals · ${app.running ? 'running' : 'paused'}`;
      if (status.textContent !== message) status.textContent = message;
    },
    draw(ctx) {
      ctx.fillStyle = '#80dbbd';
      ctx.beginPath();
      ctx.arc(x, 90, 12, 0, Math.PI * 2);
      ctx.fill();
    },
  }),
);
const controls = scene.own(input.scope(scene, { reverse: 'Space' }));
const view = app.view({
  target: '#fixed-motion',
  scene,
  width: 640,
  height: 180,
});
view.canvas.setAttribute('aria-label', 'Fixed motion controls');
const binding = controls.bind(view);
const diagnostics = app.scene({
  draw(ctx) {
    const clock = app.fixed;
    if (!clock) return;
    ctx.fillStyle = '#c6d5e6';
    ctx.font = '16px monospace';
    for (const [index, text] of [
      `60 Hz · maximum 5 catch-up steps per frame`,
      `Steps this frame: ${clock.steps} · total: ${clock.totalSteps}`,
      `Simulation: ${clock.time.toFixed(2)}s · remainder: ${clock.alpha.toFixed(2)} steps`,
      `Dropped overload time: ${clock.droppedTime.toFixed(3)}s`,
      `Input reversals: ${reversals} · x: ${x.toFixed(1)}`,
    ].entries())
      ctx.fillText(text, 18, 32 + index * 30);
    const label = `Fixed diagnostics: ${reversals} input reversals, ${clock.droppedTime.toFixed(3)} seconds dropped`;
    if (diagnosticView.canvas.getAttribute('aria-label') !== label)
      diagnosticView.canvas.setAttribute('aria-label', label);
  },
});
const diagnosticView = app.view({
  target: '#fixed-diagnostics',
  scene: diagnostics,
  width: 640,
  height: 180,
});
pause.addEventListener('click', () => {
  if (app.running) {
    app.stop();
    pause.textContent = 'Resume';
    status.textContent = `${reversals} input reversals · paused`;
  } else {
    pause.disabled = true;
    void app
      .start()
      .then(() => {
        pause.disabled = false;
        pause.textContent = 'Pause';
      })
      .catch((error: unknown) => {
        status.textContent = String(error);
        pause.disabled = false;
      });
  }
});
stall.addEventListener('click', () => {
  // Explicit demo action: block one browser task to exercise bounded catch-up.
  const end = performance.now() + 250;
  while (performance.now() < end) {
    /* intentionally stall */
  }
});
element('#fixed-cap', HTMLSelectElement).addEventListener('change', (event) => {
  app.maxFps = Number((event.currentTarget as HTMLSelectElement).value) || null;
});
window.addEventListener(
  'pagehide',
  () => {
    void app.dispose();
  },
  { once: true },
);
await app.start();
