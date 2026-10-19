import test from 'node:test';
import assert from 'node:assert/strict';
import { Ship } from '../games/ship/Ship.js';
import { starterSetup } from './helpers/shipSetup.js';
function step(ship: Ship, count = 1, dt = 1 / 60) {
  for (let i = 0; i < count; i++)
    ship.fixedUpdate(dt, {
      dt,
      tick: ship.telemetry.tick + 1,
      time: ship.telemetry.timeSeconds + dt,
    });
}
void test('Computer reads the completed movement frame and routes switches without mutating committed snapshots', () => {
  const ship = new Ship(starterSetup.profile, starterSetup.initialState);
  const before = ship.computer.telemetry;
  ship.computer.setEnabled('core:cooling', true);
  assert.equal(ship.computer.telemetry, before);
  assert.equal(
    before.modules.find((m) => m.id === 'core:cooling')!.requested,
    false,
  );
  step(ship);
  const current = ship.computer.telemetry;
  assert.equal(current.tick, ship.telemetry.tick);
  assert.equal(current.timeSeconds, ship.telemetry.timeSeconds);
  assert.equal(
    current.modules.find((m) => m.id === 'core:cooling')!.requested,
    true,
  );
  assert.equal(current.generationW, ship.telemetry.power.generationW);
  assert.equal(current.consumptionW, ship.telemetry.power.consumptionW);
  assert.ok(Object.isFrozen(current.modules));
  assert.ok(Object.isFrozen(current.modules[0]));
  assert.throws(() => ship.computer.setEnabled('unknown', true));
  assert.throws(() => ship.computer.setEnabled('core:hull', false));
  ship.dispose();
  assert.throws(
    () => ship.computer.setEnabled('core:engine', true),
    /disposed/,
  );
});
void test('Current alerts expose failures, latched heat, low reserve and only requested unstaffed factories', () => {
  const ship = new Ship(starterSetup.profile, {
    ...starterSetup.initialState,
    energyJ: 1e9,
    engineTemperatureK:
      starterSetup.profile.engine.thermal.tripTemperatureK + 1,
  });
  ship.engine.damage(100);
  ship.computer.setEnabled('internal:fabricator-main', true);
  step(ship, 30);
  const alerts = ship.computer.telemetry.alerts;
  assert.ok(
    alerts.some(
      (a) => a.id === 'core:engine/failed' && a.severity === 'critical',
    ),
  );
  assert.ok(alerts.some((a) => a.id === 'core:engine/thermal'));
  assert.ok(alerts.some((a) => a.id === 'reserve/low'));
  assert.ok(alerts.some((a) => a.id === 'internal:fabricator-main/staff'));
  assert.ok(!alerts.some((a) => a.id === 'internal:galley-main/staff'));
  assert.equal(alerts[0]!.severity, 'critical');
  assert.ok(Object.isFrozen(alerts[0]));
  ship.computer.setEnabled('internal:fabricator-main', false);
  step(ship);
  assert.ok(
    !ship.computer.telemetry.alerts.some(
      (a) => a.id === 'internal:fabricator-main/staff',
    ),
  );
  ship.dispose();
});
void test('Computer production overview is Workshop-owned progress and completion; staffing clears its warning', () => {
  const ship = new Ship(starterSetup.profile, starterSetup.initialState);
  ship.internals.supply('internal-1', 'alloy', 2);
  ship.computer.setEnabled('internal:fabricator-main', true);
  step(ship, 30);
  const waiting = ship.computer.telemetry;
  assert.ok(
    waiting.alerts.some((a) => a.id === 'internal:fabricator-main/staff'),
  );
  ship.internals.assignWorker('internal-1', 'engineer-a');
  step(ship, 360);
  const module = ship.computer.telemetry.modules.find(
    (m) => m.id === 'internal:fabricator-main',
  )!;
  const actual = ship.telemetry.internals.installations.find(
    (i) => i.installationId === 'fabricator-main',
  )!.facility!.jobs[0]!;
  assert.equal(module.jobs[0]!.batchesCompleted, 1);
  assert.equal(module.jobs[0]!.batchesCompleted, actual.batchesCompleted);
  assert.equal(module.jobs[0]!.state, actual.state);
  assert.ok(
    !ship.computer.telemetry.alerts.some(
      (a) => a.id === 'internal:fabricator-main/staff',
    ),
  );
  assert.equal(
    waiting.modules.find((m) => m.id === module.id)!.jobs[0]!.batchesCompleted,
    0,
  );
  assert.ok(Object.isFrozen(module.jobs[0]));
  ship.dispose();
});
void test('Stale computer controls cannot switch replacement mounts or internals', () => {
  const ship = new Ship(starterSetup.profile, starterSetup.initialState);
  const oldMount = ship.telemetry.mounts.installations[0]!;
  ship.mounts.remove(oldMount.slotId);
  ship.mounts.install(
    oldMount.slotId,
    oldMount.equipmentId,
    'replacement-mount',
  );
  assert.throws(
    () => ship.computer.setEnabled(`mount:${oldMount.installationId}`, true),
    /changed/,
  );
  ship.internals.remove('internal-1');
  ship.internals.install(
    'internal-1',
    'fabricator-starter',
    'replacement-fabricator',
  );
  ship.computer.setEnabled('internal:fabricator-main', true);
  step(ship);
  assert.equal(
    ship.telemetry.mounts.installations.find(
      (i) => i.installationId === 'replacement-mount',
    )!.operation.requested,
    false,
  );
  assert.equal(
    ship.telemetry.internals.installations.find(
      (i) => i.installationId === 'replacement-fabricator',
    )!.operation.requested,
    false,
  );
  assert.equal(ship.telemetry.internals.commands.at(-1)!.ok, false);
  assert.throws(
    () => ship.computer.setEnabled('internal:fabricator-main', true),
    /Unknown/,
  );
  ship.computer.setEnabled('internal:replacement-fabricator', true);
  step(ship);
  assert.equal(
    ship.telemetry.internals.installations.find(
      (i) => i.installationId === 'replacement-fabricator',
    )!.operation.requested,
    true,
  );
  ship.dispose();
});
