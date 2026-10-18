import {
  defaultCurves,
  FlightCurves,
  standardGravity,
} from './FlightCurves.js';
import type { CurvePoint, CurveProfile } from './FlightCurves.js';

function find<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing curve control: ${selector}`);
  return element;
}
interface Field {
  key: keyof CurveProfile;
  label: string;
  unit: string;
  factor?: number;
  low: number;
  high: number;
  log?: boolean;
  shape?: boolean;
  advanced?: boolean;
}
const fields: readonly Field[] = [
  {
    key: 'cruiseMps',
    label: 'Cruise speed',
    unit: 'km/s',
    factor: 1000,
    low: 0.05,
    high: 10_000,
    log: true,
  },
  {
    key: 'crewTargetG',
    label: 'Crew-load target',
    unit: 'G',
    low: 0,
    high: 10,
  },
  {
    key: 'accelerationSeconds',
    label: 'Time to cruise',
    unit: 's',
    low: 0.1,
    high: 60,
  },
  {
    key: 'decelerationSeconds',
    label: 'Time to arrive',
    unit: 's',
    low: 0.1,
    high: 60,
  },
  {
    key: 'accelerationShape',
    label: 'Acceleration curve',
    unit: '',
    low: -1,
    high: 1,
    shape: true,
  },
  {
    key: 'decelerationShape',
    label: 'Braking curve',
    unit: '',
    low: -1,
    high: 1,
    shape: true,
  },
  {
    key: 'initialMps',
    label: 'Starting speed',
    unit: 'km/s',
    factor: 1000,
    low: 0,
    high: 50,
    advanced: true,
  },
  {
    key: 'arrivalMps',
    label: 'Arrival speed',
    unit: 'km/s',
    factor: 1000,
    low: 0,
    high: 5,
    advanced: true,
  },
  {
    key: 'coastSeconds',
    label: 'Coast between transitions',
    unit: 's',
    low: 0,
    high: 120,
    advanced: true,
  },
];
const exact = new Map<keyof CurveProfile, HTMLInputElement>();
const refreshFields: (() => void)[] = [];
const error = find('#curve-error');
const scrubber = find<HTMLInputElement>('#inspect-time');
let model = new FlightCurves(defaultCurves);
let sampled = model.samples();
const fmt = (n: number) =>
  new Intl.NumberFormat('en', {
    maximumSignificantDigits: 5,
    notation:
      n !== 0 && (Math.abs(n) < 0.001 || Math.abs(n) >= 1e7)
        ? 'scientific'
        : 'standard',
  }).format(n);
const percent = (n: number) =>
  n < 100 && n > 99.999999
    ? '>99.999999'
    : new Intl.NumberFormat('en', { maximumFractionDigits: 6 }).format(n);
function shapeLabel(n: number): string {
  if (Math.abs(n) < 0.01) return 'Constant acceleration';
  return `${n < 0 ? 'Stronger early' : 'Stronger late'} · ${Math.round(Math.abs(n) * 100)}%`;
}
for (const field of fields) {
  const section = document.createElement('div');
  section.className = 'curve-field';
  const id = `curve-${field.key}`;
  section.innerHTML = `<label for="${id}">${field.label}<span class="label-value">${field.shape ? '<output class="shape-value"></output>' : `<input id="${id}" type="number" step="any" aria-label="${field.label}"><span class="unit">${field.unit}</span>`}</span></label><input ${field.shape ? `id="${id}"` : ''} type="range" min="0" max="1000" step="1" aria-label="${field.label} shape or range"><div class="shape-labels">${field.shape ? '<span>Strong early</span><span>Constant</span><span>Strong late</span>' : `<span>${field.low} ${field.unit}</span><span>${field.high} ${field.unit}</span>`}</div><p class="input-note"></p>`;
  find(field.advanced ? '#advanced-controls' : '#curve-controls').append(
    section,
  );
  const slider = section.querySelector<HTMLInputElement>('[type=range]')!;
  const input =
    section.querySelector<HTMLInputElement>('[type=number]') ?? slider;
  exact.set(field.key, input);
  const note = section.querySelector<HTMLElement>('.input-note')!;
  function sync(): void {
    const value = Number(input.value);
    if (field.shape) {
      section.querySelector('output')!.textContent = shapeLabel(
        field.low + (value / 1000) * (field.high - field.low),
      );
      return;
    }
    slider.disabled =
      input.value === '' ||
      !Number.isFinite(value) ||
      value < field.low ||
      value > field.high;
    if (!slider.disabled)
      slider.value = String(
        1000 *
          (field.log
            ? Math.log(value / field.low) / Math.log(field.high / field.low)
            : (value - field.low) / (field.high - field.low)),
      );
    note.textContent = slider.disabled
      ? 'Exact value outside this slider range; the graph still accepts valid values.'
      : field.log
        ? 'Log slider for broad speed exploration. Exact entry above.'
        : '';
  }
  refreshFields.push(sync);
  slider.addEventListener('input', () => {
    if (!field.shape) {
      const u = Number(slider.value) / 1000;
      input.value = String(
        Number(
          (field.log
            ? field.low * (field.high / field.low) ** u
            : field.low + (field.high - field.low) * u
          ).toPrecision(7),
        ),
      );
    }
    sync();
    updateModel();
  });
  if (!field.shape)
    input.addEventListener('input', () => {
      sync();
      updateModel();
    });
}
function restore(): void {
  for (const field of fields) {
    const input = exact.get(field.key)!;
    input.value = String(
      field.shape
        ? ((defaultCurves[field.key] - field.low) / (field.high - field.low)) *
            1000
        : defaultCurves[field.key] / (field.factor ?? 1),
    );
  }
  refreshFields.forEach((sync) => sync());
  scrubber.value = '0';
  updateModel();
}
function updateModel(): void {
  try {
    const profile = {} as CurveProfile;
    for (const field of fields) {
      const input = exact.get(field.key)!;
      if (input.value.trim() === '')
        throw new Error(
          `${field.label} needs a value. Previous valid graphs remain shown.`,
        );
      const n = Number(input.value);
      profile[field.key] = field.shape
        ? field.low + (n / 1000) * (field.high - field.low)
        : n * (field.factor ?? 1);
    }
    model = new FlightCurves(profile);
    sampled = model.samples();
    error.textContent = '';
  } catch (cause) {
    error.textContent = `${cause instanceof Error ? cause.message : String(cause)}. Graphs still show the previous valid settings.`;
    return;
  }
  render();
}
function plot(
  id: string,
  pick: (p: CurvePoint) => number,
  low: number,
  high: number,
  color: string,
  reference?: number,
): void {
  const left = 48,
    right = 686,
    top = 12,
    bottom = 111;
  const x = (time: number) =>
    left + ((right - left) * time) / model.totalSeconds;
  const y = (value: number) =>
    bottom - ((bottom - top) * (value - low)) / (high - low);
  const path = sampled.map((p) => `${x(p.time)},${y(pick(p))}`).join(' ');
  const p = model.profile;
  const boundaries = [
    p.accelerationSeconds,
    p.accelerationSeconds + p.coastSeconds,
  ];
  const cursor = (Number(scrubber.value) / 1000) * model.totalSeconds;
  find(id).innerHTML =
    `<g fill="#8ca4b2" font-size="9" font-family="system-ui"><text x="2" y="16">${fmt(high)}</text><text x="2" y="113">${fmt(low)}</text><text x="48" y="132">0 s</text><text x="686" y="132" text-anchor="end">${fmt(model.totalSeconds)} s</text></g><line x1="48" x2="686" y1="${y(0)}" y2="${y(0)}" stroke="#38525f"/>${boundaries.map((t) => `<line x1="${x(t)}" x2="${x(t)}" y1="12" y2="111" stroke="#2a3c47" stroke-dasharray="3 4"/>`).join('')}${reference !== undefined ? `<line x1="48" x2="686" y1="${y(reference)}" y2="${y(reference)}" stroke="#a0a8b0" stroke-dasharray="4 4"/>` : ''}<polyline fill="none" stroke="${color}" stroke-width="2" points="${path}"/><line x1="${x(cursor)}" x2="${x(cursor)}" y1="12" y2="111" stroke="#e2edf2" stroke-opacity=".5"/>`;
}
function render(): void {
  const p = model.profile;
  const peakCrew = Math.min(model.peakShipG, p.crewTargetG);
  find('#curve-summary').innerHTML = [
    ['Total maneuver', `${fmt(model.totalSeconds)} s`],
    ['Peak ship load', `${fmt(model.peakShipG)} G`],
    ['Peak suppression', `${percent(model.peakSuppressionPercent)}%`],
  ]
    .map(
      ([label, value]) =>
        `<div><span>${label}</span><strong>${value}</strong></div>`,
    )
    .join('');
  find('#journey-context').textContent =
    `This maneuver covers ${fmt(model.totalDistanceM / 1000)} km. Two minutes at cruise alone covers ${fmt((p.cruiseMps * 120) / 1000)} km. Ideal protection keeps peak crew load to ${fmt(peakCrew)} G; power and equipment limits are not modeled.`;
  const initialLabel =
    p.initialMps > p.cruiseMps ? 'Capture to cruise' : 'Accelerate';
  const arrivalLabel =
    p.arrivalMps > p.cruiseMps ? 'Accelerate to arrival' : 'Brake';
  find('#phases').innerHTML =
    `<span style="flex:${p.accelerationSeconds}">${initialLabel} · ${fmt(p.accelerationSeconds)} s</span>${p.coastSeconds > 0 ? `<span style="flex:${p.coastSeconds}">Coast · ${fmt(p.coastSeconds)} s</span>` : ''}<span style="flex:${p.decelerationSeconds}">${arrivalLabel} · ${fmt(p.decelerationSeconds)} s</span>`;
  const peakSpeed = Math.max(p.initialMps, p.cruiseMps, p.arrivalMps) / 1000;
  const peakShip = Math.max(1, model.peakShipG) * 1.08;
  const peakCrewScale = Math.max(0.1, p.crewTargetG, peakCrew) * 1.08;
  find('#speed-scale').textContent =
    `km/s · 0–${fmt(Math.max(0.1, peakSpeed))}`;
  find('#ship-scale').textContent =
    'G · positive accelerates / negative brakes';
  find('#crew-scale').textContent =
    `G magnitude · dashed target ${fmt(p.crewTargetG)} G`;
  plot(
    '#speed-plot',
    (point) => point.speedMps / 1000,
    0,
    Math.max(0.1, peakSpeed),
    '#87e3cd',
  );
  plot(
    '#ship-plot',
    (point) => point.accelerationMps2 / standardGravity,
    -peakShip,
    peakShip,
    '#e7b185',
  );
  plot(
    '#crew-plot',
    (point) => point.idealCrewG,
    0,
    peakCrewScale,
    '#b6a5e9',
    p.crewTargetG,
  );
  plot(
    '#protection-plot',
    (point) => point.suppressionPercent,
    0,
    100,
    '#78bedc',
  );
  const current = model.at(
    (Number(scrubber.value) / 1000) * model.totalSeconds,
  );
  find('#inspect-label').textContent =
    `${fmt(current.time)} / ${fmt(model.totalSeconds)} s`;
  find('#point-readings').textContent =
    `${fmt(current.speedMps / 1000)} km/s · ${fmt(current.positionM / 1000)} km travelled · ship ${fmt(current.shipG)} G → crew ${fmt(current.idealCrewG)} G · cancel ${fmt(current.cancelledG)} G (${percent(current.suppressionPercent)}%)`;
}
scrubber.addEventListener('input', render);
find('#restore').addEventListener('click', restore);
restore();
