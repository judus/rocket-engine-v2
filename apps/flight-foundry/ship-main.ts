import { Rocket } from '../../src/index.js';
import { Stage2D } from '../../src/experimental/index.js';
import { Ship } from '../../games/ship/Ship.js';
import { loadShipSetup } from '../../games/ship/loadShipSetup.js';
import type { ShipSetup } from '../../games/ship/ShipProfiles.js';
import type { ShipTelemetry } from '../../games/ship/ShipMovement.js';

function find<T extends HTMLElement>(id: string): T {
  const node = document.querySelector<T>(id);
  if (!node) throw new Error(`Missing ship lab element ${id}`);
  return node;
}
let setup: Readonly<ShipSetup>;
let runtime: Rocket | undefined;
let stage: Stage2D;
let ship: Ship;
let running = false;
let renderElapsed = 0;
let rows: Readonly<ShipTelemetry>[] = [];
let lastHistoryTime = 0;
const commandIds = ['forward', 'strafe', 'vertical', 'yaw'] as const;
function commands(): void {
  const value = (id: string) =>
    Number(find<HTMLInputElement>(`#${id}`).value) / 100;
  ship.control.thrust({
    x: value('strafe'),
    y: value('vertical'),
    z: value('forward'),
  });
  ship.control.turn(value('yaw'));
  for (const id of commandIds)
    find(`#${id}-value`).textContent = `${Math.round(value(id) * 100)}%`;
}
function neutral(): void {
  for (const id of commandIds) find<HTMLInputElement>(`#${id}`).value = '0';
  commands();
}
function fail(error: unknown): void {
  running = false;
  runtime?.stop();
  const message = find('#message');
  message.dataset.error = 'true';
  message.textContent = error instanceof Error ? error.message : String(error);
}
function reset(): void {
  runtime?.stop();
  if (runtime) void runtime.dispose().catch(fail);
  running = false;
  stage = new Stage2D({
    fixed: true,
    update(dt): undefined {
      renderElapsed += dt;
      if (renderElapsed >= 0.1) {
        renderElapsed = 0;
        paint();
      }
    },
  });
  ship = stage.entity(() => new Ship(setup.profile, setup.initialState), {
    id: setup.profile.id,
    tags: ['ship'],
  });
  runtime = new Rocket({
    fixed: { step: 1 / 60, maxSteps: 12 },
    onError: fail,
  });
  runtime.scene(stage, { keepAlive: true });
  rows = [];
  lastHistoryTime = -1;
  renderElapsed = 0;
  find<HTMLInputElement>('#engine').checked = true;
  find<HTMLInputElement>('#reactor').checked = true;
  find('#message').textContent = '';
  neutral();
  const p = setup.profile;
  find('#installed').textContent =
    `Installed: ${p.body.id} · ${p.power.id} · ${p.engine.id}`;
  find('#ship-specs').textContent =
    `${p.body.massKg.toLocaleString('en')} kg · ${p.engine.maxThrustN / 1e6} MN thrust · ${p.power.reactorOutputW / 1e9} GW reactor · ${p.power.capacityJ / 1e9} GJ reserve capacity. Engine: ${p.engine.baselineW / 1e6} MW baseline + ${p.engine.fullThrustW / 1e9} GW translation + ${p.engine.fullYawW / 1e9} GW yaw. Loaded from JSON; demonstration balance.`;
  paint();
}
const fmt = (value: number) =>
  new Intl.NumberFormat('en', { maximumFractionDigits: 3 }).format(value);
const vector = (v: {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}) => `X ${fmt(v.x)} / Y ${fmt(v.y)} / Z ${fmt(v.z)}`;
function paint(): void {
  const t = ship.telemetry;
  const speed = Math.hypot(
    t.body.velocityMps.x,
    t.body.velocityMps.y,
    t.body.velocityMps.z,
  );
  const force = Math.hypot(t.worldForceN.x, t.worldForceN.y, t.worldForceN.z);
  const data = [
    ['Speed', fmt(speed), 'm/s'],
    ['Applied thrust', fmt(force / 1e6), 'MN'],
    ['Heading', fmt((t.body.yawRadians * 180) / Math.PI), '°'],
    ['Yaw rate', fmt((t.body.yawRateRadps * 180) / Math.PI), '°/s'],
    ['Demand', fmt(t.engine.demandW / 1e9), 'GW'],
    ['Supplied', fmt(t.engine.suppliedW / 1e9), 'GW'],
    ['Reserve', fmt(t.power.energyJ / 1e9), 'GJ'],
    ['Simulation time', fmt(t.timeSeconds), 's'],
    ['Completed steps', String(t.tick), 'ticks'],
  ];
  find('#ship-readings').innerHTML = data
    .map(
      ([label, value, unit]) =>
        `<div class="reading"><span>${label}</span><strong>${value}</strong><small>${unit}</small></div>`,
    )
    .join('');
  find<HTMLProgressElement>('#reserve').value =
    t.power.energyJ / t.power.capacityJ;
  find('#state').textContent = running ? 'RUNNING' : 'PAUSED';
  find<HTMLButtonElement>('#run').textContent = running ? 'Pause' : 'Run';
  find<HTMLButtonElement>('#step').disabled = running;
  find('#power-state').textContent =
    `Reactor ${t.power.requested ? 'requested on' : 'off'} · generation ${fmt(t.power.generationW / 1e9)} GW · engine ${t.engine.state} · operation delivered ${fmt(t.engine.activityFraction * 100)}%. Readings are from tick ${t.tick}.`;
  find('#vectors').textContent =
    `Position (m): ${vector(t.body.positionM)}\nVelocity (m/s): ${vector(t.body.velocityMps)}\nAcceleration (m/s²): ${vector(t.body.accelerationMps2)}`;
  if (t.timeSeconds - lastHistoryTime >= 0.5) {
    rows.push(t);
    rows = rows.slice(-10);
    lastHistoryTime = t.timeSeconds;
  }
  find('#ship-history').innerHTML = [...rows]
    .reverse()
    .map(
      (r) =>
        `<tr><td>${fmt(r.timeSeconds)}</td><td>${fmt(Math.hypot(r.body.velocityMps.x, r.body.velocityMps.y, r.body.velocityMps.z))}</td><td>${r.engine.state}</td><td>${fmt(r.engine.activityFraction * 100)}</td><td>${fmt(r.power.energyJ / 1e9)}</td><td>${fmt(r.power.consumptionW / 1e9)}</td></tr>`,
    )
    .join('');
}
for (const id of commandIds) find(`#${id}`).addEventListener('input', commands);
find('#reactor').addEventListener('change', () =>
  ship.power.requestEnabled(find<HTMLInputElement>('#reactor').checked),
);
find('#engine').addEventListener('change', () =>
  ship.engine.requestEnabled(find<HTMLInputElement>('#engine').checked),
);
find('#forward-full').addEventListener('click', () => {
  neutral();
  find<HTMLInputElement>('#forward').value = '100';
  commands();
});
find('#reverse-full').addEventListener('click', () => {
  neutral();
  find<HTMLInputElement>('#forward').value = '-100';
  commands();
});
find('#neutral').addEventListener('click', neutral);
find('#reset').addEventListener('click', reset);
find('#run').addEventListener('click', () => {
  if (running) {
    runtime!.stop();
    running = false;
    paint();
  } else {
    running = true;
    paint();
    void runtime!.start().catch(fail);
  }
});
find('#step').addEventListener('click', () => {
  try {
    const dt = 1 / 60;
    stage.fixedUpdate!(dt, {
      dt,
      tick: ship.telemetry.tick + 1,
      time: ship.telemetry.timeSeconds + dt,
    });
    paint();
  } catch (error) {
    fail(error);
  }
});
window.addEventListener(
  'pagehide',
  () => {
    void runtime?.dispose().catch(fail);
  },
  { once: true },
);
find('#message').textContent =
  'Loading ship definition and equipment profiles…';
void loadShipSetup(
  new URL('../../games/ship/ships/science-ship.json', window.location.href),
)
  .then((loaded) => {
    setup = loaded;
    reset();
    find('#ship-ui').inert = false;
  })
  .catch(fail);
