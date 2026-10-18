import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadShipSetup } from '../games/ship/loadShipSetup.js';
import type { ProfileFetch } from '../games/ship/loadShipSetup.js';
import { Ship } from '../games/ship/Ship.js';
import {
  validateBodyProfile,
  validateEngineProfile,
  validatePowerProfile,
} from '../games/ship/ShipProfiles.js';
import { starterSetup } from './helpers/shipSetup.js';

const manifestUrl = new URL(
  'https://ship.test/games/ship/ships/science-ship.json',
);
function fixtures(): Map<string, unknown> {
  return new Map([
    ...['shields-starter', 'structure-starter', 'mounts-starter'].map(
      (id): [string, unknown] => [
        `profiles/${id}.json`,
        JSON.parse(
          readFileSync(`games/ship/profiles/${id}.json`, 'utf8'),
        ) as unknown,
      ],
    ),
    [
      'profiles/cargo-starter.json',
      JSON.parse(
        readFileSync('games/ship/profiles/cargo-starter.json', 'utf8'),
      ) as unknown,
    ],
    [
      'profiles/cooling-starter.json',
      JSON.parse(
        readFileSync('games/ship/profiles/cooling-starter.json', 'utf8'),
      ) as unknown,
    ],
    [
      'profiles/dampers-starter.json',
      JSON.parse(
        readFileSync('games/ship/profiles/dampers-starter.json', 'utf8'),
      ) as unknown,
    ],
    [
      'ships/science-ship.json',
      JSON.parse(
        readFileSync('games/ship/ships/science-ship.json', 'utf8'),
      ) as unknown,
    ],
    [
      'profiles/hull-starter.json',
      JSON.parse(
        readFileSync('games/ship/profiles/hull-starter.json', 'utf8'),
      ) as unknown,
    ],
    [
      'profiles/reactor-starter.json',
      JSON.parse(
        readFileSync('games/ship/profiles/reactor-starter.json', 'utf8'),
      ) as unknown,
    ],
    [
      'profiles/engine-starter.json',
      JSON.parse(
        readFileSync('games/ship/profiles/engine-starter.json', 'utf8'),
      ) as unknown,
    ],
  ]);
}
function transport(
  files: Map<string, unknown>,
  calls: string[] = [],
): ProfileFetch {
  return async (url) => {
    calls.push(url.pathname);
    const key = url.pathname.replace('/games/ship/', '');
    return files.has(key)
      ? new Response(JSON.stringify(files.get(key)))
      : new Response('', { status: 404 });
  };
}
function changed(
  files: Map<string, unknown>,
  path: string,
  values: Record<string, unknown>,
): void {
  files.set(path, {
    ...(files.get(path) as Record<string, unknown>),
    ...values,
  });
}
void test('Actual JSON loadout produces the typed installed equipment and separate initial state', () => {
  assert.equal(starterSetup.profile.cooling.id, 'cooling-starter');
  assert.equal(starterSetup.initialState.engineHealthPoints, 100);
  assert.equal(starterSetup.initialState.reactorHealthPoints, 100);
  assert.equal(starterSetup.initialState.coolingHealthPoints, 100);
  assert.ok(Object.isFrozen(starterSetup.profile.cooling.health));
  assert.ok(Object.isFrozen(starterSetup.profile.power.health));
  assert.ok(Object.isFrozen(starterSetup.profile.engine.health));
  assert.equal(starterSetup.initialState.shieldTemperatureK, 293.15);
  assert.ok(Object.isFrozen(starterSetup.profile.shields.thermal));
  assert.equal(starterSetup.initialState.engineTemperatureK, 293.15);
  assert.equal(starterSetup.initialState.reactorTemperatureK, 293.15);
  assert.ok(Object.isFrozen(starterSetup.profile.power.recovery));
  assert.equal(starterSetup.initialState.damperTemperatureK, 293.15);
  assert.ok(Object.isFrozen(starterSetup.profile.dampers.thermal));
  assert.ok(Object.isFrozen(starterSetup.profile.engine.thermal));
  assert.equal(starterSetup.profile.dampers.id, 'dampers-starter');
  assert.ok(Object.isFrozen(starterSetup.profile.dampers.capture));
  assert.equal(starterSetup.profile.engine.id, 'engine-starter');
  assert.equal(starterSetup.profile.power.id, 'reactor-starter');
  assert.equal(starterSetup.profile.body.id, 'hull-starter');
  assert.equal(starterSetup.profile.engine.maxThrustN, 1e6);
  assert.equal(starterSetup.initialState.energyJ, 100e9);
  assert.ok(!('initialEnergyJ' in starterSetup.profile.power));
  assert.ok(Object.isFrozen(starterSetup.profile.engine));
  assert.ok(Object.isFrozen(starterSetup.initialState.velocityMps));
});
void test('One immutable equipment definition can initialize independently charged moving ships', () => {
  const first = new Ship(starterSetup.profile, {
    cargoPocketId: 'test-pocket',
    cargoTemperatureK: 290,
    cargoHealthPoints: 100,
    shieldHealthPoints: 100,
    damperHealthPoints: 100,
    coolingHealthPoints: 100,
    reactorHealthPoints: 100,
    engineHealthPoints: 100,
    shieldTemperatureK: 290,
    reactorTemperatureK: 290,
    damperTemperatureK: 293.15,
    engineTemperatureK: 293.15,
    energyJ: 1e9,
    velocityMps: { x: 1, y: 2, z: 3 },
  });
  const second = new Ship(starterSetup.profile, {
    cargoPocketId: 'test-pocket',
    cargoTemperatureK: 290,
    cargoHealthPoints: 100,
    shieldHealthPoints: 100,
    damperHealthPoints: 100,
    coolingHealthPoints: 100,
    reactorHealthPoints: 100,
    engineHealthPoints: 100,
    shieldTemperatureK: 290,
    reactorTemperatureK: 290,
    damperTemperatureK: 293.15,
    engineTemperatureK: 293.15,
    energyJ: 70e9,
    velocityMps: { x: 0, y: 0, z: 0 },
  });
  first.power.requestEnabled(false);
  first.engine.requestEnabled(false);
  first.fixedUpdate(1, { dt: 1, time: 1, tick: 1 });
  assert.deepEqual(first.telemetry.body.positionM, { x: 1, y: 2, z: 3 });
  assert.equal(first.telemetry.power.energyJ, 1e9);
  assert.equal(second.telemetry.power.energyJ, 70e9);
  assert.equal(first.engine.profile.id, second.engine.profile.id);
  assert.equal(starterSetup.initialState.energyJ, 100e9);
  first.dispose();
  second.dispose();
});
void test('Loadout boundary rejects missing/unknown properties and numeric strings', async () => {
  for (const [path, values] of [
    ['profiles/engine-starter.json', { fullThrustW: '20000000000' }],
    ['profiles/engine-starter.json', { unrecognizedModifier: 2 }],
    [
      'profiles/engine-starter.json',
      { health: { maxPoints: 0, outputExponent: 1 } },
    ],
    [
      'profiles/engine-starter.json',
      { health: { maxPoints: 100, outputExponent: '1' } },
    ],
    [
      'ships/science-ship.json',
      {
        initialState: { ...starterSetup.initialState, engineHealthPoints: 101 },
      },
    ],
    ['profiles/reactor-starter.json', { initialEnergyJ: 100 }],
    [
      'profiles/reactor-starter.json',
      { health: { maxPoints: 0, outputExponent: 1 } },
    ],
    [
      'profiles/reactor-starter.json',
      { health: { maxPoints: 100, outputExponent: '1' } },
    ],
    [
      'ships/science-ship.json',
      {
        initialState: {
          ...starterSetup.initialState,
          reactorHealthPoints: 101,
        },
      },
    ],
    [
      'profiles/reactor-starter.json',
      {
        recovery: {
          ...starterSetup.profile.power.recovery,
          emergencyStartSeconds: 8,
        },
      },
    ],
    [
      'profiles/reactor-starter.json',
      {
        recovery: {
          ...starterSetup.profile.power.recovery,
          passiveCoolingW: 0,
        },
      },
    ],
    ['profiles/hull-starter.json', { massKg: -1 }],
    ['profiles/shields-starter.json', { rechargeEfficiency: 1.1 }],
    ['profiles/shields-starter.json', { diversionW: 0 }],
    [
      'profiles/shields-starter.json',
      {
        thermal: {
          ...starterSetup.profile.shields.thermal,
          wasteHeatFraction: 1.1,
        },
      },
    ],
    [
      'profiles/shields-starter.json',
      {
        thermal: {
          ...starterSetup.profile.shields.thermal,
          restartTemperatureK: 290,
        },
      },
    ],
    ['profiles/shields-starter.json', { diversionEfficiency: 0 }],
    ['profiles/shields-starter.json', { diversionEfficiency: 1.01 }],
    ['profiles/shields-starter.json', { restartEnergyJ: 201e9 }],
    ['profiles/structure-starter.json', { damageCapacityJ: 0 }],
    ['profiles/cooling-starter.json', { restartEnergyJ: 201e9 }],
    ['profiles/cooling-starter.json', { sinkTemperatureK: 350 }],
    ['profiles/cooling-starter.json', { fullPowerW: '5' }],
    [
      'profiles/cooling-starter.json',
      { health: { maxPoints: 0, outputExponent: 1 } },
    ],
    [
      'profiles/cooling-starter.json',
      { health: { maxPoints: 100, outputExponent: '1' } },
    ],
    [
      'ships/science-ship.json',
      {
        initialState: {
          ...starterSetup.initialState,
          coolingHealthPoints: 101,
        },
      },
    ],
    [
      'profiles/engine-starter.json',
      {
        thermal: {
          ...starterSetup.profile.engine.thermal,
          wasteHeatFraction: 2,
        },
      },
    ],
    ['profiles/dampers-starter.json', { responseSeconds: '3' }],
    [
      'profiles/dampers-starter.json',
      {
        thermal: {
          ...starterSetup.profile.dampers.thermal,
          restartTemperatureK: 400,
        },
      },
    ],
    [
      'profiles/dampers-starter.json',
      {
        thermal: {
          ...starterSetup.profile.dampers.thermal,
          restartTemperatureK: 290,
        },
      },
    ],
    ['profiles/dampers-starter.json', { restartEnergyJ: 201e9 }],
    [
      'profiles/dampers-starter.json',
      { capture: { transmittedFraction: 0.01 } },
    ],
  ] as const) {
    const files = fixtures();
    changed(files, path, values);
    await assert.rejects(loadShipSetup(manifestUrl, transport(files)));
  }
  const files = fixtures();
  const engine = files.get('profiles/engine-starter.json') as Record<
    string,
    unknown
  >;
  delete engine.maxThrustN;
  await assert.rejects(
    loadShipSetup(manifestUrl, transport(files)),
    /missing maxThrustN/,
  );
});
void test('Equipment references cannot escape the profile directory or silently select a different id', async () => {
  const files = fixtures(),
    calls: string[] = [];
  changed(files, 'ships/science-ship.json', { engineProfile: '../other' });
  await assert.rejects(
    loadShipSetup(manifestUrl, transport(files, calls)),
    /identifier/,
  );
  assert.equal(calls.length, 1);
  const mismatch = fixtures();
  changed(mismatch, 'profiles/engine-starter.json', { id: 'different-engine' });
  await assert.rejects(
    loadShipSetup(manifestUrl, transport(mismatch)),
    /does not match/,
  );
});
void test('Loadout rejects incompatible restart energy and invalid initial state before creating a ship', async () => {
  const incompatible = fixtures();
  changed(incompatible, 'profiles/engine-starter.json', {
    restartEnergyJ: 201e9,
  });
  await assert.rejects(
    loadShipSetup(manifestUrl, transport(incompatible)),
    /restartEnergyJ/,
  );
  for (const initialState of [
    {
      cargoPocketId: 'test-pocket',
      cargoTemperatureK: 290,
      cargoHealthPoints: 100,
      shieldHealthPoints: 100,
      damperHealthPoints: 100,
      coolingHealthPoints: 100,
      reactorHealthPoints: 100,
      engineHealthPoints: 100,
      shieldTemperatureK: 290,
      reactorTemperatureK: 290,
      damperTemperatureK: 293.15,
      engineTemperatureK: 293.15,
      energyJ: 201e9,
      velocityMps: { x: 0, y: 0, z: 0 },
    },
    {
      cargoPocketId: 'test-pocket',
      cargoTemperatureK: 290,
      cargoHealthPoints: 100,
      shieldHealthPoints: 100,
      damperHealthPoints: 100,
      coolingHealthPoints: 100,
      reactorHealthPoints: 100,
      engineHealthPoints: 100,
      shieldTemperatureK: 290,
      reactorTemperatureK: 290,
      damperTemperatureK: 293.15,
      engineTemperatureK: 293.15,
      energyJ: 100,
      velocityMps: { x: 0, y: '0', z: 0 },
    },
    {
      cargoPocketId: 'test-pocket',
      cargoTemperatureK: 290,
      cargoHealthPoints: 100,
      shieldHealthPoints: 100,
      damperHealthPoints: 100,
      coolingHealthPoints: 100,
      reactorHealthPoints: 100,
      engineHealthPoints: 100,
      shieldTemperatureK: 290,
      reactorTemperatureK: 290,
      damperTemperatureK: 293.15,
      engineTemperatureK: 293.15,
      energyJ: 100,
      velocityMps: { x: 0, y: 0, z: 0 },
      other: true,
    },
  ]) {
    const files = fixtures();
    changed(files, 'ships/science-ship.json', { initialState });
    await assert.rejects(loadShipSetup(manifestUrl, transport(files)));
  }
});
void test('Missing files and malformed JSON fail visibly without compiled-in profile fallbacks', async () => {
  const files = fixtures();
  files.delete('profiles/engine-starter.json');
  await assert.rejects(
    loadShipSetup(manifestUrl, transport(files)),
    /engine-starter.json: HTTP 404/,
  );
  await assert.rejects(
    loadShipSetup(manifestUrl, async () => new Response('{broken')),
    /Invalid JSON.*science-ship.json/,
  );
});
void test('Successful profile edits are reflected in the loaded ship rather than hardcoded defaults', async () => {
  const files = fixtures();
  changed(files, 'profiles/engine-starter.json', { maxThrustN: 2e6 });
  const setup = await loadShipSetup(manifestUrl, transport(files));
  const ship = new Ship(setup.profile, setup.initialState);
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  ship.fixedUpdate(1 / 60, { dt: 1 / 60, time: 1 / 60, tick: 1 });
  assert.equal(ship.telemetry.worldForceN.z, 2e6);
  assert.equal(ship.telemetry.body.accelerationMps2.z, 20);
  ship.dispose();
});
void test('Public profile validators reject nonfinite values and invalid equipment ids', () => {
  assert.throws(() =>
    validateEngineProfile({ ...starterSetup.profile.engine, fullThrustW: NaN }),
  );
  assert.throws(() =>
    validatePowerProfile({
      ...starterSetup.profile.power,
      capacityJ: Infinity,
    }),
  );
  assert.throws(() =>
    validateBodyProfile({ ...starterSetup.profile.body, id: '' }),
  );
  assert.throws(() => validateBodyProfile([]));
});
