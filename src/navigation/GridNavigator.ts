import type { Point } from '../types.js';
import {
  checked,
  validateActor,
  validateDomain,
  validatePoint,
  type ActorTraversal,
  type GridDomain,
  type RouteResult,
  type TraversalWorld,
} from './contracts.js';
/** Deterministic four-neighbor Dijkstra search, bounded finite domain. */
export class GridNavigator {
  readonly domain: GridDomain;
  constructor(
    readonly world: TraversalWorld,
    domain: GridDomain,
    readonly maxVisited = 4096,
  ) {
    validateDomain(domain);
    if (
      !Number.isSafeInteger(maxVisited) ||
      maxVisited <= 0 ||
      maxVisited > 4096
    )
      throw new Error('Invalid search budget');
    this.domain = Object.freeze({ ...domain });
  }
  route(
    start: Readonly<Point>,
    goal: Readonly<Point>,
    actor: ActorTraversal,
  ): RouteResult {
    validatePoint(start);
    validatePoint(goal);
    validateActor(actor);
    const revision = this.world.revision,
      d = this.domain;
    const cell = (p: Readonly<Point>) => ({
      x: Math.floor((p.x - d.minX) / d.tileSize),
      y: Math.floor((p.y - d.minY) / d.tileSize),
    });
    const s = cell(start),
      g = cell(goal);
    const inside = (p: Readonly<Point>) =>
      p.x >= 0 && p.y >= 0 && p.x < d.columns && p.y < d.rows;
    const initial = checked(this.world.point(start, actor)),
      end = checked(this.world.point(goal, actor));
    if (!inside(s) || initial.status === 'blocked')
      return { status: 'unreachable', reason: 'invalid-start' };
    if (!inside(g) || end.status === 'blocked')
      return { status: 'unreachable', reason: 'invalid-goal' };
    if (initial.status === 'unknown' || end.status === 'unknown')
      return { status: 'not-ready' };
    const index = (p: Readonly<Point>) => p.y * d.columns + p.x;
    const center = (id: number) => ({
      x: d.minX + ((id % d.columns) + 0.5) * d.tileSize,
      y: d.minY + (Math.floor(id / d.columns) + 0.5) * d.tileSize,
    });
    const source = index(s),
      target = index(g),
      size = d.columns * d.rows;
    const distance = new Float64Array(size).fill(Infinity),
      previous = new Int32Array(size).fill(-1),
      closed = new Uint8Array(size);
    const first = checked(this.world.segment(start, center(source), actor));
    if (first.status !== 'passable')
      return first.status === 'unknown'
        ? { status: 'not-ready' }
        : { status: 'unreachable', reason: 'no-route' };
    distance[source] =
      Math.hypot(start.x - center(source).x, start.y - center(source).y) *
      first.cost;
    let visited = 0,
      unknown = false;
    while (true) {
      let current = -1,
        best = Infinity;
      for (let id = 0; id < size; id++)
        if (!closed[id] && distance[id]! < best) {
          current = id;
          best = distance[id]!;
        }
      if (current < 0)
        return unknown
          ? { status: 'not-ready' }
          : { status: 'unreachable', reason: 'no-route' };
      if (visited++ >= this.maxVisited) return { status: 'limited' };
      closed[current] = 1;
      if (current === target) {
        const tail = checked(this.world.segment(center(target), goal, actor));
        if (tail.status !== 'passable')
          return tail.status === 'unknown'
            ? { status: 'not-ready' }
            : { status: 'unreachable', reason: 'no-route' };
        const ids = [target];
        let id = target;
        while (id !== source) {
          id = previous[id]!;
          ids.push(id);
        }
        const points = [
          { ...start },
          ...ids.reverse().map(center),
          { ...goal },
        ].filter(
          (p, i, all) =>
            i === 0 || p.x !== all[i - 1]!.x || p.y !== all[i - 1]!.y,
        );
        let cost =
          best +
          Math.hypot(goal.x - center(target).x, goal.y - center(target).y) *
            tail.cost;
        const entry = points[1],
          next = points[2],
          origin = center(source);
        if (entry && next && entry.x === origin.x && entry.y === origin.y) {
          const dx = next.x - entry.x,
            dy = next.y - entry.y,
            ox = start.x - entry.x,
            oy = start.y - entry.y,
            projection = ox * dx + oy * dy;
          // A replan may start partway along the first grid edge. Do not
          // send it back to the cell centre before following that same edge.
          if (
            Math.abs(ox * dy - oy * dx) <= 1e-9 &&
            projection > 0 &&
            projection <= dx * dx + dy * dy
          ) {
            const shortcut = checked(this.world.segment(start, next, actor));
            if (shortcut.status === 'passable') {
              const edge = checked(this.world.segment(entry, next, actor));
              if (edge.status === 'passable') {
                cost +=
                  Math.hypot(next.x - start.x, next.y - start.y) *
                    shortcut.cost -
                  Math.hypot(ox, oy) * first.cost -
                  Math.hypot(dx, dy) * edge.cost;
                points.splice(1, 1);
              }
            }
          }
        }
        let length = 0;
        for (let i = 1; i < points.length; i++)
          length += Math.hypot(
            points[i]!.x - points[i - 1]!.x,
            points[i]!.y - points[i - 1]!.y,
          );
        return {
          status: 'found',
          points: Object.freeze(points.map((p) => Object.freeze(p))),
          distance: length,
          cost,
          worldRevision: revision,
        };
      }
      const x = current % d.columns,
        y = Math.floor(current / d.columns);
      for (const next of [
        { x: x - 1, y },
        { x: x + 1, y },
        { x, y: y - 1 },
        { x, y: y + 1 },
      ]) {
        if (!inside(next)) continue;
        const id = index(next);
        if (closed[id]) continue;
        const result = checked(
          this.world.segment(center(current), center(id), actor),
        );
        if (result.status === 'unknown') {
          unknown = true;
          continue;
        }
        if (result.status === 'blocked') continue;
        const candidate = best + d.tileSize * result.cost;
        if (candidate < distance[id]!) {
          distance[id] = candidate;
          previous[id] = current;
        }
      }
    }
  }
}
