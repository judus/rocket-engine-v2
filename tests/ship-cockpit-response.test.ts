import test from 'node:test';
import assert from 'node:assert/strict';
import { Node3D, matrixPoint } from '../src/3d/index.js';
import { Ship } from '../games/ship/Ship.js';
import { CockpitResponse } from '../games/ship/CockpitResponse.js';
import { starterSetup } from './helpers/shipSetup.js';

void test('Cockpit follows delivered motion while keeping every attached surface aligned and physics untouched', () => {
  const ship = new Ship(starterSetup.profile, starterSetup.initialState);
  const response = new CockpitResponse(ship);
  const frame = new Node3D('frame'),
    pane = new Node3D('pane'),
    display = new Node3D('display');
  response.root.add(frame).add(pane).add(display);
  response.update(1 / 60);
  assert.deepEqual(response.root.transform.position, { x: 0, y: 0, z: 0 });
  ship.control.thrust({ x: 0, y: 0, z: 1 });
  for (let i = 0; i < 180; i++)
    ship.fixedUpdate(1 / 60, {
      dt: 1 / 60,
      tick: i + 1,
      time: (i + 1) / 60,
    });
  const before = ship.telemetry;
  response.update(0.1);
  assert.ok(response.root.transform.position.z > 0);
  assert.equal(ship.telemetry, before);
  assert.ok(response.root.transform.position.z <= 0.15);
  const positions = [frame, pane, display].map((n) =>
    matrixPoint(n.worldMatrix(), { x: 0, y: 0, z: 0 }),
  );
  assert.deepEqual(positions[0], positions[1]);
  assert.deepEqual(positions[1], positions[2]);
});

void test('Turning produces bounded seat response with zero-thrust engines and settles when rotation stops', () => {
  const ship = new Ship(
    {
      ...starterSetup.profile,
      engine: { ...starterSetup.profile.engine, maxThrustN: 0 },
    },
    starterSetup.initialState,
  );
  const response = new CockpitResponse(ship);
  ship.control.turn(1);
  for (let i = 0; i < 180; i++) {
    ship.fixedUpdate(1 / 60, { dt: 1 / 60, tick: i + 1, time: (i + 1) / 60 });
    response.update(1 / 60);
  }
  assert.ok(Math.abs(response.root.transform.position.x) > 0);
  for (const value of [
    response.root.transform.position.x,
    response.root.transform.position.y,
    response.root.transform.position.z,
  ]) {
    assert.ok(Number.isFinite(value) && Math.abs(value) <= 0.15);
  }
  ship.control.clear();
  ship.dampers.requestEnabled(true);
  for (let i = 0; i < 600; i++) {
    ship.fixedUpdate(1 / 60, {
      dt: 1 / 60,
      tick: i + 181,
      time: (i + 181) / 60,
    });
    response.update(1 / 60);
  }
  assert.ok(Math.abs(response.root.transform.position.x) < 0.001);
});
