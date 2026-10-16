import {
  validateDomain,
  validatePoint,
} from '../../src/navigation/contracts.js';
import type { Point } from '../../src/types.js';
import {
  GridNavigator,
  type ActorTraversal,
  type GridDomain,
  type JourneySnapshot,
  type RoutePlanner,
  type RouteResult,
  type TraversalWorld,
} from '../../src/navigation/index.js';
import {
  chunkSize,
  tileSize,
  type ChunkStream,
  type DemandHandle,
  type TileBounds,
} from '../streaming/ChunkStream.js';
export interface RouteBudget {
  readonly maxChunks: number;
  readonly maxExpansions: number;
  readonly maxVisited: number;
}
export const defaultRouteBudget: RouteBudget = Object.freeze({
  maxChunks: 24,
  maxExpansions: 4,
  maxVisited: 4096,
});
/** Demand/search policy only; delegates each search to GridNavigator. */
export class StreamedRoutePlanner implements RoutePlanner {
  #handle: DemandHandle | undefined;
  #bounds: Readonly<TileBounds> | undefined;
  #budget: RouteBudget = defaultRouteBudget;
  #expansions = 0;
  #totalExpansions = 0;
  readonly domain: GridDomain;
  #phase:
    'idle' | 'loading' | 'following' | 'budget-exhausted' | 'unreachable' =
    'idle';
  #limit: 'search-limit' | 'corridor-limit' | 'demand-limit' | undefined;
  #retry = false;
  constructor(
    readonly world: TraversalWorld,
    domain: GridDomain,
    private readonly stream: ChunkStream,
  ) {
    validateDomain(domain);
    if (
      domain.tileSize !== tileSize ||
      ![
        domain.minX / tileSize,
        domain.minY / tileSize,
        domain.columns,
        domain.rows,
      ].every((n) => Number.isInteger(n / chunkSize))
    )
      throw new Error('Corridor domain must align to stream chunks');
    this.domain = Object.freeze({ ...domain });
  }
  get bounds(): Readonly<TileBounds> | undefined {
    return this.#bounds;
  }
  get demandActive(): boolean {
    return !!this.#handle;
  }
  snapshot() {
    return Object.freeze({
      phase: this.#phase,
      expansions: this.#totalExpansions,
      planExpansions: this.#expansions,
      requestedChunks: this.#bounds ? this.#count(this.#bounds) : 0,
      budget: this.#budget,
      bounds: this.#bounds ?? null,
    });
  }
  begin(
    start: Readonly<Point>,
    goal: Readonly<Point>,
    budget: RouteBudget = defaultRouteBudget,
  ): void {
    validatePoint(start);
    validatePoint(goal);
    this.#restart(start, goal, budget, true);
  }
  #restart(
    start: Readonly<Point>,
    goal: Readonly<Point>,
    budget: RouteBudget,
    newRequest: boolean,
  ): void {
    if (
      !Number.isInteger(budget.maxChunks) ||
      budget.maxChunks < 1 ||
      budget.maxChunks > 24 ||
      !Number.isInteger(budget.maxExpansions) ||
      budget.maxExpansions < 0 ||
      budget.maxExpansions > 4 ||
      !Number.isInteger(budget.maxVisited) ||
      budget.maxVisited < 1 ||
      budget.maxVisited > 4096
    )
      throw new Error('Invalid route budget');
    if (newRequest) this.#totalExpansions = 0;
    this.#budget = Object.freeze({ ...budget });
    this.#expansions = 0;
    this.#limit = undefined;
    this.#retry = false;
    this.#phase = 'loading';
    this.#set(this.#box([start, goal]));
  }
  consumeRetry(): boolean {
    const retry = this.#retry;
    this.#retry = false;
    return retry;
  }
  route(
    start: Readonly<Point>,
    goal: Readonly<Point>,
    actor: ActorTraversal,
  ): RouteResult {
    if (this.#limit) return { status: 'limited', reason: this.#limit };
    if (!this.#bounds) return { status: 'not-ready' };
    if (this.#phase === 'following') {
      this.#restart(start, goal, this.#budget, false);
      if (this.#limit) return { status: 'limited', reason: this.#limit };
    }
    const b = this.#bounds!;
    for (let y = b.minY; y < b.maxY; y += chunkSize)
      for (let x = b.minX; x < b.maxX; x += chunkSize)
        if (this.stream.read({ x, y }).state !== 'ready') {
          this.#phase = 'loading';
          return { status: 'not-ready' };
        }
    const result = new GridNavigator(
      this.world,
      {
        minX: b.minX * tileSize,
        minY: b.minY * tileSize,
        columns: b.maxX - b.minX,
        rows: b.maxY - b.minY,
        tileSize,
      },
      this.#budget.maxVisited,
    ).route(start, goal, actor);
    if (result.status === 'found') {
      this.#phase = 'following';
      return result;
    }
    if (result.status === 'limited') {
      this.#exhaust('search-limit');
      return { status: 'limited', reason: 'search-limit' };
    }
    if (result.status !== 'unreachable') {
      this.#phase = 'loading';
      return result;
    }
    if (result.reason !== 'no-route' || this.#full(b)) {
      this.#phase = 'unreachable';
      return result;
    }
    if (this.#expansions >= this.#budget.maxExpansions) {
      this.#exhaust('corridor-limit');
      return { status: 'limited', reason: 'corridor-limit' };
    }
    const wider = this.#clamp({
      minX: b.minX - chunkSize,
      minY: b.minY - chunkSize,
      maxX: b.maxX + chunkSize,
      maxY: b.maxY + chunkSize,
    });
    if (this.#count(wider) > this.#budget.maxChunks) {
      this.#exhaust('corridor-limit');
      return { status: 'limited', reason: 'corridor-limit' };
    }
    if (!this.#set(wider)) return { status: 'limited', reason: 'demand-limit' };
    this.#expansions++;
    this.#totalExpansions++;
    this.#retry = true;
    this.#phase = 'loading';
    return { status: 'not-ready' };
  }
  retainRoute(state: JourneySnapshot): void {
    if (state.status !== 'moving' || this.#phase !== 'following') return;
    const bounds = this.#box([
        state.position,
        ...state.route.slice(state.nextWaypoint),
      ]),
      old = this.#bounds;
    if (
      old &&
      bounds.minX >= old.minX &&
      bounds.minY >= old.minY &&
      bounds.maxX <= old.maxX &&
      bounds.maxY <= old.maxY
    )
      this.#set(bounds);
  }
  release(): void {
    this.#handle?.dispose();
    this.#handle = undefined;
    this.#bounds = undefined;
    this.#retry = false;
    this.#phase = 'idle';
    this.#limit = undefined;
  }
  #set(bounds: Readonly<TileBounds>): boolean {
    if (this.#count(bounds) > this.#budget.maxChunks) {
      this.release();
      this.#exhaust('demand-limit');
      return false;
    }
    const handle = this.#handle ?? this.stream.createDemand();
    try {
      handle.set(bounds);
    } catch (error) {
      if (handle !== this.#handle) handle.dispose();
      if (!(error instanceof RangeError)) throw error;
      this.release();
      this.#exhaust('demand-limit');
      return false;
    }
    this.#handle = handle;
    this.#bounds = Object.freeze({ ...bounds });
    return true;
  }
  #exhaust(reason: 'search-limit' | 'corridor-limit' | 'demand-limit'): void {
    this.#limit = reason;
    this.#phase = 'budget-exhausted';
    this.#retry = false;
  }
  #count(b: Readonly<TileBounds>): number {
    return ((b.maxX - b.minX) * (b.maxY - b.minY)) / (chunkSize * chunkSize);
  }
  #box(points: readonly Readonly<Point>[]): Readonly<TileBounds> {
    return this.#clamp({
      minX:
        Math.floor(
          (Math.floor(Math.min(...points.map((p) => p.x)) / tileSize) - 1) /
            chunkSize,
        ) * chunkSize,
      minY:
        Math.floor(
          (Math.floor(Math.min(...points.map((p) => p.y)) / tileSize) - 1) /
            chunkSize,
        ) * chunkSize,
      maxX:
        Math.ceil(
          (Math.floor(Math.max(...points.map((p) => p.x)) / tileSize) + 2) /
            chunkSize,
        ) * chunkSize,
      maxY:
        Math.ceil(
          (Math.floor(Math.max(...points.map((p) => p.y)) / tileSize) + 2) /
            chunkSize,
        ) * chunkSize,
    });
  }
  #clamp(b: TileBounds): Readonly<TileBounds> {
    return Object.freeze({
      minX: Math.max(this.domain.minX / tileSize, b.minX),
      minY: Math.max(this.domain.minY / tileSize, b.minY),
      maxX: Math.min(this.domain.minX / tileSize + this.domain.columns, b.maxX),
      maxY: Math.min(this.domain.minY / tileSize + this.domain.rows, b.maxY),
    });
  }
  #full(b: Readonly<TileBounds>): boolean {
    return (
      b.minX === this.domain.minX / tileSize &&
      b.minY === this.domain.minY / tileSize &&
      b.maxX === this.domain.minX / tileSize + this.domain.columns &&
      b.maxY === this.domain.minY / tileSize + this.domain.rows
    );
  }
}
