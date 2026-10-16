import type { Point } from '../types.js';
import type { Bounds2D, SpatialEntry } from '../SpatialIndex.js';
export interface ProjectileOptions2D extends Point {
  vx: number;
  vy: number;
  life: number;
}
export interface ProjectileState2D extends ProjectileOptions2D {
  readonly id: number;
}
export interface SweepHit2D {
  readonly fraction: number;
  readonly normal: Point;
}
export interface ProjectileHit2D<T> {
  readonly projectileId: number;
  readonly target: SpatialEntry<T>;
  readonly position: Point;
  readonly normal: Point;
  /** Seconds from the beginning of this update, not wall-clock time. */
  readonly time: number;
}
function finitePoint(p: Point) {
  if (![p.x, p.y].every(Number.isFinite))
    throw new RangeError('Point must be finite');
}
/** Slab intersection for a point segment against a static axis-aligned rectangle. */
export function sweepPointAabb(
  from: Point,
  to: Point,
  b: Bounds2D,
): SweepHit2D | null {
  finitePoint(from);
  finitePoint(to);
  if (
    ![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite) ||
    b.minX >= b.maxX ||
    b.minY >= b.maxY
  )
    throw new RangeError('Invalid target bounds');
  let enter = 0,
    exit = 1,
    nx = 0,
    ny = 0;
  for (const axis of ['x', 'y'] as const) {
    const start = from[axis],
      delta = to[axis] - start;
    const min = axis === 'x' ? b.minX : b.minY,
      max = axis === 'x' ? b.maxX : b.maxY;
    if (delta === 0) {
      if (start < min || start > max) return null;
      continue;
    }
    const a = (min - start) / delta,
      c = (max - start) / delta;
    const near = Math.min(a, c),
      far = Math.max(a, c);
    if (near > enter) {
      enter = near;
      nx = axis === 'x' ? (delta > 0 ? -1 : 1) : 0;
      ny = axis === 'y' ? (delta > 0 ? -1 : 1) : 0;
    }
    exit = Math.min(exit, far);
    if (enter > exit) return null;
  }
  return { fraction: enter, normal: { x: nx, y: ny } };
}
export type ProjectileQuery2D<T> = (
  bounds: Bounds2D,
) => readonly SpatialEntry<T>[];
/** Host queries eligible targets; the game applies returned hit consequences. No damage model. */
export class Projectiles2D<T> {
  #shots = new Map<number, ProjectileState2D>();
  #next = 0;
  #disposed = false;
  #stepping = false;
  #dropped = 0;
  constructor(
    readonly query: ProjectileQuery2D<T>,
    readonly capacity = 128,
  ) {
    if (typeof query !== 'function')
      throw new TypeError('query must be a function');
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 1_000_000)
      throw new RangeError('Invalid projectile capacity');
  }
  get count() {
    return this.#shots.size;
  }
  get disposed() {
    return this.#disposed;
  }
  get dropped() {
    return this.#dropped;
  }
  #mutable() {
    if (this.#disposed) throw new Error('Projectiles disposed');
    if (this.#stepping)
      throw new Error('Cannot mutate projectiles during query');
  }
  spawn(options: ProjectileOptions2D): number | null {
    this.#mutable();
    finitePoint(options);
    if (
      ![options.vx, options.vy, options.life].every(Number.isFinite) ||
      options.life <= 0
    )
      throw new RangeError('Invalid projectile motion/life');
    if (this.count === this.capacity) {
      this.#dropped++;
      return null;
    }
    const id = ++this.#next;
    this.#shots.set(id, {
      id,
      x: options.x,
      y: options.y,
      vx: options.vx,
      vy: options.vy,
      life: options.life,
    });
    return id;
  }
  cancel(id: number): boolean {
    this.#mutable();
    return this.#shots.delete(id);
  }
  /** Copies for inspection/presentation; callers never receive live projectile state. */
  snapshot(): readonly ProjectileState2D[] {
    return [...this.#shots.values()].map((s) => ({ ...s }));
  }
  update(dt: number): readonly ProjectileHit2D<T>[] {
    this.#mutable();
    if (!Number.isFinite(dt) || dt < 0)
      throw new RangeError('dt must be finite and nonnegative');
    const hits: ProjectileHit2D<T>[] = [];
    const moves: { shot: ProjectileState2D; to: Point; life: number }[] = [];
    this.#stepping = true;
    try {
      for (const shot of this.#shots.values()) {
        const step = Math.min(dt, shot.life),
          from = { x: shot.x, y: shot.y },
          to = { x: shot.x + shot.vx * step, y: shot.y + shot.vy * step };
        finitePoint(to);
        const candidates = this.query({
          minX: Math.min(from.x, to.x) - 1e-7,
          minY: Math.min(from.y, to.y) - 1e-7,
          maxX: Math.max(from.x, to.x) + 1e-7,
          maxY: Math.max(from.y, to.y) + 1e-7,
        });
        if (!Array.isArray(candidates)) {
          // Observe an accidental rejected async query as well as rejecting its contract.
          void Promise.resolve(candidates).catch(() => {});
          throw new TypeError(
            'Projectile query must return a synchronous array',
          );
        }
        let best: { target: SpatialEntry<T>; hit: SweepHit2D } | null = null;
        for (const target of candidates as readonly SpatialEntry<T>[]) {
          const hit = sweepPointAabb(from, to, target.bounds);
          if (
            hit &&
            (!best ||
              hit.fraction < best.hit.fraction ||
              (hit.fraction === best.hit.fraction &&
                target.id < best.target.id))
          )
            best = { target, hit };
        }
        if (best) {
          hits.push({
            projectileId: shot.id,
            target: best.target,
            position: {
              x: from.x + (to.x - from.x) * best.hit.fraction,
              y: from.y + (to.y - from.y) * best.hit.fraction,
            },
            normal: best.hit.normal,
            time: step * best.hit.fraction,
          });
        } else {
          moves.push({ shot, to, life: shot.life - step });
        }
      }
      // Commit only after all queries succeed, so a throwing query cannot lose hit events.
      for (const hit of hits) this.#shots.delete(hit.projectileId);
      for (const { shot, to, life } of moves) {
        shot.x = to.x;
        shot.y = to.y;
        shot.life = life;
        if (life <= 0) this.#shots.delete(shot.id);
      }
      return hits;
    } finally {
      this.#stepping = false;
    }
  }
  clear(): void {
    this.#mutable();
    this.#shots.clear();
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#mutable();
    this.#disposed = true;
    this.#shots.clear();
  }
}
