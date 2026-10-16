import type { Point } from '../types.js';
export interface ActorTraversal {
  readonly radius: number;
  readonly clearance: number;
  readonly capabilities: readonly string[];
}
export type TraversalResult =
  | { readonly status: 'passable'; readonly cost: number }
  | { readonly status: 'blocked' }
  | { readonly status: 'unknown' };
export interface TraversalWorld {
  readonly revision: number;
  point(position: Readonly<Point>, actor: ActorTraversal): TraversalResult;
  segment(
    from: Readonly<Point>,
    to: Readonly<Point>,
    actor: ActorTraversal,
  ): TraversalResult;
}
export interface GridDomain {
  readonly minX: number;
  readonly minY: number;
  readonly columns: number;
  readonly rows: number;
  readonly tileSize: number;
}
export type RouteResult =
  | {
      readonly status: 'found';
      readonly points: readonly Readonly<Point>[];
      readonly distance: number;
      readonly cost: number;
      readonly worldRevision: number;
    }
  | {
      readonly status: 'unreachable';
      readonly reason: 'invalid-start' | 'invalid-goal' | 'no-route';
    }
  | { readonly status: 'not-ready' }
  | {
      readonly status: 'limited';
      readonly reason?: 'search-limit' | 'corridor-limit' | 'demand-limit';
    };
export interface RoutePlanner {
  readonly world: TraversalWorld;
  route(
    start: Readonly<Point>,
    goal: Readonly<Point>,
    actor: ActorTraversal,
  ): RouteResult;
}
export interface MoveRequest {
  readonly destination: Readonly<Point>;
  readonly speed: number;
  readonly arrivalTolerance: number;
  readonly replan: 'on-change' | 'manual';
}
export type JourneyStatus =
  'moving' | 'blocked' | 'arrived' | 'unreachable' | 'cancelled';
export interface JourneySnapshot {
  readonly id: string;
  readonly status: JourneyStatus;
  readonly reason: string | null;
  readonly position: Readonly<Point>;
  readonly destination: Readonly<Point>;
  readonly route: readonly Readonly<Point>[];
  readonly worldRevision: number;
  readonly nextWaypoint: number;
}
export interface Journey {
  readonly id: string;
  snapshot(): JourneySnapshot;
  retry(): void;
  cancel(): void;
}
export function validatePoint(p: Readonly<Point>): void {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
    throw new Error('Invalid navigation point');
}
export function validateMoveRequest(request: MoveRequest): void {
  validatePoint(request.destination);
  if (
    !Number.isFinite(request.speed) ||
    request.speed <= 0 ||
    !Number.isFinite(request.arrivalTolerance) ||
    request.arrivalTolerance < 0 ||
    !['on-change', 'manual'].includes(request.replan)
  )
    throw new Error('Invalid movement request');
}
export function validateActor(actor: ActorTraversal): void {
  if (
    !Number.isFinite(actor.radius) ||
    actor.radius <= 0 ||
    !Number.isFinite(actor.clearance) ||
    actor.clearance < 0 ||
    !Number.isFinite(actor.radius + actor.clearance)
  )
    throw new Error('Invalid actor clearance');
}
export function validateDomain(d: GridDomain): void {
  if (
    ![d.minX, d.minY].every(Number.isFinite) ||
    !Number.isFinite(d.tileSize) ||
    d.tileSize <= 0 ||
    !Number.isSafeInteger(d.columns) ||
    !Number.isSafeInteger(d.rows) ||
    d.columns <= 0 ||
    d.rows <= 0 ||
    d.columns * d.rows > 4096 ||
    !Number.isFinite(d.minX + d.columns * d.tileSize) ||
    !Number.isFinite(d.minY + d.rows * d.tileSize)
  )
    throw new Error('Invalid finite grid (maximum 4096 cells)');
}
export function checked(result: TraversalResult): TraversalResult {
  if (
    result.status === 'passable' &&
    (!Number.isFinite(result.cost) || result.cost <= 0)
  )
    throw new Error('Traversal cost must be finite and positive');
  return result;
}
