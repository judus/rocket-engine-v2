import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Particles2D,
  Emitter2D,
  ParticleRenderer2D,
} from '../src/effects/index.js';
import { Projectiles2D, sweepPointAabb } from '../src/projectiles/index.js';
import { SpatialIndex } from '../src/SpatialIndex.js';
const spec = {
  x: 10,
  y: 20,
  vx: 4,
  vy: -10,
  ax: 2,
  ay: 8,
  life: 2,
  size: 6,
  endSize: 2,
  color: '#abc',
};
const sample = () => ({ x: 0, y: 0, size: 0, opacity: 0, color: '' });
const box = { minX: 100, minY: 0, maxX: 102, maxY: 100 };
void test('particles integrate constant acceleration independently of frame partition and fade/resize', () => {
  const a = new Particles2D(),
    b = new Particles2D();
  a.spawn(spec);
  b.spawn(spec);
  a.update(1);
  for (let i = 0; i < 10; i++) b.update(0.1);
  const x = sample(),
    y = sample();
  a.sample(0, x);
  b.sample(0, y);
  assert.equal(x.x, 15);
  assert.equal(x.y, 14);
  assert.equal(x.size, 4);
  assert.equal(x.opacity, 0.5);
  for (const k of ['x', 'y', 'size', 'opacity'] as const)
    assert.ok(Math.abs(x[k] - y[k]) < 1e-10);
  a.update(1);
  assert.equal(a.count, 0);
  a.dispose();
  b.dispose();
});
void test('particle capacity, swap removal, snapshots and explicit disposal', () => {
  const p = new Particles2D(2);
  assert.ok(p.spawn({ ...spec, life: 0.1 }));
  p.spawn(spec);
  assert.equal(p.spawn(spec), false);
  assert.equal(p.dropped, 1);
  p.update(0.2);
  assert.equal(p.count, 1);
  const out = sample();
  assert.ok(p.sample(0, out));
  out.x = 900;
  p.sample(0, out);
  assert.notEqual(out.x, 900);
  assert.equal(p.sample(-1, out), false);
  assert.equal(p.sample(0.5, out), false);
  assert.equal(p.sample(4, out), false);
  p.drop(10);
  assert.equal(p.dropped, 11);
  p.clear();
  assert.equal(p.count, 0);
  assert.equal(p.spawned, 2);
  p.spawn(spec, 2);
  assert.equal(p.count, 0);
  p.dispose();
  p.dispose();
  assert.equal(p.sample(0, out), false);
  assert.throws(() => p.update(1), /disposed/);
  assert.throws(() => p.spawn(spec), /disposed/);
  assert.throws(() => p.clear(), /disposed/);
  assert.throws(() => p.drop(1), /disposed/);
});
void test('particle inputs reject invalid motion, times, sizes and capacities', () => {
  for (const n of [0, -1, 1.5, Infinity, 1_000_001])
    assert.throws(() => new Particles2D(n));
  const p = new Particles2D();
  for (const patch of [
    { x: NaN },
    { vy: Infinity },
    { life: 0 },
    { life: NaN },
    { size: -1 },
    { endSize: Infinity },
    { ax: NaN },
  ])
    assert.throws(() => p.spawn({ ...spec, ...patch }));
  assert.throws(() => p.spawn(spec, -1));
  assert.throws(() => p.update(-1));
  assert.throws(() => p.drop(0.5));
  assert.ok(p.spawn({ x: 0, y: 0, vx: 0, vy: 0, life: 1, size: 1 }));
  p.dispose();
});
void test('seeded emitters schedule substep births and preserve one-step versus split-step results', () => {
  const a = new Particles2D(20),
    b = new Particles2D(20),
    options = { rate: 8, life: [2, 2] as const, seed: 76 };
  const ea = new Emitter2D(a, options),
    eb = new Emitter2D(b, options);
  ea.x = eb.x = 12;
  a.update(0.5);
  ea.update(0.5);
  for (let i = 0; i < 4; i++) {
    b.update(0.125);
    eb.update(0.125);
  }
  assert.equal(a.count, 4);
  assert.equal(b.count, 4);
  for (let i = 0; i < 4; i++) {
    const x = sample(),
      y = sample();
    a.sample(i, x);
    b.sample(i, y);
    for (const k of ['x', 'y', 'size', 'opacity'] as const)
      assert.ok(Math.abs(x[k] - y[k]) < 1e-9);
    assert.equal(x.color, y.color);
  }
  ea.emitting = false;
  ea.update(1);
  assert.equal(a.count, 4);
  ea.rate = 0;
  ea.emitting = true;
  ea.update(1);
  assert.equal(a.count, 4);
  ea.dispose();
  ea.dispose();
  assert.equal(ea.disposed, true);
  assert.equal(a.disposed, false);
  assert.throws(() => ea.burst(2), /disposed/);
  assert.throws(() => {
    ea.rate = 1;
  }, /disposed/);
  eb.dispose();
  a.dispose();
  b.dispose();
});
void test('emission work and storage are bounded even for huge bursts or long updates', () => {
  const p = new Particles2D(4),
    e = new Emitter2D(p, { rate: 10000 });
  assert.equal(e.burst(100000), 4);
  assert.equal(p.dropped, 99996);
  e.update(1);
  assert.ok(p.count <= 4);
  assert.equal(p.dropped, 109996); // Four bounded attempts rejected by the full pool, 9996 omitted.
  p.clear();
  e.rate = 1;
  e.update(10);
  assert.ok(p.count <= 4);
  e.dispose();
  p.dispose();
});
void test('emitter defaults and invalid settings fail early', () => {
  const p = new Particles2D(),
    e = new Emitter2D(p);
  e.burst(1);
  assert.equal(p.count, 1);
  assert.equal(e.rate, 80);
  e.rate = 2;
  e.update(0.5);
  for (const o of [
    { rate: -1 },
    { angle: NaN },
    { spread: -1 },
    { speed: [2, 1] as const },
    { life: [0, 1] as const },
    { size: [-1, 1] as const },
    { seed: 0.5 },
    { acceleration: { x: NaN, y: 0 } },
    { endSize: -1 },
  ])
    assert.throws(() => new Emitter2D(p, o));
  for (const n of [-1, 0.5, Infinity]) assert.throws(() => e.burst(n));
  assert.throws(() => e.update(-1));
  assert.throws(() => e.update(Number.MAX_VALUE));
  e.x = NaN;
  assert.throws(() => e.burst(1));
  e.dispose();
  p.dispose();
});
void test('particle drawing is read-only across views and restores Canvas state even after failure', () => {
  const p = new Particles2D();
  p.spawn(spec);
  const renderer = new ParticleRenderer2D(p, true);
  let saves = 0,
    restores = 0,
    draws = 0;
  const ctx = {
    save() {
      saves++;
    },
    restore() {
      restores++;
    },
    fillRect() {
      draws++;
    },
    globalAlpha: 1,
    fillStyle: '',
    globalCompositeOperation: 'source-over',
  };
  const before = sample();
  p.sample(0, before);
  renderer.draw(ctx as unknown as CanvasRenderingContext2D);
  renderer.draw(ctx as unknown as CanvasRenderingContext2D);
  const after = sample();
  p.sample(0, after);
  assert.deepEqual(after, before);
  assert.equal(draws, 2);
  assert.equal(saves, restores);
  ctx.fillRect = () => {
    throw new Error('draw failure');
  };
  assert.throws(
    () => renderer.draw(ctx as unknown as CanvasRenderingContext2D),
    /draw failure/,
  );
  assert.equal(saves, restores);
  p.dispose();
  renderer.draw(ctx as unknown as CanvasRenderingContext2D);
});
void test('point sweeps hit thin targets, axes, tangents, starts inside and reverse directions', () => {
  assert.deepEqual(sweepPointAabb({ x: 0, y: 50 }, { x: 200, y: 50 }, box), {
    fraction: 0.5,
    normal: { x: -1, y: 0 },
  });
  assert.deepEqual(sweepPointAabb({ x: 200, y: 50 }, { x: 0, y: 50 }, box), {
    fraction: 0.49,
    normal: { x: 1, y: 0 },
  });
  assert.deepEqual(sweepPointAabb({ x: 101, y: -10 }, { x: 101, y: 10 }, box), {
    fraction: 0.5,
    normal: { x: 0, y: -1 },
  });
  assert.deepEqual(sweepPointAabb({ x: 101, y: 110 }, { x: 101, y: 90 }, box), {
    fraction: 0.5,
    normal: { x: 0, y: 1 },
  });
  assert.equal(sweepPointAabb({ x: 0, y: 110 }, { x: 200, y: 110 }, box), null);
  assert.equal(
    sweepPointAabb({ x: 0, y: 0 }, { x: 200, y: 0 }, box)?.fraction,
    0.5,
  );
  assert.equal(
    sweepPointAabb({ x: 101, y: 50 }, { x: 101, y: 50 }, box)?.fraction,
    0,
  );
  assert.equal(sweepPointAabb({ x: 0, y: -5 }, { x: 200, y: 0 }, box), null);
  assert.equal(sweepPointAabb({ x: 0, y: 50 }, { x: 50, y: 50 }, box), null);
  assert.equal(sweepPointAabb({ x: 0, y: 50 }, { x: -100, y: 50 }, box), null);
  assert.throws(() => sweepPointAabb({ x: NaN, y: 0 }, { x: 0, y: 0 }, box));
  assert.throws(() =>
    sweepPointAabb({ x: 0, y: 0 }, { x: 0, y: 0 }, { ...box, maxX: 99 }),
  );
});
void test('fast projectiles choose earliest eligible hit independent of query order and retire exactly once', () => {
  const near = { id: 'near', bounds: box, value: 'near' },
    far = { id: 'far', bounds: { ...box, minX: 180, maxX: 182 }, value: 'far' };
  for (const entries of [
    [far, near],
    [near, far],
  ]) {
    const p = new Projectiles2D(() => entries);
    const id = p.spawn({ x: 0, y: 50, vx: 20000, vy: 0, life: 1 });
    const hits = p.update(0.016);
    assert.equal(hits.length, 1);
    assert.equal(hits[0]!.target.value, 'near');
    assert.equal(hits[0]!.projectileId, id);
    assert.equal(hits[0]!.position.x, 100);
    assert.equal(hits[0]!.time, 0.005);
    assert.equal(p.count, 0);
    assert.deepEqual(p.update(1), []);
    p.dispose();
  }
});
void test('projectile broadphase composes with the existing SpatialIndex and host eligibility', () => {
  const index = new SpatialIndex<string>(64);
  index.insert('wall', box, 'wall');
  index.insert('owner', { ...box, minX: 40, maxX: 60 }, 'shooter');
  const p = new Projectiles2D((b) =>
    index.query(b).filter((e) => e.value !== 'shooter'),
  );
  p.spawn({ x: 0, y: 50, vx: 1000, vy: 0, life: 1 });
  assert.equal(p.update(0.5)[0]!.target.id, 'wall');
  p.dispose();
  index.dispose();
});
void test('projectile lifetime clips sweep before expiration, misses and cancellation cleanly retire', () => {
  const p = new Projectiles2D(() => [{ id: 'wall', bounds: box, value: 0 }], 2);
  const a = p.spawn({ x: 0, y: 50, vx: 1000, vy: 0, life: 0.05 })!;
  p.spawn({ x: 0, y: 200, vx: 1000, vy: 0, life: 1 });
  assert.equal(p.spawn({ x: 0, y: 0, vx: 0, vy: 0, life: 1 }), null);
  assert.equal(p.dropped, 1);
  assert.deepEqual(p.update(0.1), []);
  assert.equal(p.count, 1);
  assert.equal(p.cancel(a), false);
  const snapshot = p.snapshot();
  assert.equal(snapshot[0]!.x, 100);
  (snapshot[0] as { x: number }).x = 999;
  assert.equal(p.snapshot()[0]!.x, 100);
  assert.equal(p.cancel(snapshot[0]!.id), true);
  p.clear();
  assert.equal(p.count, 0);
  p.dispose();
  p.dispose();
  assert.equal(p.disposed, true);
  assert.throws(
    () => p.spawn({ x: 0, y: 0, vx: 0, vy: 0, life: 1 }),
    /disposed/,
  );
  assert.throws(() => p.update(1), /disposed/);
});
void test('projectile ties use stable IDs; zero dt detects initial overlaps', () => {
  const p = new Projectiles2D(() => [
    { id: 'z', bounds: box, value: 0 },
    { id: 'a', bounds: box, value: 1 },
  ]);
  p.spawn({ x: 101, y: 50, vx: 10, vy: 0, life: 1 });
  assert.equal(p.update(0)[0]!.target.id, 'a');
  p.dispose();
});
void test('query failure releases update guard and rejects async/reentrant mutations', async () => {
  let mode = 'throw';
  const p = new Projectiles2D<number>(() => {
    if (mode === 'throw') throw new Error('query failure');
    if (mode === 'reenter') p.clear();
    if (mode === 'async')
      return Promise.reject(new Error('async rejection')) as unknown as [];
    return [];
  });
  p.spawn({ x: 0, y: 0, vx: 1, vy: 0, life: 1 });
  assert.throws(() => p.update(0.1), /query failure/);
  assert.equal(p.snapshot()[0]!.x, 0);
  mode = 'reenter';
  assert.throws(() => p.update(0.1), /during query/);
  mode = 'async';
  assert.throws(() => p.update(0.1), /synchronous/);
  await Promise.resolve();
  mode = 'ok';
  p.update(0.1);
  p.dispose();
});
void test('invalid projectile options fail without admitting a shot', () => {
  assert.throws(() => new Projectiles2D(() => [], 0));
  assert.throws(() => new Projectiles2D(null as unknown as () => []));
  const p = new Projectiles2D(() => []);
  for (const patch of [{ life: 0 }, { vx: Infinity }, { x: NaN }])
    assert.throws(() =>
      p.spawn({ x: 0, y: 0, vx: 1, vy: 0, life: 1, ...patch }),
    );
  assert.throws(() => p.update(-1));
  assert.equal(p.count, 0);
  p.dispose();
});

void test('two Rocket views share one fixed particle simulation and scene-owned cleanup', async () => {
  const { withHost } = await import('./helpers/inputHost.js');
  const { Rocket, Scene2D } = await import('../src/index.js');
  await withHost(async (host) => {
    const app = new Rocket({ fixed: { step: 1 / 60 } }),
      p = new Particles2D(),
      e = new Emitter2D(p, { rate: 60 });
    let updates = 0,
      draws = 0;
    const scene = app.scene(
      new Scene2D({
        fixedUpdate(dt): undefined {
          updates++;
          p.update(dt);
          e.update(dt);
        },
        draw(): undefined {
          draws++;
        },
      }),
    );
    scene.own(p);
    scene.own(e);
    const a = app.view({ target: host.target, scene }),
      b = app.view({ target: host.target, scene });
    await app.start();
    host.frame(0);
    host.frame(34);
    assert.equal(updates, 2);
    assert.equal(p.count, 2);
    assert.equal(draws, 4);
    a.dispose();
    host.frame(51);
    assert.equal(updates, 3);
    assert.equal(p.count, 3);
    await app.dispose();
    assert.equal(p.count, 0);
    assert.equal(p.disposed, true);
    assert.equal(e.disposed, true);
    assert.equal(b.disposed, true);
  });
});
void test('a later query error cannot retire an earlier hit without delivering its event', () => {
  let fails = true,
    calls = 0;
  const p = new Projectiles2D(() => {
    calls++;
    if (fails && calls === 2) throw new Error('later query');
    return [{ id: 'wall', bounds: box, value: 0 }];
  });
  p.spawn({ x: 0, y: 50, vx: 1000, vy: 0, life: 1 });
  p.spawn({ x: 0, y: 50, vx: 1000, vy: 0, life: 1 });
  assert.throws(() => p.update(0.2), /later query/);
  assert.equal(p.count, 2);
  assert.equal(p.snapshot()[0]!.x, 0);
  fails = false;
  assert.equal(p.update(0.2).length, 2);
  assert.equal(p.count, 0);
  p.dispose();
});
