import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GridTraversal,
  GridNavigator,
  Movement,
  type NavigationObstacle,
  type ActorTraversal,
  type TraversalWorld,
} from '../src/navigation/index.js';
const actor = { radius: 2, clearance: 0, capabilities: ['walk'] };
const domain = { minX: -50, minY: -30, columns: 10, rows: 6, tileSize: 10 };
void test('terrain contact is blocked equally on all four sides, including signed origins', () => {
  for (const origin of [
    { x: 0, y: 0 },
    { x: -96, y: -64 },
  ]) {
    const d = {
      minX: origin.x,
      minY: origin.y,
      columns: 5,
      rows: 5,
      tileSize: 32,
    };
    const profile = { radius: 16, clearance: 0, capabilities: ['walk'] };
    const p = { x: origin.x + 48, y: origin.y + 48 };
    for (const [x, y, awayX, awayY] of [
      [0, 1, 1, 0],
      [1, 0, 0, 1],
      [2, 1, -1, 0],
      [1, 2, 0, -1],
    ] as const) {
      const world = new GridTraversal(
        d,
        (tx, ty) =>
          tx === x && ty === y
            ? { status: 'blocked' }
            : { status: 'passable', cost: 1 },
        () => 0,
      );
      assert.equal(world.point(p, profile).status, 'blocked');
      const clear = { x: p.x + awayX * 0.001, y: p.y + awayY * 0.001 };
      const overlapping = { x: p.x - awayX * 0.001, y: p.y - awayY * 0.001 };
      assert.equal(world.point(clear, profile).status, 'passable');
      assert.equal(world.point(overlapping, profile).status, 'blocked');
      const unknown = new GridTraversal(
        d,
        (tx, ty) =>
          tx === x && ty === y
            ? { status: 'unknown' }
            : { status: 'passable', cost: 1 },
        () => 0,
      );
      assert.equal(unknown.point(p, profile).status, 'unknown');
    }
    const corner = new GridTraversal(
      d,
      (x, y) =>
        x === 0 && y === 0
          ? { status: 'blocked' }
          : { status: 'passable', cost: 1 },
      () => 0,
    );
    assert.equal(corner.point(p, profile).status, 'passable');
  }
});
void test('swept terrain tangencies block in either travel direction without broad-phase false positives', () => {
  const d = { minX: -96, minY: -64, columns: 5, rows: 5, tileSize: 32 };
  const profile = { radius: 12, clearance: 4, capabilities: ['walk'] };
  const start = { x: -48, y: -16 };
  for (const [x, y, dx, dy, awayX, awayY] of [
    [0, 1, 0, 32, 1, 0],
    [2, 1, 0, 32, -1, 0],
    [1, 0, 32, 0, 0, 1],
    [1, 2, 32, 0, 0, -1],
  ] as const) {
    const world = new GridTraversal(
      d,
      (tx, ty) =>
        tx === x && ty === y
          ? { status: 'blocked' }
          : { status: 'passable', cost: 1 },
      () => 0,
    );
    const end = { x: start.x + dx, y: start.y + dy };
    assert.equal(world.segment(start, end, profile).status, 'blocked');
    assert.equal(world.segment(end, start, profile).status, 'blocked');
    const shift = (p: typeof start) => ({
      x: p.x + awayX * 0.001,
      y: p.y + awayY * 0.001,
    });
    assert.equal(
      world.segment(shift(start), shift(end), profile).status,
      'passable',
    );
  }
});
void test('replanning mid-edge keeps forward progress in all four grid directions', () => {
  for (const direction of [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ]) {
    const f = fixture(),
      start = { x: -15, y: -5 },
      goal = { x: start.x + direction.x * 20, y: start.y + direction.y * 20 },
      movement = new Movement(f.navigator, start, actor);
    movement.move({
      destination: goal,
      speed: 10,
      arrivalTolerance: 0,
      replan: 'on-change',
    });
    movement.update(0.3);
    const before = movement.position;
    f.change();
    movement.update(0.1);
    assert.ok(
      (movement.position.x - before.x) * direction.x +
        (movement.position.y - before.y) * direction.y >
        0,
    );
    movement.dispose();
  }
});
function fixture() {
  let revision = 0,
    unknown = false;
  const obstacles: NavigationObstacle[] = [];
  const world = new GridTraversal(
    domain,
    (x, _y, profile) =>
      unknown && x === 6
        ? { status: 'unknown' }
        : {
            status: 'passable',
            cost: profile.capabilities.includes('slow') ? 2 : 1,
          },
    () => revision,
    () => obstacles,
  );
  const navigator = new GridNavigator(world, domain);
  return {
    world,
    navigator,
    obstacles,
    change() {
      revision++;
    },
    unknown(value: boolean) {
      unknown = value;
      revision++;
    },
  };
}
void test('clearance is swept exactly across thin obstacles and rounded rectangle corners in signed coordinates', () => {
  const f = fixture();
  f.obstacles.push({
    id: 'thin',
    bounds: { minX: 0, minY: -20, maxX: 1, maxY: 20 },
  });
  assert.equal(
    f.world.segment({ x: -40, y: 0 }, { x: 40, y: 0 }, actor).status,
    'blocked',
  );
  assert.equal(
    f.world.segment({ x: -40, y: 25 }, { x: 40, y: 25 }, actor).status,
    'passable',
  );
  assert.equal(f.world.point({ x: -1.5, y: 21.5 }, actor).status, 'passable'); // Rounded corner, not expanded square.
  assert.equal(f.world.point({ x: -1, y: 21 }, actor).status, 'blocked');
  assert.equal(f.world.point({ x: -48, y: 0 }, actor).status, 'blocked'); // Boundary contact is blocked.
  assert.equal(
    f.world.point({ x: -47, y: 0 }, { ...actor, clearance: 2 }).status,
    'blocked',
  );
});
void test('game terrain capabilities and entire circle determine walkability; a large actor cannot use a narrow lane', () => {
  const world = new GridTraversal(
    domain,
    (_x, y, profile) =>
      y === 2 || profile.capabilities.includes('fly')
        ? { status: 'passable', cost: 1 }
        : { status: 'blocked' },
    () => 0,
  );
  const nav = new GridNavigator(world, domain);
  assert.equal(
    nav.route({ x: -35, y: -5 }, { x: 35, y: -5 }, actor).status,
    'found',
  );
  assert.equal(
    nav.route({ x: -35, y: -5 }, { x: 35, y: -5 }, { ...actor, radius: 6 })
      .status,
    'unreachable',
  );
  assert.equal(
    world.point({ x: -35, y: 5 }, { ...actor, capabilities: ['fly'] }).status,
    'passable',
  );
});
void test('bounded four-neighbor search is deterministic, chooses terrain cost, and distinguishes unknown, unreachable and limits', () => {
  const world = new GridTraversal(
    domain,
    (_x, y) => ({ status: 'passable', cost: y === 2 ? 20 : 1 }),
    () => 4,
  );
  const nav = new GridNavigator(world, domain);
  const route = nav.route({ x: -35, y: -5 }, { x: 35, y: -5 }, actor);
  assert.equal(route.status, 'found');
  if (route.status === 'found') {
    assert.equal(route.worldRevision, 4);
    assert.ok(route.points.some((p) => p.y !== -5));
    assert.ok(route.distance > 70);
    assert.ok(route.cost < 70 * 20);
    assert.deepEqual(
      route,
      nav.route({ x: -35, y: -5 }, { x: 35, y: -5 }, actor),
    );
  }
  assert.equal(
    new GridNavigator(world, domain, 1).route(
      { x: -35, y: -5 },
      { x: 35, y: -5 },
      actor,
    ).status,
    'limited',
  );
  const f = fixture();
  f.unknown(true);
  assert.equal(
    f.navigator.route({ x: -35, y: -5 }, { x: 35, y: -5 }, actor).status,
    'not-ready',
  );
  f.unknown(false);
  f.obstacles.push({
    id: 'wall',
    bounds: { minX: 0, minY: -30, maxX: 1, maxY: 30 },
  });
  assert.deepEqual(
    f.navigator.route({ x: -35, y: -5 }, { x: 35, y: -5 }, actor),
    { status: 'unreachable', reason: 'no-route' },
  );
});
void test('movement is partition-independent, snapshots are immutable and terminal journeys never track a replacement actor pose', () => {
  const f = fixture();
  const a = new Movement(f.navigator, { x: -35, y: -5 }, actor),
    b = new Movement(f.navigator, { x: -35, y: -5 }, actor);
  const request = {
    destination: { x: 35, y: -5 },
    speed: 20,
    arrivalTolerance: 0.01,
    replan: 'on-change' as const,
  };
  const j = a.move(request),
    k = b.move(request);
  const snapshot = j.snapshot();
  request.destination.x = 30; // Request was copied.
  a.update(4);
  for (let i = 0; i < 240; i++) b.update(1 / 60);
  assert.equal(j.snapshot().status, 'arrived');
  assert.equal(k.snapshot().status, 'arrived');
  assert.ok(
    Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y) < 1e-9,
  );
  assert.equal(snapshot.position.x, -35);
  const finished = j.snapshot();
  a.move({ ...request, destination: { x: -35, y: -5 } });
  a.update(1);
  assert.deepEqual(j.snapshot(), finished);
  a.dispose();
  b.dispose();
});
void test('manual movement stops before a newly inserted obstacle; retry is explicit and cannot tunnel', () => {
  const f = fixture(),
    m = new Movement(f.navigator, { x: -35, y: -5 }, actor);
  const j = m.move({
    destination: { x: 35, y: -5 },
    speed: 1000,
    arrivalTolerance: 0,
    replan: 'manual',
  });
  f.obstacles.push({
    id: 'wall',
    bounds: { minX: 0, minY: -30, maxX: 1, maxY: 30 },
  });
  f.change();
  m.update(1);
  assert.equal(j.snapshot().status, 'blocked');
  assert.ok(m.position.x < 0);
  const before = m.position;
  m.update(5);
  assert.deepEqual(m.position, before);
  f.obstacles.length = 0;
  f.change();
  m.update(1);
  assert.equal(j.snapshot().status, 'blocked');
  j.retry();
  m.update(1);
  assert.equal(j.snapshot().status, 'arrived');
  m.dispose();
});
void test('automatic replanning follows revisions once, waits for readiness and cancellation/disposal never restart work', () => {
  const f = fixture();
  f.unknown(true);
  let searches = 0;
  const source: TraversalWorld = {
    get revision() {
      return f.world.revision;
    },
    point(p, a) {
      searches++;
      return f.world.point(p, a);
    },
    segment(a, b, c) {
      return f.world.segment(a, b, c);
    },
  };
  const m = new Movement(
    new GridNavigator(source, domain),
    { x: -35, y: -5 },
    actor,
  );
  const j = m.move({
    destination: { x: 35, y: -5 },
    speed: 20,
    arrivalTolerance: 0,
    replan: 'on-change',
  });
  assert.equal(j.snapshot().status, 'blocked');
  const count = searches;
  for (let i = 0; i < 20; i++) m.update(0.1);
  assert.equal(searches, count);
  f.unknown(false);
  m.update(0.1);
  assert.equal(j.snapshot().status, 'moving');
  f.obstacles.push({
    id: 'detour',
    bounds: { minX: 0, minY: -10, maxX: 10, maxY: 10 },
  });
  f.change();
  m.update(0.1);
  assert.ok(j.snapshot().route.some((p) => p.y <= -15 || p.y >= 15));
  const replacement = m.move({
    destination: { x: 35, y: 25 },
    speed: 20,
    arrivalTolerance: 0,
    replan: 'manual',
  });
  assert.equal(j.snapshot().status, 'cancelled');
  const cancelled = j.snapshot();
  m.update(0.1);
  assert.deepEqual(j.snapshot(), cancelled);
  m.dispose();
  m.dispose();
  assert.equal(replacement.snapshot().status, 'cancelled');
  assert.throws(() => m.update(0.1), /disposed/);
  assert.throws(
    () =>
      m.move({
        destination: { x: 0, y: 0 },
        speed: 1,
        arrivalTolerance: 0,
        replan: 'manual',
      }),
    /disposed/,
  );
});
void test('invalid inputs fail before replacing a live journey and callbacks cannot supply invalid terrain costs', () => {
  const f = fixture(),
    m = new Movement(f.navigator, { x: -35, y: -5 }, actor);
  const request = {
      destination: { x: 35, y: -5 },
      speed: 20,
      arrivalTolerance: 0,
      replan: 'manual' as const,
    },
    j = m.move(request);
  assert.throws(() => m.move({ ...request, speed: NaN }), /Invalid/);
  assert.equal(j.snapshot().status, 'moving');
  assert.throws(() => m.update(-1), /Invalid/);
  assert.throws(
    () => new GridNavigator(f.world, { ...domain, columns: 5000 }),
    /Invalid/,
  );
  const invalid = new GridTraversal(
    domain,
    () => ({ status: 'passable', cost: 0 }),
    () => 0,
  );
  assert.throws(() => invalid.point({ x: 0, y: 0 }, actor), /cost/);
  assert.throws(
    () =>
      new Movement(f.navigator, { x: 0, y: 0 }, {
        ...actor,
        radius: 0,
      } as ActorTraversal),
    /clearance/,
  );
  m.dispose();
});

void test('movement copies planner-owned route points and rejects a route with invalid endpoints', () => {
  const f = fixture();
  const points = [
    { x: -35, y: -5 },
    { x: 35, y: -5 },
  ];
  const movement = new Movement(
    {
      world: f.world,
      route() {
        return {
          status: 'found',
          points,
          distance: 70,
          cost: 70,
          worldRevision: 0,
        };
      },
    },
    points[0]!,
    actor,
  );
  const journey = movement.move({
    destination: points[1]!,
    speed: 20,
    arrivalTolerance: 0,
    replan: 'manual',
  });
  points[1]!.x = -35;
  movement.update(1);
  assert.equal(movement.position.x, -15);
  assert.equal(journey.snapshot().route[1]!.x, 35);
  assert.ok(Object.isFrozen(journey.snapshot().route));
  assert.throws(
    () =>
      movement.move({
        destination: { x: 25, y: -5 },
        speed: 20,
        arrivalTolerance: 0,
        replan: 'manual',
      }),
    /endpoints/,
  );
  movement.dispose();
});
