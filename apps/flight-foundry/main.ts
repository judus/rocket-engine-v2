import { Rocket } from '../../src/index.js';
import { Stage2D } from '../../src/experimental/index.js';
import {
  baseline,
  duration,
  FoundryShip,
  parseExperiment,
  serializeExperiment,
  validateProfile,
} from './MotionExperiment.js';
import type { ExperimentProfile, MotionSample } from './MotionExperiment.js';

function element<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing Foundry element: ${selector}`);
  return node;
}
const message = element('#message');
function notify(text: string, error = false): void {
  message.textContent = text;
  message.dataset.error = String(error);
}
function handle(action: () => void): () => void {
  return () => {
    try {
      action();
    } catch (error) {
      notify(error instanceof Error ? error.message : String(error), true);
    }
  };
}
const fields = element('#fields');
const inputs = new Map<keyof ExperimentProfile, HTMLInputElement>();
const syncRanges: (() => void)[] = [];
const definitions: {
  key: keyof ExperimentProfile;
  label: string;
  unit: string;
  min: number;
  max: number;
  log?: boolean;
}[] = [
  {
    key: 'massKg',
    label: 'Ship mass',
    unit: 'kg',
    min: 1e3,
    max: 1e8,
    log: true,
  },
  {
    key: 'thrustN',
    label: 'Engine thrust',
    unit: 'N',
    min: 1e3,
    max: 1e10,
    log: true,
  },
  {
    key: 'initialVelocityMps',
    label: 'Initial velocity',
    unit: 'm/s',
    min: -1000,
    max: 1000,
  },
  { key: 'burnSeconds', label: 'Forward burn', unit: 's', min: 0, max: 30 },
  { key: 'coastSeconds', label: 'Coast', unit: 's', min: 0, max: 30 },
  { key: 'brakeSeconds', label: 'Counter-thrust', unit: 's', min: 0, max: 30 },
  {
    key: 'stepSeconds',
    label: 'Fixed timestep',
    unit: 's',
    min: 0.001,
    max: 1 / 15,
    log: true,
  },
];
function dirty(): void {
  element('#dirty').textContent =
    'Candidate edited. Apply & reset to use it; the current run is unchanged.';
}
for (const def of definitions) {
  const container = document.createElement('div');
  container.className = 'field';
  container.innerHTML = `<label for="${def.key}">${def.label}</label><div class="value-row"><input id="${def.key}" type="text" inputmode="decimal" aria-label="${def.label} (${def.unit})"><span class="unit">${def.unit}</span>${def.key === 'thrustN' ? '<button type="button" class="zero">Zero</button>' : ''}</div><input type="range" min="0" max="1000" step="1" aria-label="${def.label} slider"><div class="bounds"><label>From <input type="text" inputmode="decimal" aria-label="${def.label} slider minimum" value="${def.min}"></label><label>To <input type="text" inputmode="decimal" aria-label="${def.label} slider maximum" value="${def.max}"></label></div><span class="range-note"></span>`;
  fields.append(container);
  const exact = container.querySelector<HTMLInputElement>('.value-row input')!;
  const slider = container.querySelector<HTMLInputElement>('[type=range]')!;
  const bounds = container.querySelectorAll<HTMLInputElement>('.bounds input');
  const note = container.querySelector<HTMLElement>('.range-note')!;
  inputs.set(def.key, exact);
  const range = () =>
    [Number(bounds[0]!.value), Number(bounds[1]!.value)] as const;
  const sync = () => {
    const [low, high] = range();
    const value = Number(exact.value);
    const valid =
      bounds[0]!.value.trim() !== '' &&
      bounds[1]!.value.trim() !== '' &&
      Number.isFinite(low) &&
      Number.isFinite(high) &&
      high > low &&
      (!def.log || low > 0);
    slider.disabled =
      !valid || !Number.isFinite(value) || value < low || value > high;
    if (!slider.disabled)
      slider.value = String(
        1000 *
          (def.log
            ? Math.log(value / low) / Math.log(high / low)
            : (value - low) / (high - low)),
      );
    note.textContent = !valid
      ? 'Invalid exploration range; value unchanged.'
      : slider.disabled
        ? 'Exact value outside slider range. Edit bounds to explore it; value unchanged.'
        : def.log
          ? 'Logarithmic · edit bounds to change magnitude. Exact entry includes zero where allowed.'
          : 'Linear · signed values allowed for velocity.';
  };
  syncRanges.push(sync);
  exact.addEventListener('input', () => {
    dirty();
    sync();
  });
  bounds.forEach((bound) => bound.addEventListener('input', sync));
  slider.addEventListener('input', () => {
    const [low, high] = range();
    const fraction = Number(slider.value) / 1000;
    exact.value = String(
      Number(
        (def.log
          ? low * (high / low) ** fraction
          : low + (high - low) * fraction
        ).toPrecision(8),
      ),
    );
    dirty();
    sync();
  });
  container.querySelector('.zero')?.addEventListener('click', () => {
    exact.value = '0';
    dirty();
    sync();
  });
}
function setFields(profile: Readonly<ExperimentProfile>): void {
  for (const [key, input] of inputs) input.value = String(profile[key]);
  syncRanges.forEach((sync) => sync());
}
function candidate(): Readonly<ExperimentProfile> {
  const values: Record<string, number> = {};
  for (const [key, input] of inputs) {
    if (input.value.trim() === '') throw new Error(`${key} needs a value`);
    values[key] = Number(input.value);
  }
  return validateProfile(values);
}
let applied = validateProfile(baseline);
let ship: FoundryShip;
let engine: Rocket | undefined;
let scene: Stage2D;
let running = false;
let clockTick = 0;
let history: Readonly<MotionSample>[] = [];
let previous:
  | {
      profile: Readonly<ExperimentProfile>;
      history: readonly Readonly<MotionSample>[];
      final: Readonly<MotionSample>;
    }
  | undefined;
let lastPaint = 0;
function record(): void {
  const sample = ship.telemetry;
  const last = history.at(-1);
  if (
    !last ||
    sample.phase === 'complete' ||
    sample.timeSeconds - last.timeSeconds >= duration(applied) / 300
  )
    if (last?.tick !== sample.tick) history.push(sample);
}
function manualStep(): void {
  clockTick++;
  scene.fixedUpdate!(applied.stepSeconds, {
    dt: applied.stepSeconds,
    time: clockTick * applied.stepSeconds,
    tick: clockTick,
  });
  record();
}
function reset(profile: Readonly<ExperimentProfile>): void {
  if (engine) {
    engine.stop();
    if (ship.telemetry.tick > 0)
      previous = {
        profile: applied,
        history: [...history, ship.telemetry],
        final: ship.telemetry,
      };
    // Stop immediately; Rocket queues owned scene cleanup before the next start.
    void engine
      .dispose()
      .catch((error: unknown) => notify(String(error), true));
  }
  running = false;
  applied = profile;
  clockTick = 0;
  lastPaint = 0;
  scene = new Stage2D({
    fixed: true,
    update(dt): undefined {
      record();
      lastPaint += dt;
      if (ship.telemetry.phase === 'complete') {
        engine!.stop();
        running = false;
        paint();
      } else if (lastPaint >= 0.1) {
        lastPaint = 0;
        paint();
      }
    },
  });
  ship = scene.entity(() => new FoundryShip(applied), { id: 'test-ship' });
  engine = new Rocket({
    fixed: { step: applied.stepSeconds, maxSteps: 100 },
    onError(error) {
      running = false;
      engine!.stop();
      notify(String(error), true);
      paint();
    },
  });
  engine.scene(scene, { keepAlive: true });
  history = [ship.telemetry];
  element('#dirty').textContent = 'Candidate matches applied profile.';
  paint();
}
const number = (value: number) =>
  new Intl.NumberFormat('en', {
    maximumSignificantDigits: 6,
    notation:
      Math.abs(value) >= 1e7 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)
        ? 'scientific'
        : 'standard',
  }).format(value);
function paint(): void {
  const s = ship.telemetry;
  const stats = [
    ['Velocity', s.velocityMps, 'm/s'],
    ['Position', s.positionM, 'm'],
    ['Path length', s.distanceM, 'm'],
    ['Applied force', s.forceN, 'N'],
    ['Acceleration', s.accelerationMps2, 'm/s²'],
    ['Ship load', s.g, 'G'],
    ['Elapsed', s.timeSeconds, 's'],
    ['Kinetic energy', s.kineticJ, 'J'],
    ['Completed steps', s.tick, 'ticks'],
  ];
  element('#readings').innerHTML = stats
    .map(
      ([label, value, unit]) =>
        `<div class="reading"><span>${label}</span><strong>${number(value as number)}</strong><small>${unit}</small></div>`,
    )
    .join('');
  element('#state').textContent =
    `${running ? 'RUNNING' : s.phase === 'complete' ? 'COMPLETE' : 'PAUSED'} / ${s.phase}`;
  element<HTMLProgressElement>('#progress').value =
    s.timeSeconds / duration(applied);
  element<HTMLButtonElement>('#run').textContent = running ? 'Pause' : 'Run';
  element<HTMLButtonElement>('#run').disabled = s.phase === 'complete';
  element<HTMLButtonElement>('#step').disabled =
    running || s.phase === 'complete';
  element<HTMLButtonElement>('#finish').disabled =
    running || s.phase === 'complete';
  element('#applied').textContent =
    `Applied: ${number(applied.massKg)} kg · ${number(applied.thrustN)} N · Δt ${number(applied.stepSeconds)} s. ${engine?.fixed ? `Runtime dropped time: ${number(engine.fixed.droppedTime)} s (simulation time is authoritative).` : ''}`;
  element('#history').innerHTML = [...history]
    .slice(-8)
    .reverse()
    .map(
      (p) =>
        `<tr><td>${number(p.timeSeconds)}</td><td>${p.phase}</td><td>${number(p.positionM)}</td><td>${number(p.velocityMps)}</td><td>${number(p.forceN)}</td><td>${number(p.g)}</td></tr>`,
    )
    .join('');
  if (previous)
    element('#comparison').textContent =
      `Previous (${number(previous.profile.massKg)} kg / ${number(previous.profile.thrustN)} N): ${number(previous.final.timeSeconds)} s, ${number(previous.final.velocityMps)} m/s, position ${number(previous.final.positionM)} m. ${previous.final.phase === 'complete' ? 'Completed run.' : 'Partial run.'} Same axes below; compare identical initial conditions when tuning equipment.`;
  const current = [...history, s];
  const all = [...current, ...(previous?.history ?? [])];
  const maxTime = Math.max(
    duration(applied),
    previous ? duration(previous.profile) : 0,
  );
  const minV = Math.min(0, ...all.map((p) => p.velocityMps));
  const maxV = Math.max(1, ...all.map((p) => p.velocityMps));
  const y = (v: number) => 160 - (140 * (v - minV)) / (maxV - minV);
  const path = (points: readonly Readonly<MotionSample>[]) =>
    points
      .map((p) => `${20 + (560 * p.timeSeconds) / maxTime},${y(p.velocityMps)}`)
      .join(' ');
  element('#trace').innerHTML =
    `<line x1="20" x2="580" y1="${y(0)}" y2="${y(0)}" stroke="#344b56"/><polyline points="${previous ? path(previous.history) : ''}" fill="none" stroke="#dfbc87" stroke-width="2" stroke-dasharray="5 5"/><polyline points="${path(current)}" fill="none" stroke="#87e3cd" stroke-width="2"/>`;
  element('#axis').textContent =
    `Time 0–${number(maxTime)} s · velocity ${number(minV)}–${number(maxV)} m/s. Shared, automatically fitted axes; zero line shown.`;
}
function on(id: string, action: () => void): void {
  element(id).addEventListener('click', handle(action));
}
element<HTMLFormElement>('#profile').addEventListener('submit', (event) => {
  event.preventDefault();
  handle(() => {
    reset(candidate());
    notify('Candidate applied. Experiment reset.');
  })();
});
on('#run', () => {
  if (running) {
    engine!.stop();
    running = false;
    paint();
  } else {
    running = true;
    paint();
    void engine!.start().catch((error: unknown) => {
      running = false;
      notify(String(error), true);
      paint();
    });
  }
});
on('#step', () => {
  manualStep();
  paint();
});
on('#finish', () => {
  while (ship.telemetry.phase !== 'complete') manualStep();
  paint();
});
on('#reset', () => {
  reset(applied);
  element('#dirty').textContent =
    'Applied run reset. Candidate edits, if any, remain unapplied.';
});
on('#baseline', () => {
  setFields(baseline);
  dirty();
});
const storageKey = 'rocket.flight-foundry.experiment.v1';
on('#save', () => {
  localStorage.setItem(storageKey, serializeExperiment(candidate()));
  notify('Candidate experiment saved in this browser.');
});
on('#load', () => {
  const text = localStorage.getItem(storageKey);
  if (text === null)
    throw new Error('No experiment saved in this browser yet.');
  const profile = parseExperiment(text);
  setFields(profile);
  reset(profile);
  notify('Saved experiment loaded and reset.');
});
on('#export', () => {
  element<HTMLTextAreaElement>('#json').value =
    serializeExperiment(candidate());
  notify(
    'Experiment JSON ready below. Copy it to keep or share this configuration.',
  );
});
on('#import', () => {
  const profile = parseExperiment(element<HTMLTextAreaElement>('#json').value);
  setFields(profile);
  reset(profile);
  notify('Experiment imported and reset.');
});
window.addEventListener(
  'pagehide',
  () => {
    running = false;
    void engine?.dispose().catch((error: unknown) => console.error(error));
  },
  { once: true },
);
setFields(applied);
reset(applied);
