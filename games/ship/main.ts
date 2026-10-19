import { Rocket, Input, createVirtualCornerPreset } from '../../src/index.js';
import type { ActionContext } from '../../src/index.js';
import { Stage2D, SceneNavigator } from '../../src/experimental/index.js';
import { Ship } from './Ship.js';
import { loadShipSetup } from './loadShipSetup.js';
import { createCockpitView } from './CockpitView.js';
import {
  controlPreset,
  virtualMode,
  defaultControls,
  readControls,
  bindingLabel,
} from './ControlSettings.js';
import { VideoPanel } from './VideoPanel.js';
import {
  defaultVideo,
  readVideo,
  migrateVideoStorage,
} from './VideoSettings.js';
import { SettingsPanel } from './SettingsPanel.js';
import { normalizeInputBinding } from '../../src/Input.js';

function element<T extends HTMLElement>(id: string): T {
  const node = document.querySelector<T>(id);
  if (!node) throw new Error(`Missing game element ${id}`);
  return node;
}
const feedback = element('#flight-feedback'),
  loading = element('#loading'),
  entry = element('#entry');
const fly = element<HTMLButtonElement>('#fly'),
  systems = element<HTMLButtonElement>('#systems'),
  menuButton = element<HTMLButtonElement>('#menu-button'),
  settingsButton = element<HTMLButtonElement>('#open-settings'),
  settingsRoot = element('#settings-scene'),
  touch = element('#touch-controls');
const lifetime = new AbortController();
let runtime: Rocket | undefined;
function fail(error: unknown): void {
  runtime?.stop();
  entry.hidden = false;
  fly.disabled = true;
  settingsButton.disabled = true;
  settingsRoot.hidden = true;
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
  const touchFirst = window.matchMedia('(pointer: coarse)').matches;
  let preferences = defaultControls();
  const activeVirtualMode = () => virtualMode(preferences, touchFirst);
  let controlPreferenceError = '';
  let videoPreferenceError = '';
  const preferenceError = () =>
    [controlPreferenceError, videoPreferenceError].filter(Boolean).join(' ');
  try {
    preferences = readControls(localStorage);
  } catch (error) {
    controlPreferenceError = `Saved controls could not be loaded: ${error instanceof Error ? error.message : String(error)}. Restore defaults in Settings to replace them.`;
  }
  let videoPreferences = defaultVideo();
  try {
    migrateVideoStorage(localStorage);
    videoPreferences = readVideo(localStorage);
  } catch (error) {
    videoPreferenceError = `Saved video settings could not be loaded: ${error instanceof Error ? error.message : String(error)}. Apply valid Video settings to replace them.`;
  }
  let launched = false;
  const stage = new Stage2D({
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
      ship.control.turn(clamp(value('yaw') + (actions.enabled ? mouseYaw : 0)));
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
            ? 'Mouse capture refused · choose Keyboard in Menu → Settings'
            : binding.capture?.state === 'unavailable'
              ? 'Mouse capture is unavailable in this browser'
              : 'Click to fly · Esc opens menu';
      return undefined;
    },
  });
  const ship = stage.entity(() => new Ship(setup.profile, setup.initialState), {
    id: 'player-ship',
    tags: ['ship', 'player'],
  });
  ship.dampers.requestEnabled(true);
  ship.cooling.requestEnabled(true);
  ship.cargo.requestEnabled(true);
  const input = engine.use(Input);
  let usingSystems = false;
  const navigator = engine
    .scene(
      new SceneNavigator({
        fixed: true,
        onChange() {
          engine.refreshScenes();
          const inFlight = navigator.current === 'flight';
          actions.setEnabled(inFlight && !usingSystems);
          element('#viewport').inert = !inFlight;
          entry.hidden = navigator.current !== 'menu';
          settingsRoot.hidden = navigator.current !== 'settings';
          touch.hidden =
            !inFlight || activeVirtualMode() === 'off' || usingSystems;
          element<HTMLElement>('nav').hidden = !inFlight;
          feedback.hidden = !inFlight;
          if (!inFlight) {
            binding.capture?.release();
            view!.surface.canvas.blur();
            mouseYaw = mousePitch = 0;
            ship.control.clear();
            ship.mounts.requestFiring(false);
            if (navigator.current === 'settings') {
              panel.open();
              videoPanel.open();
              selectSettingsPage('controls');
              element<HTMLButtonElement>('#settings-back').focus();
            } else fly.focus();
          }
          return undefined;
        },
      }),
    )
    .add('flight', { create: () => stage, retain: true })
    .add('menu', { create: () => new Stage2D(), retain: true })
    .add('settings', { create: () => new Stage2D(), retain: true });
  view = await createCockpitView(
    engine,
    navigator,
    stage,
    ship,
    element('#viewport'),
    lifetime.signal,
    () => videoPreferences,
    fail,
  );
  const setSystems = (active: boolean) => {
    usingSystems = active;
    touch.hidden = active || activeVirtualMode() === 'off';
    actions.setEnabled(!active);
    systems.textContent = active
      ? 'Return to flight'
      : `Systems · ${bindingLabel(preferences.bindings.systems!)}`;
    systems.setAttribute('aria-pressed', String(active));
    if (active) {
      binding.capture?.release();
      view!.surface.canvas.focus();
      feedback.textContent =
        'Systems · click a display · Return to flight to steer';
    } else actions.activate();
  };
  const configure = () => {
    actions?.dispose();
    actions = input.actions(stage).use(controlPreset(preferences, touchFirst));
    mouseYaw = mousePitch = 0;
    actions.on('lookX', (event) => {
      mouseYaw = event.cancelled
        ? 0
        : (event.value / Math.max(event.dt, 1e-6)) *
          0.1 *
          preferences.sensitivity;
      return undefined;
    });
    actions.on('lookY', (event) => {
      mousePitch = event.cancelled
        ? 0
        : (-event.value / Math.max(event.dt, 1e-6)) *
          0.1 *
          preferences.sensitivity *
          (preferences.invertPitch ? -1 : 1);
      return undefined;
    });
    actions
      .register('dampers', 'press', () => {
        ship.dampers.requestEnabled(!ship.telemetry.dampers.requested);
        return undefined;
      })
      .map('dampers', preferences.bindings.dampers!);
    for (let i = 1; i <= 6; i++)
      actions
        .register(`group${i}`, 'press', () => {
          ship.mounts.selectGroup(`group-${i}`);
          return undefined;
        })
        .map(`group${i}`, preferences.bindings[`group${i}`]!);
    actions
      .register('systems', 'press', () => {
        setSystems(true);
        return undefined;
      })
      .map('systems', preferences.bindings.systems!);
    actions.register('release', 'press', () => {
      navigate('menu');
      return undefined;
    });
    binding = actions.bind(view!.surface);
    const mode = activeVirtualMode();
    if (mode !== 'off') {
      const corners = createVirtualCornerPreset(
        {
          sticks: [
            { label: 'Thrust', x: 'right', y: 'forward' },
            { label: 'Rotate', x: 'yaw', y: 'pitch' },
          ],
          buttons: [
            { label: 'Up', action: 'up' },
            { label: 'Down', action: 'up', value: -1 },
            { label: 'Roll left', action: 'roll', value: -1 },
            { label: 'Roll right', action: 'roll' },
            { label: 'Fire', action: 'fire' },
            { label: 'Dampers', action: 'dampers' },
            { label: 'Displays', action: 'systems' },
            { label: 'Menu', action: 'release' },
          ],
        },
        mode,
      );
      for (const corner of [corners.left, corners.right])
        actions.virtual({
          target: touch,
          corner,
          theme: { color: '#fff', opacity: 0.5 },
        });
    }
    actions.setEnabled(false);
  };
  const navigate = (route: string) => {
    actions.setEnabled(false);
    binding.capture?.release();
    void navigator.run(route).catch(fail);
  };
  const panel = new SettingsPanel(
    settingsRoot,
    () => preferences,
    (settings) => {
      preferences = settings;
      configure();
      controlPreferenceError = '';
      loading.textContent =
        preferenceError() ||
        (launched ? 'Flight paused.' : 'Your ship is ready.');
    },
    lifetime.signal,
  );
  const videoPanel = new VideoPanel(
    settingsRoot,
    () => videoPreferences,
    (settings) => {
      videoPreferences = settings;
      videoPreferenceError = '';
      loading.textContent =
        preferenceError() ||
        (launched ? 'Flight paused.' : 'Your ship is ready.');
    },
    element('#settings-status'),
    () => ({
      width: element('#viewport').clientWidth,
      height: element('#viewport').clientHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    }),
    lifetime.signal,
  );
  const selectSettingsPage = (page: 'controls' | 'video') => {
    panel.cancel();
    for (const name of ['controls', 'video'] as const) {
      const active = page === name;
      element(`#${name}-page`).hidden = !active;
      element(`#${name}-buttons`).hidden = !active;
      const tab = element<HTMLButtonElement>(`#${name}-tab`);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
  };
  for (const page of ['controls', 'video'] as const) {
    const tab = element(`#${page}-tab`);
    tab.addEventListener('click', () => selectSettingsPage(page), {
      signal: lifetime.signal,
    });
    tab.addEventListener(
      'keydown',
      (event) => {
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.code)) {
          event.preventDefault();
          const next =
            event.code === 'Home'
              ? 'controls'
              : event.code === 'End'
                ? 'video'
                : page === 'controls'
                  ? 'video'
                  : 'controls';
          selectSettingsPage(next);
          element(`#${next}-tab`).focus();
        }
      },
      { signal: lifetime.signal },
    );
  }
  configure();
  systems.addEventListener('click', () => setSystems(!usingSystems), {
    signal: lifetime.signal,
  });
  document.addEventListener(
    'keydown',
    (event) => {
      if (event.repeat || navigator.current !== 'flight') return;
      if (event.code === 'Escape') {
        event.preventDefault();
        navigate('menu');
      } else if (
        usingSystems &&
        normalizeInputBinding(preferences.bindings.systems!).some(
          (button) =>
            button.code === event.code &&
            button.modifiers.every(
              (modifier) =>
                ({
                  Control: event.ctrlKey,
                  Shift: event.shiftKey,
                  Alt: event.altKey,
                  Meta: event.metaKey,
                })[modifier],
            ),
        )
      ) {
        event.preventDefault();
        setSystems(false);
      }
    },
    { signal: lifetime.signal },
  );
  settingsRoot.addEventListener(
    'keydown',
    (event) => {
      if (event.code === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        navigate('menu');
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
  settingsButton.disabled = false;
  systems.disabled = false;
  menuButton.disabled = false;
  loading.textContent = preferenceError() || 'Your ship is ready.';
  fly.addEventListener(
    'click',
    () => {
      launched = true;
      fly.textContent = 'Resume flight';
      loading.textContent = preferenceError() || 'Flight paused.';
      element('#menu-note').textContent =
        'Your ship is held here while the menu is open.';
      usingSystems = false;
      systems.textContent = `Systems · ${bindingLabel(preferences.bindings.systems!)}`;
      systems.setAttribute('aria-pressed', 'false');
      void navigator
        .run('flight')
        .then(() => actions.activate())
        .catch(fail);
    },
    { signal: lifetime.signal },
  );
  settingsButton.addEventListener('click', () => navigate('settings'), {
    signal: lifetime.signal,
  });
  menuButton.addEventListener('click', () => navigate('menu'), {
    signal: lifetime.signal,
  });
  element('#settings-back').addEventListener(
    'click',
    () => {
      panel.cancel();
      navigate('menu');
    },
    { signal: lifetime.signal },
  );
  await navigator.run('flight');
  await navigator.run('menu');
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
