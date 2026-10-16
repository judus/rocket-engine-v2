import { Rocket, Scene2D } from '../../src/index.js';
import { drawFloor, drawDiagnostics } from './FactoryRenderers.js';
import { FactoryDemo } from './FactoryDemo.js';
function element<T extends Element>(selector: string, kind: { new (): T }): T {
  const match = document.querySelector(selector);
  if (!(match instanceof kind)) throw new Error(`Missing ${selector}`);
  return match;
}
const status = element('#factory-status', HTMLOutputElement),
  pause = element('#factory-pause', HTMLButtonElement),
  reset = element('#factory-reset', HTMLButtonElement),
  close = element('#factory-close', HTMLButtonElement),
  collect = element('#factory-collect', HTMLButtonElement),
  toggle = element('#factory-smelter', HTMLButtonElement);
let app: Rocket | undefined;
let paused = false,
  smelterEnabled = true;
async function start() {
  reset.disabled =
    pause.disabled =
    toggle.disabled =
    collect.disabled =
    close.disabled =
      true;
  await app?.dispose();
  paused = false;
  smelterEnabled = true;
  pause.textContent = 'Pause production';
  toggle.textContent = 'Disable smelter';
  const application = new Rocket({
    performance: true,
    onError(error) {
      status.textContent = String(error);
    },
  });
  app = application;
  const factory = new FactoryDemo();
  let state = factory.read();
  const scene = application.scene(
    new Scene2D({
      update(dt) {
        factory.advance(dt);
        state = factory.read();
        const text = `${state.summary.timeSeconds.toFixed(2)} simulated seconds · ${state.summary.tick} Workshop ticks · ${state.advances} advance calls · ${state.completed} parts produced · ${state.collected} collected · ${application.performance?.fps?.toFixed(0) ?? '…'} FPS`;
        if (status.textContent !== text) status.textContent = text;
        collect.disabled = (state.stock.quantities.parts ?? 0) === 0;
        for (const view of [floor, diagnostic])
          if (!view.disposed)
            view.canvas.setAttribute(
              'aria-label',
              `Factory ${view === floor ? 'floor' : 'diagnostics'}: tick ${state.summary.tick}, ${state.completed} parts produced, ${state.stock.quantities.parts ?? 0} parts stored`,
            );
      },
      draw(ctx) {
        if (ctx.canvas === floor.canvas) drawFloor(ctx, state);
        else drawDiagnostics(ctx, state);
      },
    }),
  );
  scene.own(factory);
  const floor = application.view({
    target: '#factory-floor',
    scene,
    width: 640,
    height: 360,
  });
  const diagnostic = application.view({
    target: '#factory-diagnostics',
    scene,
    width: 640,
    height: 360,
  });
  close.disabled = false;
  close.onclick = () => {
    floor.dispose();
    close.disabled = true;
  };
  pause.onclick = () => {
    paused = !paused;
    toggle.disabled = paused;
    if (paused) collect.disabled = true;
    if (paused) application.stop();
    else void application.start().catch(showError);
    pause.textContent = paused ? 'Resume production' : 'Pause production';
  };
  toggle.onclick = () => {
    smelterEnabled = !smelterEnabled;
    factory.enabled(1, smelterEnabled);
    toggle.textContent = smelterEnabled ? 'Disable smelter' : 'Enable smelter';
  };
  collect.onclick = () => {
    factory.collect();
  };
  await application.start();
  reset.disabled = pause.disabled = toggle.disabled = false;
}
function showError(error: unknown) {
  status.textContent = String(error);
  reset.disabled = false;
  pause.disabled = toggle.disabled = collect.disabled = close.disabled = true;
}
reset.onclick = () => {
  void start().catch(showError);
};
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) void app?.dispose().catch(showError);
});
await start().catch(showError);
