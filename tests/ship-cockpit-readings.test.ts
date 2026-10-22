import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship } from '../games/farwake/Ship.js';
import { cockpitReadings } from '../games/farwake/CockpitReadings.js';
import { starterSetup } from './helpers/shipSetup.js';

void test('Cockpit presents independent hull, stored shield charge and reserve without claiming an inactive field protects', () => {
  const ship = new Ship(starterSetup.profile, starterSetup.initialState);
  try {
    const t = ship.telemetry,
      c = ship.computer.telemetry;
    const reading = cockpitReadings(
      {
        ...t,
        hull: { ...t.hull, remainingJ: t.hull.capacityJ / 2 },
        shields: {
          ...t.shields,
          energyJ: t.shields.capacityJ,
          active: false,
          state: 'off',
        },
      },
      { ...c, reserveFraction: 0.05 },
    );
    assert.equal(reading.overhead[0]!.fraction, 0.5);
    assert.equal(reading.overhead[0]!.warning, true);
    assert.equal(reading.overhead[1]!.fraction, 1);
    assert.equal(reading.overhead[1]!.label, 'SHIELDS OFF');
    assert.equal(reading.overhead[1]!.muted, true);
    assert.equal(reading.overhead[2]!.fraction, 0.05);
    assert.equal(reading.overhead[2]!.warning, true);
    assert.equal(ship.telemetry, t);
    assert.equal(ship.computer.telemetry, c);
  } finally {
    ship.dispose();
  }
});

void test('Cockpit selects hottest module and committed alert priority, with honest mount availability', () => {
  const ship = new Ship(starterSetup.profile, starterSetup.initialState);
  try {
    const t = ship.telemetry,
      c = ship.computer.telemetry;
    const alerts = [
      {
        id: 'engine/thermal',
        moduleId: 'core:engine',
        severity: 'critical' as const,
        message: 'Engine: thermal shutdown',
      },
    ];
    const reading = cockpitReadings(t, {
      ...c,
      alerts,
      modules: c.modules.map((m, i) => ({
        ...m,
        temperatureK: i === 1 ? 473.15 : null,
      })),
    });
    assert.match(reading.heat, /200°C/);
    assert.equal(
      reading.overhead[0]!.warning,
      false,
      'thermal alarms do not change the hull indicator',
    );
    assert.equal(reading.alert, alerts[0]!.message);
    assert.equal(reading.critical, true);
    const empty = cockpitReadings(
      {
        ...t,
        mounts: { ...t.mounts, selectedWeapons: [], installations: [] },
        navigation: { ...t.navigation, destination: null },
      },
      { ...c, modules: [], alerts: [] },
    );
    assert.equal(empty.heat, 'NO THERMAL DATA');
    assert.equal(empty.target, 'NO DESTINATION');
    assert.match(empty.weapons, /0\/0 MOUNTS READY/);
    assert.equal(empty.alert, '');
  } finally {
    ship.dispose();
  }
});
