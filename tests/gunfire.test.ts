import { ShipTargeting } from '../games/farwake/ShipTargeting.js';
import {
  WindshieldHud,
  hudGlyphGeometry,
} from '../games/farwake/WindshieldHud.js';
import { matrixPoint } from '../src/3d/index.js';
import { aimProjection } from '../games/farwake/AimProjection.js';
import { transformMatrix } from '../src/3d/index.js';
const projection = aimProjection(
  transformMatrix({
    position: { x: 0, y: 1.48, z: 2 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }),
  { x: 0, y: 1.48, z: -3.37 },
);
import { cockpitReadings } from '../games/farwake/CockpitReadings.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Stage2D } from '../src/experimental/index.js';
import { Mesh3D, MeshGeometry, Node3D } from '../src/3d/index.js';
import { Ship } from '../games/farwake/Ship.js';
import { loadShipSetup } from '../games/farwake/loadShipSetup.js';
import {
  ShipGunfire,
  gunHardpoints,
  pulseCannon,
} from '../games/farwake/ShipGunfire.js';
import { asteroidCombatWorld } from '../games/farwake/AsteroidHits.js';
import { gunfireView } from '../games/farwake/visuals/GunfireView.js';
const setup = await loadShipSetup(
  pathToFileURL(resolve('games/farwake/ships/gunship.json')),
  async (url) => new Response(await readFile(url, 'utf8')),
);
function fixture(empty = false) {
  const stage = new Stage2D({ fixed: true });
  const ship = stage.entity(
    () =>
      new Ship(setup.profile, {
        ...setup.initialState,
        energyJ: empty ? 0 : setup.initialState.energyJ,
      }),
  );
  const guns = ship.attach(new ShipGunfire(ship));
  for (const installation of setup.profile.mounts.loadout)
    ship.mounts.requestEnabled(installation.slotId, true);
  if (empty) ship.power.requestEnabled(false);
  let tick = 0;
  return {
    ship,
    guns,
    stage,
    step(count = 1) {
      for (let i = 0; i < count; i++) {
        tick++;
        stage.fixedUpdate!(1 / 60, { dt: 1 / 60, time: tick / 60, tick });
      }
    },
  };
}
function triangle(z: number, x = 0) {
  const node = new Node3D();
  node.mesh = new Mesh3D(
    new MeshGeometry(
      [
        { x: -1, y: -1, z: 0 },
        { x: 1, y: -1, z: 0 },
        { x: -1, y: 1, z: 0 },
      ],
      [{ id: 'surface', indices: [0, 1, 2], material: 0 }],
    ),
    [{ color: '#ffffff' }],
  );
  node.transform = { ...node.transform, position: { x, y: 0, z } };
  return node;
}
void test('swept asteroid hit uses the closest actual triangle, not a broad-phase box, in either direction', () => {
  const field = new Node3D();
  field.add(triangle(10)).add(triangle(5));
  const query = asteroidCombatWorld(field, () => {}).trace,
    from = { x: -0.5, y: -0.5, z: 0 },
    to = { ...from, z: 1000 };
  assert.equal(query(from, to)?.targetId, 'rock-2');
  assert.equal(query(from, to)?.fraction, 0.005);
  assert.equal(query(to, from)?.targetId, 'rock-1');
  assert.equal(
    query({ x: 0.9, y: 0.9, z: 0 }, { x: 0.9, y: 0.9, z: 1000 }),
    null,
  );
  assert.equal(query(from, { ...from, z: 4 }), null);
  assert.equal(query(from, from), null);
  assert.throws(() => query({ x: NaN, y: 0, z: 0 }, to), /segment/);
});
void test('seven-slot gunship has ten muzzles and fire groups select physical installations', () => {
  assert.equal(setup.profile.mounts.loadout.length, 7);
  assert.equal(
    Object.values(gunHardpoints).reduce(
      (sum, points) => sum + points.length,
      0,
    ),
    10,
  );
  const f = fixture();
  f.guns.setWorld(
    {
      targets: () => [],
      trace: () => null,
      damage: () => {
        throw new Error('Unexpected hit');
      },
    },
    projection,
  );
  f.step(30);
  assert.equal(f.guns.telemetry.shotsFired, 0);
  f.ship.mounts.selectGroup('group-4');
  f.ship.mounts.requestFiring(true);
  f.step(60);
  assert.ok(
    f.guns.telemetry.shotsFired >= 14 && f.guns.telemetry.shotsFired <= 16,
  );
  assert.ok(
    f.guns.telemetry.bolts.every((bolt) => bolt.installationId === 'gun-7'),
  );
  assert.ok(
    f.guns.telemetry.bolts.every(
      (bolt) => bolt.energyJ === pulseCannon.volleyEnergyJ / 2,
    ),
  );
  f.stage.dispose();
});
void test('funded output supplies shots once, preserves ship velocity, and stops generating shots on release', () => {
  const f = fixture();
  f.guns.setWorld(
    {
      targets: () => [],
      trace: () => null,
      damage: () => {
        throw new Error('Unexpected hit');
      },
    },
    projection,
  );
  f.step(30);
  f.ship.mounts.requestFiring(true);
  let output = 0;
  for (let i = 0; i < 60; i++) {
    f.step();
    output += f.ship.telemetry.mounts.outputW / 60;
  }
  assert.match(
    cockpitReadings(f.ship.telemetry, f.ship.computer.telemetry).weapons,
    /FIRING/,
  );
  const reading = f.guns.telemetry;
  assert.ok(reading.shotsFired >= 70 && reading.shotsFired <= 80);
  const spent = reading.bolts.reduce((sum, b) => sum + b.energyJ, 0);
  assert.ok(spent <= output + 0.01 && spent > output * 0.8);
  const bolt = reading.bolts[0]!,
    velocity = f.ship.telemetry.body.velocityMps;
  assert.ok(
    Math.abs(
      Math.hypot(
        bolt.velocity.x - velocity.x,
        bolt.velocity.y - velocity.y,
        bolt.velocity.z - velocity.z,
      ) - pulseCannon.speedMps,
    ) < 1e-8,
  );
  assert.ok(Object.isFrozen(reading) && Object.isFrozen(bolt.position));
  const fired = reading.shotsFired;
  f.ship.mounts.requestFiring(false);
  f.step(240);
  assert.equal(f.guns.telemetry.shotsFired, fired);
  assert.equal(f.guns.telemetry.bolts.length, 0);
  assert.equal(f.guns.telemetry.flashes.length, 0);
  f.stage.dispose();
});
void test('no power means no shots; failed mounts stop while other guns continue', () => {
  const empty = fixture(true);
  empty.guns.setWorld(
    {
      targets: () => [],
      trace: () => null,
      damage: () => {
        throw new Error('Unexpected hit');
      },
    },
    projection,
  );
  empty.ship.mounts.requestFiring(true);
  empty.step(120);
  assert.equal(empty.guns.telemetry.shotsFired, 0);
  empty.stage.dispose();
  const f = fixture();
  f.guns.setWorld(
    {
      targets: () => [],
      trace: () => null,
      damage: () => {
        throw new Error('Unexpected hit');
      },
    },
    projection,
  );
  f.step(30);
  f.ship.mounts.damage('mount-1', 100);
  f.ship.mounts.requestFiring(true);
  f.step(60);
  assert.ok(f.guns.telemetry.shotsFired > 0);
  assert.ok(!f.guns.telemetry.bolts.some((b) => b.installationId === 'gun-1'));
  f.stage.dispose();
});
void test('a bolt crossing a thin target hits exactly once and does not continue behind it', () => {
  const f = fixture(),
    field = new Node3D(),
    target = triangle(100);
  target.mesh = new Mesh3D(
    new MeshGeometry(
      [
        { x: -100, y: -100, z: 0 },
        { x: 100, y: -100, z: 0 },
        { x: 100, y: 100, z: 0 },
        { x: -100, y: 100, z: 0 },
      ],
      [{ id: 'target', indices: [0, 1, 2, 3], material: 0 }],
    ),
    [{ color: '#ffffff' }],
  );
  field.add(target);
  f.guns.setWorld(
    asteroidCombatWorld(field, () => {}),
    projection,
  );
  f.step(30);
  f.ship.mounts.selectGroup('group-1');
  f.ship.mounts.requestFiring(true);
  f.step(10);
  f.ship.mounts.requestFiring(false);
  f.step(60);
  assert.ok(f.guns.telemetry.hits > 0);
  assert.equal(f.guns.telemetry.hits, f.guns.telemetry.shotsFired);
  const hits = f.guns.telemetry.hits;
  f.step(120);
  assert.equal(f.guns.telemetry.hits, hits);
  assert.ok(f.guns.telemetry.hitEnergyJ > 0);
  f.stage.dispose();
});
void test('gunfire requires a collision world and a fresh committed ship step', () => {
  const f = fixture();
  assert.throws(() => f.guns.fixedUpdate(1 / 60), /new committed/);
  assert.throws(
    () => f.step(),
    (error: unknown) =>
      error instanceof Error &&
      error.cause instanceof Error &&
      /collision world/.test(error.cause.message),
  );
  f.stage.dispose();
});
void test('gun visuals share immutable mesh resources, exclude shadows and retire expired nodes', () => {
  const view = gunfireView();
  const reading = {
    targeting: null,
    destructions: [],
    asteroidsDestroyed: 0,
    bolts: [
      {
        id: 1,
        installationId: 'test',
        position: { x: 0, y: 0, z: 20 },
        velocity: { x: 0, y: 0, z: 2400 },
        energyJ: 1,
        life: 1,
      },
    ],
    flashes: [],
    impacts: [],
    shotsFired: 1,
    hits: 0,
    hitEnergyJ: 0,
  };
  view.update(reading);
  const node = view.root.children[0]!,
    mesh = node.mesh;
  assert.equal(node.castsShadow, false);
  assert.equal(node.receivesShadow, false);
  view.update(reading);
  assert.equal(view.root.children[0], node);
  assert.equal(node.mesh, mesh);
  view.update({ ...reading, bolts: [] });
  assert.equal(view.root.children.length, 0);
});

void test('asteroid integrity accumulates hits, destroys once and exposes the next target immediately', () => {
  const field = new Node3D();
  field.add(triangle(5)).add(triangle(10));
  const removed: string[] = [];
  const world = asteroidCombatWorld(field, (id) => removed.push(id));
  const from = { x: -0.5, y: -0.5, z: 0 },
    to = { ...from, z: 20 };
  assert.equal(world.damage('rock-1', 24999999), null);
  assert.equal(world.trace(from, to)?.targetId, 'rock-1');
  const destruction = world.damage('rock-1', 1)!;
  assert.equal(destruction.targetId, 'rock-1');
  assert.equal(destruction.position.z, 5);
  assert.ok(Object.isFrozen(destruction.position));
  assert.equal(world.isAlive('rock-1'), false);
  assert.equal(world.trace(from, to)?.targetId, 'rock-2');
  assert.deepEqual(removed, ['rock-1']);
  assert.throws(() => world.damage('rock-1', 1), /already destroyed/);
  assert.throws(() => world.damage('missing', 1), /Unknown/);
  assert.throws(() => world.damage('rock-2', NaN), /energy/);
  assert.throws(() => world.damage('rock-2', -1), /energy/);
});
void test('funded bolts destroy a target once; breakup ages only on fixed steps and retires', () => {
  const f = fixture(),
    field = new Node3D(),
    target = triangle(100);
  target.mesh = new Mesh3D(
    new MeshGeometry(
      [
        { x: -10, y: -10, z: 0 },
        { x: 10, y: -10, z: 0 },
        { x: 10, y: 10, z: 0 },
        { x: -10, y: 10, z: 0 },
      ],
      [{ id: 'target', indices: [0, 1, 2, 3], material: 0 }],
    ),
    [{ color: '#ffffff' }],
  );
  field.add(target);
  const removed: string[] = [];
  const world = asteroidCombatWorld(field, (id) => removed.push(id));
  f.guns.setWorld(world, projection);
  f.step(30);
  f.ship.mounts.requestFiring(true);
  f.step(25);
  assert.equal(f.guns.telemetry.asteroidsDestroyed, 1);
  assert.deepEqual(removed, ['rock-1']);
  assert.equal(f.guns.telemetry.hitEnergyJ, 25000000);
  const snapshot = f.guns.telemetry;
  assert.equal(f.guns.telemetry, snapshot);
  assert.equal(snapshot.destructions.length, 1);
  const view = gunfireView();
  view.update(snapshot);
  assert.equal(
    view.root.children.filter((n) => n.name.startsWith('debris-')).length,
    12,
  );
  f.ship.mounts.requestFiring(false);
  f.step(180);
  assert.equal(f.guns.telemetry.asteroidsDestroyed, 1);
  assert.equal(f.guns.telemetry.hitEnergyJ, snapshot.hitEnergyJ);
  assert.equal(f.guns.telemetry.destructions.length, 0);
  view.update(f.guns.telemetry);
  assert.equal(view.root.children.length, 0);
  f.stage.dispose();
});

void test('target lock survives leaving the acquisition ring and rear view, resumes tracking and clears destruction', () => {
  const f = fixture();
  let position = { x: 5, y: 1.48, z: 100 };
  let alive = true;
  const world = {
    targets: () => (alive ? [{ id: 'rock-1', position }] : []),
    trace: () => ({ targetId: 'rock-1', fraction: 1, point: position }),
    damage: () => null,
  };
  const targeter = new ShipTargeting(f.ship, world, projection);
  const step = () => targeter.update(1 / 60, 2400, 2.5, 2000);
  let reading = step();
  assert.equal(reading.targetId, 'rock-1');
  assert.equal(reading.tracking, true);
  position = { ...position, x: 50 };
  reading = step();
  assert.equal(reading.targetId, 'rock-1');
  assert.equal(reading.tracking, false);
  assert.ok(reading.targetPoint!.x > 1.15);
  for (let i = 0; i < 60; i++) reading = step();
  assert.ok(Math.abs(reading.aimPoint!.x) < 1e-5);
  position = { ...position, x: 5, z: -100 };
  reading = step();
  assert.equal(reading.targetId, 'rock-1');
  assert.equal(reading.targetPoint, null);
  position = { x: 5, y: 1.48, z: 100 };
  reading = step();
  assert.equal(reading.tracking, true);
  alive = false;
  reading = step();
  assert.equal(reading.targetId, null);
  assert.equal(reading.tracking, false);
  f.stage.dispose();
});
void test('acquisition prefers centre, cycles eligible targets, respects occlusion and distinguishes firing distance', () => {
  const f = fixture();
  const targets = [
    { id: 'rock-1', position: { x: 1, y: 1.48, z: 100 } },
    { id: 'rock-2', position: { x: 5, y: 1.48, z: 100 } },
    { id: 'rock-3', position: { x: 0, y: 1.48, z: 10000 } },
  ];
  let blocked = false;
  const targeter = new ShipTargeting(
    f.ship,
    {
      targets: () => targets,
      trace: (
        _from: Readonly<{ x: number; y: number; z: number }>,
        to: Readonly<{ x: number; y: number; z: number }>,
      ) => ({
        targetId: blocked
          ? 'blocker'
          : targets.find((t) => t.position === to)!.id,
        fraction: 1,
        point: to,
      }),
      damage: () => null,
    },
    projection,
  );
  let r = targeter.update(1 / 60, 2400, 2.5, 2000);
  assert.equal(r.targetId, 'rock-3');
  assert.equal(r.inRange, false);
  assert.equal(r.tracking, false);
  targeter.next();
  r = targeter.update(1 / 60, 2400, 2.5, 2000);
  assert.equal(r.targetId, 'rock-1');
  assert.equal(r.tracking, true);
  blocked = true;
  r = targeter.update(1 / 60, 2400, 2.5, 2000);
  assert.equal(r.targetId, 'rock-1');
  assert.equal(r.tracking, false);
  f.stage.dispose();
});
void test('aim compensates inherited ship velocity and HUD uses the same projected solution', () => {
  const stage = new Stage2D({ fixed: true });
  const ship = stage.entity(
    () =>
      new Ship(setup.profile, {
        ...setup.initialState,
        velocityMps: { x: 100, y: 0, z: 0 },
      }),
  );
  const position = { x: 0, y: 1.48, z: 2000 };
  const targeter = new ShipTargeting(
    ship,
    {
      targets: () => [{ id: 'rock-1', position }],
      trace: () => ({ targetId: 'rock-1', fraction: 1, point: position }),
      damage: () => null,
    },
    projection,
  );
  const r = targeter.update(1 / 60, 2400, 2.5, 2000);
  assert.equal(r.tracking, true);
  assert.ok(r.aimWorld.x < -80);
  const speed = Math.hypot(r.aimWorld.x, r.aimWorld.y, r.aimWorld.z);
  const t = position.z / ((r.aimWorld.z / speed) * 2400);
  assert.ok(Math.abs((100 + (r.aimWorld.x / speed) * 2400) * t) < 1e-6);
  const hud = new WindshieldHud(() =>
    hudGlyphGeometry(1, 1, new Uint8ClampedArray(4)),
  );
  const rig = new Node3D();
  rig.add(hud.root);
  hud.stabilizeInnerReticle(rig);
  const fixed = hud.stableReticle.children.find(
    (n) => n.name === 'fixed cross and dot',
  )!;
  const before = fixed.worldMatrix();
  hud.updateTargeting(r);
  const aim = hud.stableReticle.children.find(
    (n) => n.name === 'context range ring',
  )!;
  assert.equal(aim.transform.position.x, r.aimPoint!.x);
  assert.deepEqual(fixed.worldMatrix(), before);
  assert.equal(
    hud.stableReticle.children.find((n) => n.name === 'closed target ring')!
      .visible,
    true,
  );
  hud.updateTargeting({ ...r, tracking: false });
  assert.equal(
    hud.stableReticle.children.find((n) => n.name === 'closed target ring')!
      .visible,
    false,
  );
  assert.equal(
    hud.stableReticle.children.find(
      (n) => n.name === 'projectile direction ring',
    )!.visible,
    true,
  );
  stage.dispose();
});
void test('tilted aiming projection matches the physical plane ray and rejects targets behind the eye', () => {
  const plane = transformMatrix({
    position: { x: 0, y: 1.48, z: 2 },
    rotation: { x: -0.265, y: 0, z: 0 },
    scale: { x: 0.9, y: 0.9, z: 0.9 },
  });
  const project = aimProjection(plane, { x: 0, y: 1.48, z: -3.37 });
  const p = { x: 0.4, y: 0.3, z: 0 };
  const onPlane = matrixPoint(plane, p);
  const eye = { x: 0, y: 1.48, z: -3.37 };
  const point = {
    x: eye.x + (onPlane.x - eye.x) * 100,
    y: eye.y + (onPlane.y - eye.y) * 100,
    z: eye.z + (onPlane.z - eye.z) * 100,
  };
  assert.ok(Math.abs(project(point)!.x - p.x) < 1e-10);
  assert.ok(Math.abs(project(point)!.y - p.y) < 1e-10);
  assert.equal(project({ ...point, z: -20 }), null);
});

void test('funded auto-aim bolts hit an off-axis asteroid inside the acquisition ring', () => {
  const f = fixture(),
    field = new Node3D(),
    node = new Node3D();
  node.mesh = new Mesh3D(
    new MeshGeometry(
      [
        { x: 18, y: -1, z: 100 },
        { x: 22, y: -1, z: 100 },
        { x: 22, y: 3, z: 100 },
        { x: 18, y: 3, z: 100 },
      ],
      [{ id: 'target', indices: [0, 1, 2, 3], material: 0 }],
    ),
    [{ color: '#ffffff' }],
  );
  field.add(node);
  const world = asteroidCombatWorld(field, () => {});
  f.guns.setWorld(world, projection);
  f.step(30);
  assert.equal(f.guns.telemetry.targeting!.tracking, true);
  assert.ok(f.guns.telemetry.targeting!.aimPoint!.x > 0.9);
  f.ship.mounts.requestFiring(true);
  f.step(60);
  assert.ok(f.guns.telemetry.hits > 0);
  assert.equal(world.isAlive('rock-1'), false);
  assert.equal(f.guns.telemetry.asteroidsDestroyed, 1);
  f.stage.dispose();
});
