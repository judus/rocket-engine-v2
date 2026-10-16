# Particles and projectiles — first 2D milestones

Two independent systems, both driven by Rocket's existing scene/fixed clock.
Neither starts a timer, creates rigid bodies or makes a scene node per particle.
No new external dependency. These are additive exports; existing demos and
runtime APIs are unchanged.

## Particle pool and emitters

```ts
import {
  Particles2D,
  Emitter2D,
  ParticleRenderer2D,
} from 'rocket-engine-v2/effects';

const particles = scene.own(new Particles2D(4096));
const emitter = scene.own(
  new Emitter2D(particles, {
    rate: 200,
    seed: 42,
    angle: -Math.PI / 2,
    spread: Math.PI / 3,
    speed: [80, 240],
    life: [0.4, 1.4],
    size: [2, 5],
    endSize: 0,
    acceleration: { x: 0, y: 150 },
    color: '#ffb75c',
  }),
);
const renderer = new ParticleRenderer2D(particles, true);
emitter.x = 260;
emitter.y = 350;

// Existing scene.fixedUpdate(dt), once across every view:
particles.update(dt);
emitter.update(dt);
// Existing scene.draw(ctx), independently for every view:
renderer.draw(ctx);
```

`Particles2D(capacity = 2048)` owns dense preallocated numeric storage. Inactive
slots are reused; death swaps the last live slot into the removed slot, so no
particle identity or stable draw order is promised. Disposal releases storage.
`count`, `spawned`, `dropped`, `capacity` and `disposed` are observable.

`spawn({ x, y, vx, vy, life, size, endSize?, ax?, ay?, color? }, age = 0)` returns
whether a live slot was accepted. Life is seconds; velocity is world units/second;
acceleration is units/second². Nonnegative age supports scheduled substep births.
An already expired birth is ignored; a full pool drops the new particle.
`sample(index, out)` copies position, interpolated size, opacity and color into
caller-owned scratch storage. `clear()` retains capacity, `dispose()` is final and
idempotent. `drop(count)` records emission attempts deliberately omitted by a
bounded producer. Direct callers should bound their own spawn loops.

`Emitter2D(pool, options)` does not own the pool: multiple emitters can share it.
`x/y` locate future births in world space; moving an emitter does not drag existing
particles. Mutable `rate` and `emitting` control continuous emission. `burst(count)`
is independent of the continuous toggle. `update(dt)` accumulates fractional
emission and ages scheduled births inside the step; update the pool before its
emitters. Constant acceleration integrates analytically, avoiding the usual
velocity-first frame-partition drift. Size interpolates linearly; opacity fades
linearly to zero. No general curve editor or callbacks in the hot loop.

Emission work per call is bounded by pool capacity, including a huge burst. Excess
attempts increment `dropped`; continuous overload keeps the latest scheduled
births. Overflow does not create backlog or allocate extra particle slots. Under
capacity pressure, emission order and step partition can affect which particles
survive, and skipped random samples are not replayed. Do not use visual RNG or
counters for authoritative gameplay. The seed is for reproducible demonstrations.

The Canvas adapter draws squares, optionally additive. It reuses one scratch
sample and restores Canvas state even on drawing failure. Drawing does not age
particles. Both demonstrations show two views of the same simulation, with
performance readouts above and controls below the primary canvas.

## Projectile simulation and hit records

```ts
import { Projectiles2D } from 'rocket-engine-v2/projectiles';

// Rocket's existing SpatialIndex; the game owns membership and eligibility.
const projectiles = scene.own(
  new Projectiles2D(
    (bounds) =>
      targets
        .query(bounds)
        .filter((entry) => entry.value.team !== shooter.team),
    128,
  ),
);
const id = projectiles.spawn({ x: 60, y: 220, vx: 20000, vy: 0, life: 2 });

// Existing fixed update. No damage or effects callback executes inside the query.
for (const hit of projectiles.update(dt)) {
  // Game validates/applies damage here, if its rules require it.
  impact.x = hit.position.x;
  impact.y = hit.position.y;
  impact.burst(36);
}
```

Point projectiles use constant velocity and a bounded live-shot map. `spawn` returns
a monotonically increasing numeric ID, or null when full; `cancel(id)` retires one,
`clear()` retires all and `dispose()` releases final ownership. `snapshot()` returns
copies for inspection/presentation; mutating those copies cannot alter simulation.
This first small projectile milestone favors explicit records over a complex pool.

The host's synchronous query receives the swept AABB and returns eligible
`SpatialEntry<T>[]`. It may use the existing SpatialIndex or a small static list.
The narrow phase `sweepPointAabb(from, to, bounds)` uses slab intersection and
returns the entry fraction and surface normal. Targets are closed rectangles for
collision: touching counts. Starting inside reports fraction zero and zero normal.
Equal-fraction ties use the lexicographically smallest target ID. No target data is
mutated by the engine. The game must keep target geometry stable during the step.

A step selects the earliest eligible collision on the complete path, clipped to
remaining projectile life. Contact exactly at the lifetime endpoint wins over
expiration. Hit records contain `projectileId`, target entry, position, normal and
seconds from step start (`time`). Shots retire before events are returned; no
second hit appears in a later update. The game owns damage, teams, pierce/bounce
policy and hit consequence deduplication beyond this projectile lifetime.

All target queries must succeed before the step commits. A throwing/async query
leaves shots unchanged and throws; accidental rejected Promise results are
observed. Queries cannot spawn/cancel/clear/dispose this same system during a step.
Keep queries pure; any external query side effects are the host's responsibility.

## Scope and demonstrations

- [particles.html](../particles.html): sparks, plume, pointer bursts, bounded
  100,000-attempt overload, pause, clear, dispose and seeded recreation.
- [projectiles.html](../projectiles.html): 4-pixel static targets versus shots up to
  20,000 pixels/second (333 pixels per 60 Hz step), earliest-hit records, separate
  trails/impact particles, pointer/Space firing and resource cleanup.

Particles are visual effects only. Projectiles are point sweeps against static,
axis-aligned targets: no finite-radius collision, moving-target relative sweep,
ballistics, physics-body adapter, ricochet, piercing, damage, replication or
persistence. Canvas is the initial presentation adapter; GPU batching, textured
sprites and 3D renderers are future slices, not hidden fallbacks. Neither system
is coupled to the cockpit, Workshop, CFW or game inventory.

Fixed simulation steps bound work. Rocket's existing maxSteps policy still governs
large stalls; these systems do not add another clock or catch up hidden-page time.

## Verification

The effects/projectiles tests cover analytic motion and frame partition, expiry
and compaction, bounded overload, repeatable substep emission, read-only two-view
rendering, disposal, fast/thin and reverse/parallel/tangent/overlap sweeps, target
ordering, eligibility via the existing index, lifetime clipping, cancellation,
query failure atomicity, and actual Rocket fixed-step ownership across two views.
`npm run check` passes **478 tests** (16 new), strict TypeScript, type-aware
lint, formatting, build and the coverage gate. All six new runtime modules report
100% lines/branches/functions in that run; their new floors are 99.5%, and existing
module floors are unchanged. Log: `/tmp/rocket-effects-check.log`.

Native browser verification: overload records 95,904 drops without exceeding the
4,096 pool; particle and projectile disposal each reports zero particles,
projectiles, spatial entries and canvases. Recreate succeeds. A 20,000 px/s shot
hits the near target at x480 (within-step 4.33 ms); disabling near-target eligibility
hits far at x760 (1.67 ms). Re-enabling near selects it again; exactly two fired
shots give two hits. Pause retains the displayed state. Both pages have two live
canvases and no captured console warnings/errors. Screenshots:
`/tmp/rocket-particles.png`, `/tmp/rocket-projectiles.png`.

These are bounded controlled-host and native-browser proofs, not a GPU/3D,
performance benchmark, moving-target, or hardware/browser compatibility claim.
