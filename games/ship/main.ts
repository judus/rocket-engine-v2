import { Rocket, Input, flightInput } from '../../src/index.js';
import type { ActionContext } from '../../src/index.js';
import { Stage2D } from '../../src/experimental/index.js';
import { Ship } from './Ship.js';
import { loadShipSetup } from './loadShipSetup.js';
import { createCockpitView } from './CockpitView.js';

function element<T extends HTMLElement>(id: string): T {
  const node = document.querySelector<T>(id);
  if (!node) throw new Error(`Missing game element ${id}`);
  return node;
}
const feedback = element('#flight-feedback'),
  loading = element('#loading'),
  entry = element('#entry');
const fly = element<HTMLButtonElement>('#fly'),
  keyboardFly = element<HTMLButtonElement>('#keyboard-fly'),
  systems = element<HTMLButtonElement>('#systems'),
  help = element<HTMLButtonElement>('#help'),
  dialog = element<HTMLDialogElement>('#controls');
const lifetime = new AbortController();
let runtime: Rocket | undefined;
function fail(error: unknown): void {
  runtime?.stop();
  entry.hidden = false;
  fly.disabled = true;
  keyboardFly.disabled = true;
  loading.textContent = error instanceof Error ? error.message : String(error);
  feedback.textContent = 'Flight unavailable';
}
async function start(): Promise<void> {
  const setup = await loadShipSetup(
    new URL('../../../games/ship/ships/science-ship.json', import.meta.url),
  );
  lifetime.signal.throwIfAborted();
  const engine = new Rocket({
    fixed: { step: 1 / 60, maxSteps: 8 },
    onError: fail,
  });
  runtime = engine;
  let view: Awaited<ReturnType<typeof createCockpitView>> | undefined;
  let actions: ActionContext;
  let binding: ReturnType<ActionContext['bind']>;
  let mouseYaw = 0,
    mousePitch = 0;
  const stage = engine.scene(
    new Stage2D({
      fixed: true,
      fixedUpdate(): undefined {
        const value = (name: string) =>
          actions.enabled ? actions.value(name) : 0;
        const clamp = (v: number) => Math.max(-1, Math.min(1, v));
        ship.control.thrust({
          x: value('right'),
          y: value('up'),
          z: value('forward'),
        });
        ship.control.turn(
          clamp(value('yaw') + (actions.enabled ? mouseYaw : 0)),
        );
        ship.control.pitch(
          clamp(value('pitch') + (actions.enabled ? mousePitch : 0)),
        );
        ship.control.roll(value('roll'));
        ship.mounts.requestFiring(value('fire') > 0);
        return undefined;
      },
      update(dt): undefined {
        view?.update(dt);
        if (!usingSystems)
          feedback.textContent = (
            binding.capture
              ? binding.capture.active
              : document.activeElement === view?.surface.canvas
          )
            ? ''
            : binding.capture?.state === 'error'
              ? 'Mouse capture refused · choose keyboard steering under ?'
              : binding.capture?.state === 'unavailable'
                ? 'Mouse capture is unavailable in this browser'
                : 'Click to fly · Esc releases controls';
        return undefined;
      },
    }),
  );
  const ship = stage.entity(() => new Ship(setup.profile, setup.initialState), {
    id: 'player-ship',
    tags: ['ship', 'player'],
  });
  ship.dampers.requestEnabled(true);
  ship.cooling.requestEnabled(true);
  ship.cargo.requestEnabled(true);
  const input = engine.use(Input);
  let usingSystems = false;
  view = await createCockpitView(
    engine,
    stage,
    ship,
    element('#viewport'),
    lifetime.signal,
    fail,
  );
  const setSystems = (active: boolean) => {
    usingSystems = active;
    actions.setEnabled(!active);
    systems.textContent = active ? 'Return to flight · I' : 'Systems · I';
    systems.setAttribute('aria-pressed', String(active));
    if (active) {
      binding.capture?.release();
      view!.surface.canvas.focus();
      feedback.textContent = 'Systems · click a display · I returns to flight';
    } else actions.activate();
  };
  const configure = (capture: 'focus' | 'pointer-lock') => {
    actions?.dispose();
    actions = input.actions(stage).use({ ...flightInput, capture });
    actions.on('lookX', (event) => {
      mouseYaw = event.cancelled
        ? 0
        : (event.value / Math.max(event.dt, 1e-6)) * 0.1;
      return undefined;
    });
    actions.on('lookY', (event) => {
      mousePitch = event.cancelled
        ? 0
        : (-event.value / Math.max(event.dt, 1e-6)) * 0.1;
      return undefined;
    });
    actions
      .register('dampers', 'press', () => {
        ship.dampers.requestEnabled(!ship.telemetry.dampers.requested);
        return undefined;
      })
      .map('dampers', 'KeyX');
    for (let i = 1; i <= 6; i++)
      actions
        .register(`group${i}`, 'press', () => {
          ship.mounts.selectGroup(`group-${i}`);
          return undefined;
        })
        .map(`group${i}`, `Digit${i}`);
    actions
      .register('systems', 'press', () => {
        setSystems(true);
        return undefined;
      })
      .map('systems', 'KeyI');
    actions
      .register('release', 'press', () => {
        binding.capture?.release();
        view!.surface.canvas.blur();
        return undefined;
      })
      .map('release', 'Escape');
    binding = actions.bind(view!.surface);
  };
  configure('pointer-lock');
  systems.addEventListener('click', () => setSystems(!usingSystems), {
    signal: lifetime.signal,
  });
  document.addEventListener(
    'keydown',
    (event) => {
      if (
        usingSystems &&
        !event.repeat &&
        (event.code === 'KeyI' || event.code === 'Escape')
      ) {
        event.preventDefault();
        setSystems(false);
      }
    },
    { signal: lifetime.signal },
  );
  view.surface.canvas.addEventListener(
    'click',
    (event) => {
      if (usingSystems) view!.click(event);
    },
    { signal: lifetime.signal },
  );
  fly.disabled = false;
  keyboardFly.disabled = false;
  systems.disabled = false;
  loading.textContent = 'Your ship is ready.';
  const enter = (capture: 'focus' | 'pointer-lock') => {
    configure(capture);
    entry.hidden = true;
    dialog.close();
    setSystems(false);
  };
  fly.addEventListener('click', () => enter('pointer-lock'), {
    signal: lifetime.signal,
  });
  keyboardFly.addEventListener('click', () => enter('focus'), {
    signal: lifetime.signal,
  });
  element('#keyboard-mode').addEventListener('click', () => enter('focus'), {
    signal: lifetime.signal,
  });
  element('#mouse-mode').addEventListener(
    'click',
    () => enter('pointer-lock'),
    { signal: lifetime.signal },
  );
  help.addEventListener(
    'click',
    () => {
      binding.capture?.release();
      dialog.showModal();
    },
    { signal: lifetime.signal },
  );
  await engine.start();
}
window.addEventListener(
  'pagehide',
  () => {
    lifetime.abort();
    void runtime?.dispose().catch(fail);
  },
  { once: true },
);
void start().catch(async (error) => {
  fail(error);
  await runtime?.dispose();
});
