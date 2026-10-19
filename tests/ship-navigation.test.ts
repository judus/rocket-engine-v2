import test from 'node:test';
import assert from 'node:assert/strict';
import { ShipBody } from '../games/ship/ShipBody.js';
import { ShipNavigation } from '../games/ship/ShipNavigation.js';
import { Ship } from '../games/ship/Ship.js';
import { starterSetup } from './helpers/shipSetup.js';
const contact = {
  id: 'outpost',
  label: 'Outpost',
  positionM: { x: 0, y: 0, z: 1000 },
  arrivalRadiusM: 100,
};
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
void test('Navigation uses the same committed post-motion body state and never changes thrust', () => {
  const ship = new Ship(
    starterSetup.profile,
    { ...starterSetup.initialState, velocityMps: { x: 0, y: 0, z: 100 } },
    [contact],
  );
  ship.engine.requestEnabled(false);
  const before = ship.telemetry;
  ship.navigation.selectDestination('outpost');
  assert.equal(ship.telemetry, before);
  assert.equal(before.navigation.destination, null);
  ship.fixedUpdate(1, { dt: 1, tick: 1, time: 1 });
  const n = ship.telemetry.navigation;
  assert.deepEqual(n.positionM, ship.telemetry.body.positionM);
  close(n.positionM.z, 100);
  close(n.destination!.distanceM, 900);
  close(n.destination!.closingSpeedMps, 100);
  close(n.destination!.closingTimeSeconds!, 8);
  close(ship.telemetry.worldForceN.z, 0);
  close(ship.telemetry.body.velocityMps.z, 100);
  assert.ok(Object.isFrozen(n.contacts));
  assert.ok(Object.isFrozen(n.destination!.positionM));
  ship.dispose();
  assert.throws(() => ship.navigation.selectDestination(null), /disposed/);
});
void test('Yaw-relative bearing and scope offsets follow the existing +Z forward convention', () => {
  const body = new ShipBody({
    id: 'body',
    massKg: 1,
    yawInertiaKgM2: 1,
    pitchInertiaKgM2: 1,
    rollInertiaKgM2: 1,
  });
  const nav = new ShipNavigation(body, [
    { ...contact, positionM: { x: 1000, y: 100, z: 0 } },
  ]);
  nav.selectDestination(contact.id);
  nav.commit();
  close(nav.telemetry.destination!.relativeBearingDegrees, 90);
  body.advance({ x: 0, y: 0, z: 0 }, { x: 0, y: Math.PI, z: 0 }, 1);
  nav.commit();
  close(nav.telemetry.headingDegrees, 90);
  close(nav.telemetry.destination!.relativeBearingDegrees, 0);
  close(nav.telemetry.destination!.localOffsetM.z, 1000);
  close(nav.telemetry.destination!.localOffsetM.x, 0);
  assert.ok(nav.telemetry.destination!.elevationDegrees > 0);
});
void test('Receding, stationary and arrived destinations do not produce misleading travel times', () => {
  for (const speed of [-100, 0]) {
    const body = new ShipBody(starterSetup.profile.body, {
      x: 0,
      y: 0,
      z: speed,
    });
    const nav = new ShipNavigation(body, [contact]);
    nav.selectDestination(contact.id);
    nav.commit();
    assert.equal(nav.telemetry.destination!.closingTimeSeconds, null);
  }
  const body = new ShipBody(starterSetup.profile.body);
  const nav = new ShipNavigation(body, [
    { ...contact, positionM: { x: 0, y: 0, z: 0 } },
  ]);
  nav.selectDestination(contact.id);
  nav.commit();
  assert.equal(nav.telemetry.destination!.arrived, true);
  assert.equal(nav.telemetry.destination!.closingTimeSeconds, 0);
  assert.equal(nav.telemetry.destination!.closingSpeedMps, 0);
});
void test('World updates are validated atomically, copied and clear removed destinations at the next commit', () => {
  const body = new ShipBody(starterSetup.profile.body);
  const supplied = { ...contact, positionM: { ...contact.positionM } };
  const nav = new ShipNavigation(body, [supplied]);
  supplied.positionM.z = 9999;
  nav.selectDestination(contact.id);
  nav.commit();
  const before = nav.telemetry;
  close(before.destination!.distanceM, 1000);
  assert.throws(() => nav.setContacts([contact, contact]), /Duplicate/);
  assert.throws(() =>
    nav.setContacts([{ ...contact, positionM: { x: NaN, y: 0, z: 0 } }]),
  );
  assert.throws(() => nav.setContacts([{ ...contact, arrivalRadiusM: -1 }]));
  assert.throws(() => nav.selectDestination('unknown'));
  assert.equal(nav.telemetry, before);
  nav.setContacts([]);
  assert.equal(nav.telemetry, before);
  nav.commit();
  assert.equal(nav.telemetry.destination, null);
  assert.equal(nav.telemetry.contacts.length, 0);
  assert.equal(before.contacts.length, 1);
});
