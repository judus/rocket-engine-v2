import type { Point } from '../types.js';
import type { Bounds2D } from '../SpatialIndex.js';
import {
  checked,
  validateActor,
  validateDomain,
  validatePoint,
  type ActorTraversal,
  type GridDomain,
  type TraversalResult,
  type TraversalWorld,
} from './contracts.js';
export interface NavigationObstacle {
  readonly id: string;
  readonly bounds: Bounds2D;
}
/** Caller supplies terrain rules/revision; this adapter owns no game state. */
export class GridTraversal implements TraversalWorld {
  readonly domain: GridDomain;
  constructor(
    domain: GridDomain,
    private readonly terrain: (
      x: number,
      y: number,
      actor: ActorTraversal,
    ) => TraversalResult,
    private readonly getRevision: () => number,
    private readonly obstacles: (
      bounds: Bounds2D,
    ) => readonly NavigationObstacle[] = () => [],
  ) {
    validateDomain(domain);
    this.domain = Object.freeze({ ...domain });
  }
  get revision(): number {
    const revision = this.getRevision();
    if (!Number.isSafeInteger(revision) || revision < 0)
      throw new Error('Invalid world revision');
    return revision;
  }
  point(position: Readonly<Point>, actor: ActorTraversal): TraversalResult {
    return this.segment(position, position, actor);
  }
  segment(
    from: Readonly<Point>,
    to: Readonly<Point>,
    actor: ActorTraversal,
  ): TraversalResult {
    validatePoint(from);
    validatePoint(to);
    validateActor(actor);
    const d = this.domain,
      radius = actor.radius + actor.clearance;
    const bounds = {
      minX: Math.min(from.x, to.x) - radius,
      minY: Math.min(from.y, to.y) - radius,
      maxX: Math.max(from.x, to.x) + radius,
      maxY: Math.max(from.y, to.y) + radius,
    };
    if (
      bounds.minX <= d.minX ||
      bounds.minY <= d.minY ||
      bounds.maxX >= d.minX + d.columns * d.tileSize ||
      bounds.maxY >= d.minY + d.rows * d.tileSize
    )
      return { status: 'blocked' };
    for (const obstacle of this.obstacles(bounds)) {
      const b = obstacle.bounds;
      if (
        ![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite) ||
        b.minX >= b.maxX ||
        b.minY >= b.maxY
      )
        throw new Error('Invalid navigation obstacle');
      if (distanceToRect(from, to, b) <= radius * radius)
        return { status: 'blocked' };
    }
    let unknown = false,
      cost = 0,
      count = 0;
    for (
      // Include the lower neighboring row/column conservatively; the exact
      // distance filter below rejects clear tiles without changing clearance.
      let y = Math.floor((bounds.minY - d.minY) / d.tileSize) - 1;
      y <= Math.floor((bounds.maxY - d.minY) / d.tileSize);
      y++
    ) {
      for (
        let x = Math.floor((bounds.minX - d.minX) / d.tileSize) - 1;
        x <= Math.floor((bounds.maxX - d.minX) / d.tileSize);
        x++
      ) {
        const b = {
          minX: d.minX + x * d.tileSize,
          minY: d.minY + y * d.tileSize,
          maxX: d.minX + (x + 1) * d.tileSize,
          maxY: d.minY + (y + 1) * d.tileSize,
        };
        if (distanceToRect(from, to, b) > radius * radius) continue;
        const result = checked(this.terrain(x, y, actor));
        if (result.status === 'blocked') return result;
        if (result.status === 'unknown') unknown = true;
        else {
          cost += result.cost;
          count++;
        }
      }
    }
    return unknown
      ? { status: 'unknown' }
      : checked({ status: 'passable', cost: cost / count });
  }
}
function pointSegment(
  p: Readonly<Point>,
  a: Readonly<Point>,
  b: Readonly<Point>,
): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = dx * dx + dy * dy;
  const t =
    length === 0
      ? 0
      : Math.max(
          0,
          Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length),
        );
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
}
function distanceToRect(
  a: Readonly<Point>,
  b: Readonly<Point>,
  r: Bounds2D,
): number {
  let enter = 0,
    exit = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, r.minX, r.maxX],
    [a.y, b.y - a.y, r.minY, r.maxY],
  ]) {
    if (delta === 0) {
      if (start! < min! || start! > max!) {
        enter = 2;
        break;
      }
    } else {
      const t1 = (min! - start!) / delta!,
        t2 = (max! - start!) / delta!;
      enter = Math.max(enter, Math.min(t1, t2));
      exit = Math.min(exit, Math.max(t1, t2));
    }
  }
  if (enter <= exit) return 0;
  const pointRect = (p: Readonly<Point>) =>
    Math.max(r.minX - p.x, 0, p.x - r.maxX) ** 2 +
    Math.max(r.minY - p.y, 0, p.y - r.maxY) ** 2;
  return Math.min(
    pointRect(a),
    pointRect(b),
    ...[
      { x: r.minX, y: r.minY },
      { x: r.maxX, y: r.minY },
      { x: r.minX, y: r.maxY },
      { x: r.maxX, y: r.maxY },
    ].map((p) => pointSegment(p, a, b)),
  );
}
