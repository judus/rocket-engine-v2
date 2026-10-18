import type { HealthReading } from '../../games/ship/ModuleHealth.js';
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
  const shieldTemperature = find<HTMLInputElement>('#entry-shield-temperature');
  if (shieldTemperature.value === '' || !shieldTemperature.checkValidity())
    throw new RangeError(
      'Enter a valid shield temperature (at least -273.15 °C)',
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
        shieldTemperatureK: Number(shieldTemperature.value) + 273.15,
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
    `${p.body.massKg.toLocaleString('en')} kg · ${p.engine.maxThrustN / 1e6} MN thrust · ${p.power.reactorOutputW / 1e9} GW reactor · ${p.power.capacityJ / 1e9} GJ reserve capacity. Engine: ${p.engine.baselineW / 1e6} MW baseline + ${p.engine.fullThrustW / 1e9} GW translation + ${p.engine.fullYawW / 1e9} GW yaw. Reactor health ${p.power.health.maxPoints} HP; output follows health fraction raised to ${p.power.health.outputExponent}. Engine health ${p.engine.health.maxPoints} HP; output follows health fraction raised to ${p.engine.health.outputExponent}. Loaded from JSON; demonstration balance.`;
  find('#damper-specs').textContent =
    `Assisted limit ${p.dampers.capture.assistedSpeedMps} m/s · 95% response ${p.dampers.responseSeconds} s · nominal transmitted load ${p.dampers.capture.transmittedFraction * 100}%. Capture anchor: remove ${p.dampers.capture.referenceExcessMps} m/s in ${p.dampers.capture.referenceDurationSeconds} s; higher entry speeds increase duration and curve steepness. Prototype tuning.`;
  find('#thermal-specs').textContent =
    `Engine thermal capacity ${p.engine.thermal.heatCapacityJPerK / 1e6} MJ/K · ${p.engine.thermal.wasteHeatFraction * 100}% of supplied power becomes module heat · trip ${(p.engine.thermal.tripTemperatureK - 273.15).toFixed(1)} °C / restart below ${(p.engine.thermal.restartTemperatureK - 273.15).toFixed(1)} °C · manual start ${p.engine.thermal.manualStartSeconds} s / thermal reboot ${p.engine.thermal.rebootSeconds} s. Cooling: ${p.cooling.maxCoolingW / 1e6} MW removal, ${(p.cooling.baselineW + p.cooling.fullPowerW) / 1e6} MW full electrical draw.`;
  find('#damper-thermal-specs').textContent =
    `Damper thermal capacity ${p.dampers.thermal.heatCapacityJPerK / 1e6} MJ/K · ${p.dampers.thermal.wasteHeatFraction * 100}% supplied-power losses · trip ${(p.dampers.thermal.tripTemperatureK - 273.15).toFixed(1)} °C / restart below ${(p.dampers.thermal.restartTemperatureK - 273.15).toFixed(1)} °C · manual start ${p.dampers.thermal.manualStartSeconds} s / thermal reboot ${p.dampers.thermal.rebootSeconds} s. The cooler shares one removal budget across reactor, engine, dampers and shields.`;
  find('#shield-specs').textContent =
    `Shields: ${p.shields.capacityJ / 1e9} GJ capacity · ${p.shields.baselineW / 1e6} MW maintenance · ${p.shields.rechargeW / 1e6} MW recharge input at ${p.shields.rechargeEfficiency * 100}% efficiency · ${p.shields.rechargeDelaySeconds} s recharge delay after a hit. Hull: ${p.hull.damageCapacityJ / 1e9} GJ damage capacity. Diversion: ${p.shields.diversionW / 1e9} GJ/s from shields at ${p.shields.diversionEfficiency * 100}% efficiency. Shields trip at ${(p.shields.thermal.tripTemperatureK - 273.15).toFixed(1)} °C, restart below ${(p.shields.thermal.restartTemperatureK - 273.15).toFixed(1)} °C; ${p.shields.thermal.manualStartSeconds} s manual start / ${p.shields.thermal.rebootSeconds} s thermal reboot. Prototype tuning.`;
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
    ['Ship load', fmt(t.shipG), 'G'],
    ['Crew load', fmt(t.crewG), 'G'],
  ];
  find('#ship-readings').innerHTML = data
    .map(
      ([label, value, unit]) =>
        `<div class="reading"><span>${label}</span><strong>${value}</strong><small>${unit}</small></div>`,
    )
    .join('');
  find('#simulation-state').textContent =
    `Simulation ${fmt(t.timeSeconds)} s · tick ${t.tick}`;
  const totalDemandW =
    t.power.startupDemandW +
    t.engine.demandW +
    t.dampers.demandW +
    t.cooling.demandW +
    t.shields.demandW;
  const electrical = (suppliedW: number, demandW: number) =>
    `${fmt(suppliedW / 1e6)} / ${fmt(demandW / 1e6)} MW<small>supplied / requested</small>`;
  const thermal = (
    temperatureK: number,
    generatedW: number,
    removedW: number,
  ) =>
    `${fmt(temperatureK - 273.15)} °C<small>+${fmt(generatedW / 1e6)} MW generated<br>−${fmt(removedW / 1e6)} MW removed</small>`;
  const healthCell = (health: Readonly<HealthReading>) =>
    `${fmt(health.fraction * 100)}%<small>${fmt(health.points)} / ${fmt(health.maxPoints)} HP<br>${fmt(health.outputFraction * 100)}% output capacity</small>`;
  const requested = (on: boolean) => `requested ${on ? 'on' : 'off'}`;
  const modules = [
    [
      'Reactor',
      `<strong>${t.power.state}</strong><small>${requested(t.power.requested)} · restart ${fmt(t.power.thermal.restartRemainingSeconds)} s</small>`,
      `${fmt(t.power.generationW / 1e6)} MW output<small>starter: ${fmt(t.power.startupSuppliedW / 1e6)} / ${fmt(t.power.startupDemandW / 1e6)} MW</small>`,
      thermal(
        t.power.thermal.temperatureK,
        t.power.thermal.generatedHeatW,
        t.power.passiveRemovedHeatW + t.cooling.reactorRemovedHeatW,
      ),
    ],
    [
      'Engine',
      `<strong>${t.engine.state}</strong><small>${requested(t.engine.requested)} · restart ${fmt(t.engine.thermal.restartRemainingSeconds)} s</small>`,
      electrical(t.engine.suppliedW, t.engine.demandW),
      thermal(
        t.engine.thermal.temperatureK,
        t.engine.thermal.generatedHeatW,
        t.cooling.engineRemovedHeatW,
      ),
    ],
    [
      'Inertia dampers',
      `<strong>${t.dampers.state}</strong><small>${requested(t.dampers.requested)} · ${t.dampers.mode}<br>restart ${fmt(t.dampers.thermal.restartRemainingSeconds)} s</small>`,
      electrical(t.dampers.suppliedW, t.dampers.demandW),
      thermal(
        t.dampers.thermal.temperatureK,
        t.dampers.thermal.generatedHeatW,
        t.cooling.damperRemovedHeatW,
      ),
    ],
    [
      'Cooling',
      `<strong>${t.cooling.state}</strong><small>${requested(t.cooling.requested)}</small>`,
      electrical(t.cooling.suppliedW, t.cooling.demandW),
      `${fmt(t.cooling.removedHeatW / 1e6)} MW removed<small>shared cooling circuit</small>`,
    ],
    [
      'Shields',
      `<strong>${t.shields.state}</strong><small>${requested(t.shields.requested)}${t.shields.thermal.tripped ? ' · thermal trip' : ''} · ${t.shields.active ? 'field powered' : 'no protection'}<br>recharge delay ${fmt(t.shields.rechargeDelaySeconds)} s · restart ${fmt(t.shields.thermal.restartRemainingSeconds)} s</small>`,
      `${fmt(t.shields.energyJ / 1e9)} / ${fmt(t.shields.capacityJ / 1e9)} GJ stored<small>${fmt(t.shields.suppliedW / 1e6)} / ${fmt(t.shields.demandW / 1e6)} MW supplied / requested</small>`,
      thermal(
        t.shields.thermal.temperatureK,
        t.shields.thermal.generatedHeatW,
        t.cooling.shieldRemovedHeatW,
      ),
    ],
  ];
  find('#module-readings').innerHTML = modules
    .map(
      ([name, state, energy, heat]) =>
        `<tr><th scope="row">${name}</th><td>${state}</td><td>${energy}</td><td>${heat}</td><td>${name === 'Engine' ? healthCell(t.engine.health) : name === 'Reactor' ? healthCell(t.power.health) : '—'}</td></tr>`,
    )
    .join('');
  find('#module-totals').innerHTML =
    `<tr><th scope="row">Ship total</th><td>${t.power.emergency ? 'Emergency recovery' : 'Normal power'}</td><td>${electrical(t.power.consumptionW, totalDemandW)}</td><td>${fmt(t.cooling.removedHeatW / 1e6)} MW circuit<small>+ ${fmt(t.power.passiveRemovedHeatW / 1e6)} MW passive removal</small></td><td>—</td></tr>`;
  find('#reserve-reading').textContent =
    `${fmt(t.power.energyJ / 1e9)} / ${fmt(t.power.capacityJ / 1e9)} GJ stored`;
  find<HTMLProgressElement>('#reserve').value =
    t.power.energyJ / t.power.capacityJ;
  find<HTMLProgressElement>('#shield-charge').value =
    t.shields.energyJ / t.shields.capacityJ;
  find<HTMLProgressElement>('#hull-integrity').value =
    t.hull.remainingJ / t.hull.capacityJ;
  find('#shield-state').textContent =
    `Shields ${t.shields.state} · ${t.shields.active ? 'field powered' : 'NO PROTECTION'} · stored ${fmt(t.shields.energyJ / 1e9)} / ${fmt(t.shields.capacityJ / 1e9)} GJ · supply ${fmt(t.shields.suppliedW / 1e6)} MW · recharge delay ${fmt(t.shields.rechargeDelaySeconds)} s.`;
  const shieldCommands = ship.shields.telemetry;
  find<HTMLInputElement>('#shields').checked = shieldCommands.requested;
  find<HTMLButtonElement>('#divert-shields').disabled =
    shieldCommands.diverting ||
    shieldCommands.energyJ === 0 ||
    shieldCommands.thermal.tripped;
  find<HTMLButtonElement>('#cancel-diversion').disabled =
    !shieldCommands.diverting;
  find('#diversion-state').textContent =
    `Diversion ${t.shields.diverting ? 'ACTIVE — no protection' : 'idle'} · last/current transfer: drawn ${fmt(t.shields.divertedJ / 1e9)} GJ → reserve ${fmt(t.shields.diversionReceivedJ / 1e9)} GJ · conversion loss ${fmt(t.shields.diversionLostJ / 1e9)} GJ. This tick received ${fmt(t.power.receivedEnergyJ / 1e9)} GJ.`;
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
    `Damper thermal trip ${t.dampers.thermal.tripped ? 'latched' : 'clear'} · restart remaining ${fmt(t.dampers.thermal.restartRemainingSeconds)} powered seconds. Cooling removes ${fmt(t.cooling.engineRemovedHeatW / 1e6)} MW from engine + ${fmt(t.cooling.damperRemovedHeatW / 1e6)} MW from dampers + ${fmt(t.cooling.reactorRemovedHeatW / 1e6)} MW from reactor + ${fmt(t.cooling.shieldRemovedHeatW / 1e6)} MW from shields within one ${fmt(setup.profile.cooling.maxCoolingW / 1e6)} MW limit.`;
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
for (const [prefix, module, label] of [
  ['engine', (ship: Ship) => ship.engine, 'Engine'],
  ['reactor', (ship: Ship) => ship.power, 'Reactor'],
] as const) {
  for (const [action, repair, points] of [
    ['damage', false, 25],
    ['fail', false, 'max'],
    ['repair', true, 25],
    ['restore', true, 'max'],
  ] as const) {
    find(`#${action}-${prefix}`).addEventListener('click', () => {
      const target = module(ship);
      const amount =
        points === 'max' ? target.profile.health.maxPoints : points;
      if (repair) target.repair(amount);
      else target.damage(amount);
      find('#message').textContent =
        `${label} ${repair ? 'repair' : 'damage'} queued. Run or Single step applies it.`;
    });
  }
}
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
find('#divert-shields').addEventListener('click', () => {
  ship.shields.startDiversion();
  find('#message').textContent =
    'Diversion requested. Shields switched off. Run or Single step advances the transfer.';
  paint();
});
find('#cancel-diversion').addEventListener('click', () => {
  ship.shields.cancelDiversion();
  find('#message').textContent =
    'Diversion cancelled. Shields remain off until enabled.';
  paint();
});
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
  find<HTMLInputElement>('#entry-shield-temperature').value = '20';
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
    find<HTMLInputElement>('#entry-shield-temperature').value = String(
      loaded.initialState.shieldTemperatureK - 273.15,
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
