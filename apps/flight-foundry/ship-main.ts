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
  const entry = find<HTMLInputElement>('#entry-speed');
  if (entry.value === '' || !entry.checkValidity())
    throw new RangeError(
      'Starting speed must be between -100,000,000 and 100,000,000 m/s',
    );
  const temperature = find<HTMLInputElement>('#entry-temperature');
  if (temperature.value === '' || !temperature.checkValidity())
    throw new RangeError(
      'Starting engine temperature must be at least -273.15 °C and below 999726.85 °C',
    );
  const damperTemperature = find<HTMLInputElement>('#entry-damper-temperature');
  if (damperTemperature.value === '' || !damperTemperature.checkValidity())
    throw new RangeError(
      'Starting damper temperature must be at least -273.15 °C and below 999726.85 °C',
    );
  const reactorTemperature = find<HTMLInputElement>(
    '#entry-reactor-temperature',
  );
  const charge = find<HTMLInputElement>('#entry-charge');
  if (
    reactorTemperature.value === '' ||
    !reactorTemperature.checkValidity() ||
    charge.value === '' ||
    !charge.checkValidity()
  )
    throw new RangeError(
      'Enter a valid reactor temperature and reserve percentage (0–100)',
    );
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
  ship = stage.entity(
    () =>
      new Ship(setup.profile, {
        ...setup.initialState,
        reactorTemperatureK: Number(reactorTemperature.value) + 273.15,
        energyJ: (setup.profile.power.capacityJ * Number(charge.value)) / 100,
        engineTemperatureK: Number(temperature.value) + 273.15,
        damperTemperatureK: Number(damperTemperature.value) + 273.15,
        velocityMps: {
          ...setup.initialState.velocityMps,
          z: Number(find<HTMLInputElement>('#entry-speed').value),
        },
      }),
    {
      id: setup.profile.id,
      tags: ['ship'],
    },
  );
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
  find<HTMLInputElement>('#dampers').checked = false;
  find<HTMLInputElement>('#cooling').checked = false;
  find<HTMLInputElement>('#shields').checked = false;
  find('#message').textContent = '';
  neutral();
  const p = setup.profile;
  find('#installed').textContent =
    `Installed: ${p.body.id} · ${p.power.id} · ${p.engine.id} · ${p.dampers.id} · ${p.cooling.id} · ${p.shields.id} · ${p.hull.id}`;
  find('#ship-specs').textContent =
    `${p.body.massKg.toLocaleString('en')} kg · ${p.engine.maxThrustN / 1e6} MN thrust · ${p.power.reactorOutputW / 1e9} GW reactor · ${p.power.capacityJ / 1e9} GJ reserve capacity. Engine: ${p.engine.baselineW / 1e6} MW baseline + ${p.engine.fullThrustW / 1e9} GW translation + ${p.engine.fullYawW / 1e9} GW yaw. Loaded from JSON; demonstration balance.`;
  find('#damper-specs').textContent =
    `Assisted limit ${p.dampers.capture.assistedSpeedMps} m/s · 95% response ${p.dampers.responseSeconds} s · nominal transmitted load ${p.dampers.capture.transmittedFraction * 100}%. Capture anchor: remove ${p.dampers.capture.referenceExcessMps} m/s in ${p.dampers.capture.referenceDurationSeconds} s; higher entry speeds increase duration and curve steepness. Prototype tuning.`;
  find('#thermal-specs').textContent =
    `Engine thermal capacity ${p.engine.thermal.heatCapacityJPerK / 1e6} MJ/K · ${p.engine.thermal.wasteHeatFraction * 100}% of supplied power becomes module heat · trip ${(p.engine.thermal.tripTemperatureK - 273.15).toFixed(1)} °C / restart below ${(p.engine.thermal.restartTemperatureK - 273.15).toFixed(1)} °C · manual start ${p.engine.thermal.manualStartSeconds} s / thermal reboot ${p.engine.thermal.rebootSeconds} s. Cooling: ${p.cooling.maxCoolingW / 1e6} MW removal, ${(p.cooling.baselineW + p.cooling.fullPowerW) / 1e6} MW full electrical draw.`;
  find('#damper-thermal-specs').textContent =
    `Damper thermal capacity ${p.dampers.thermal.heatCapacityJPerK / 1e6} MJ/K · ${p.dampers.thermal.wasteHeatFraction * 100}% supplied-power losses · trip ${(p.dampers.thermal.tripTemperatureK - 273.15).toFixed(1)} °C / restart below ${(p.dampers.thermal.restartTemperatureK - 273.15).toFixed(1)} °C · manual start ${p.dampers.thermal.manualStartSeconds} s / thermal reboot ${p.dampers.thermal.rebootSeconds} s. The cooler shares one removal budget across reactor, engine and dampers.`;
  find('#shield-specs').textContent =
    `Shields: ${p.shields.capacityJ / 1e9} GJ capacity · ${p.shields.baselineW / 1e6} MW maintenance · ${p.shields.rechargeW / 1e6} MW recharge input at ${p.shields.rechargeEfficiency * 100}% efficiency · ${p.shields.rechargeDelaySeconds} s recharge delay after a hit. Hull: ${p.hull.damageCapacityJ / 1e9} GJ damage capacity. Prototype values; shield heat and emergency energy diversion follow separately.`;
  find('#reactor-specs').textContent =
    `Reactor trip ${(p.power.thermal.tripTemperatureK - 273.15).toFixed(1)} °C / restart below ${(p.power.thermal.restartTemperatureK - 273.15).toFixed(1)} °C · normal thermal reboot ${p.power.thermal.rebootSeconds} s / independent emergency start ${p.power.recovery.emergencyStartSeconds} s · emergency output ${p.power.recovery.emergencyOutputFraction * 100}% until ${(p.power.recovery.restoreReserveFraction * 100).toFixed(1)}% reserve · passive heat loss up to ${p.power.recovery.passiveCoolingW / 1e6} MW. Lab tuning.`;
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
    ['Applied force', fmt(force / 1e6), 'MN'],
    ['Heading', fmt((t.body.yawRadians * 180) / Math.PI), '°'],
    ['Yaw rate', fmt((t.body.yawRateRadps * 180) / Math.PI), '°/s'],
    [
      'Total demand',
      fmt(
        (t.power.startupDemandW +
          t.engine.demandW +
          t.dampers.demandW +
          t.cooling.demandW +
          t.shields.demandW) /
          1e9,
      ),
      'GW',
    ],
    ['Total supplied', fmt(t.power.consumptionW / 1e9), 'GW'],
    ['Ship load', fmt(t.shipG), 'G'],
    ['Crew load', fmt(t.crewG), 'G'],
    ['Reactor temperature', fmt(t.power.thermal.temperatureK - 273.15), '°C'],
    ['Reactor heat', fmt(t.power.thermal.generatedHeatW / 1e6), 'MW'],
    ['Engine temperature', fmt(t.engine.thermal.temperatureK - 273.15), '°C'],
    ['Damper temperature', fmt(t.dampers.thermal.temperatureK - 273.15), '°C'],
    ['Damper heat', fmt(t.dampers.thermal.generatedHeatW / 1e6), 'MW'],
    ['Engine heat', fmt(t.engine.thermal.generatedHeatW / 1e6), 'MW'],
    ['Heat removed', fmt(t.cooling.removedHeatW / 1e6), 'MW'],
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
  find<HTMLProgressElement>('#shield-charge').value =
    t.shields.energyJ / t.shields.capacityJ;
  find<HTMLProgressElement>('#hull-integrity').value =
    t.hull.remainingJ / t.hull.capacityJ;
  find('#shield-state').textContent =
    `Shields ${t.shields.state} · ${t.shields.active ? 'field powered' : 'NO PROTECTION'} · stored ${fmt(t.shields.energyJ / 1e9)} / ${fmt(t.shields.capacityJ / 1e9)} GJ · supply ${fmt(t.shields.suppliedW / 1e6)} MW · recharge delay ${fmt(t.shields.rechargeDelaySeconds)} s.`;
  find('#damage-state').textContent =
    `Hull ${t.hull.breached ? 'BREACHED' : `${fmt((t.hull.remainingJ / t.hull.capacityJ) * 100)}%`} · last hit ${fmt(t.hull.incomingJ / 1e9)} GJ → shields ${fmt(t.hull.shieldAbsorbedJ / 1e9)} / hull ${fmt(t.hull.hullDamageJ / 1e9)} / excess ${fmt(t.hull.excessJ / 1e9)} GJ.`;
  find('#state').textContent = running ? 'RUNNING' : 'PAUSED';
  find<HTMLButtonElement>('#run').textContent = running ? 'Pause' : 'Run';
  find<HTMLButtonElement>('#step').disabled = running;
  find('#power-state').textContent =
    `Reactor ${t.power.state} · ${t.power.requested ? 'requested on' : 'off'} · generation ${fmt(t.power.generationW / 1e9)} GW · engine ${t.engine.state} · operation delivered ${fmt(t.engine.activityFraction * 100)}%. Readings are from tick ${t.tick}.`;
  find('#damper-state').textContent =
    `Dampers ${t.dampers.state} · ${t.dampers.mode} · delivered ${fmt(t.dampers.activityFraction * 100)}% · draw ${fmt(t.dampers.suppliedW / 1e9)} GW · crew receives ${fmt(t.dampers.transmittedFraction * 100)}% of translational load${t.dampers.mode === 'capture' ? ` · capture ${fmt(t.dampers.captureElapsedSeconds)} / ${fmt(t.dampers.captureDurationSeconds)} powered seconds` : ''}.`;
  find('#thermal-state').textContent =
    `Thermal trip ${t.engine.thermal.tripped ? 'latched' : 'clear'} · restart remaining ${fmt(t.engine.thermal.restartRemainingSeconds)} powered seconds · cooling ${t.cooling.state} · delivered ${fmt(t.cooling.activityFraction * 100)}% · draw ${fmt(t.cooling.suppliedW / 1e6)} MW. Engine remembers its requested switch during a trip.`;
  find('#damper-thermal-state').textContent =
    `Damper thermal trip ${t.dampers.thermal.tripped ? 'latched' : 'clear'} · restart remaining ${fmt(t.dampers.thermal.restartRemainingSeconds)} powered seconds. Cooling removes ${fmt(t.cooling.engineRemovedHeatW / 1e6)} MW from engine + ${fmt(t.cooling.damperRemovedHeatW / 1e6)} MW from dampers + ${fmt(t.cooling.reactorRemovedHeatW / 1e6)} MW from reactor within one ${fmt(setup.profile.cooling.maxCoolingW / 1e6)} MW limit.`;
  find('#reactor-state').textContent =
    `Recovery ${t.power.emergency ? 'EMERGENCY' : 'normal'} · restart remaining ${fmt(t.power.thermal.restartRemainingSeconds)} s · propulsion/shields ${t.power.nonessentialAllowed ? 'available' : 'LOCKED until reserve recovers'} · restore threshold ${fmt(t.power.restoreEnergyJ / 1e9)} GJ · starter ${t.power.emergency ? 'independent' : `${fmt(t.power.startupSuppliedW / 1e6)} MW from reserve`} · reactor passive cooling ${fmt(t.power.passiveRemovedHeatW / 1e6)} MW + circuit ${fmt(t.cooling.reactorRemovedHeatW / 1e6)} MW.`;
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
        `<tr><td>${fmt(r.timeSeconds)}</td><td>${fmt(Math.hypot(r.body.velocityMps.x, r.body.velocityMps.y, r.body.velocityMps.z))}</td><td>${r.power.state} / ${fmt(r.power.thermal.temperatureK - 273.15)} °C</td><td>${r.engine.state} / ${fmt(r.engine.thermal.temperatureK - 273.15)} °C</td><td>${r.dampers.state} / ${r.dampers.mode} / ${fmt(r.dampers.thermal.temperatureK - 273.15)} °C</td><td>${fmt(r.crewG)}</td><td>${fmt(r.engine.activityFraction * 100)}</td><td>${fmt(r.power.energyJ / 1e9)}</td><td>${fmt(r.power.consumptionW / 1e9)}</td></tr>`,
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
find('#dampers').addEventListener('change', () =>
  ship.dampers.requestEnabled(find<HTMLInputElement>('#dampers').checked),
);
find('#cooling').addEventListener('change', () =>
  ship.cooling.requestEnabled(find<HTMLInputElement>('#cooling').checked),
);
find('#shields').addEventListener('change', () =>
  ship.shields.requestEnabled(find<HTMLInputElement>('#shields').checked),
);
for (const [id, energyJ] of [
  ['hit-small', 2e9],
  ['hit-large', 12e9],
] as const) {
  find(`#${id}`).addEventListener('click', () => {
    ship.hull.hit(energyJ);
    find('#message').textContent =
      `Queued ${energyJ / 1e9} GJ hit for the next simulation step.`;
  });
}
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
find('#reset').addEventListener('click', () => {
  try {
    reset();
  } catch (error) {
    fail(error);
  }
});
find('#emergency-test').addEventListener('click', () => {
  find<HTMLInputElement>('#entry-charge').value = '0';
  find<HTMLInputElement>('#entry-reactor-temperature').value = String(
    setup.profile.power.thermal.tripTemperatureK - 273.15 + 5,
  );
  find<HTMLInputElement>('#entry-speed').value = '1000';
  find<HTMLInputElement>('#entry-temperature').value = '20';
  find<HTMLInputElement>('#entry-damper-temperature').value = '20';
  reset();
  find<HTMLInputElement>('#cooling').checked = true;
  ship.cooling.requestEnabled(true);
  find<HTMLInputElement>('#dampers').checked = true;
  ship.dampers.requestEnabled(true);
  find<HTMLInputElement>('#forward').value = '100';
  commands();
});
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
    find<HTMLInputElement>('#entry-speed').value = String(
      loaded.initialState.velocityMps.z,
    );
    find<HTMLInputElement>('#entry-temperature').value = String(
      loaded.initialState.engineTemperatureK - 273.15,
    );
    find<HTMLInputElement>('#entry-damper-temperature').value = String(
      loaded.initialState.damperTemperatureK - 273.15,
    );
    find<HTMLInputElement>('#entry-reactor-temperature').value = String(
      loaded.initialState.reactorTemperatureK - 273.15,
    );
    find<HTMLInputElement>('#entry-charge').value = String(
      (loaded.initialState.energyJ / loaded.profile.power.capacityJ) * 100,
    );
    reset();
    find('#ship-ui').inert = false;
  })
  .catch(fail);
