import type { Point } from '../../src/types.js';
import {
  GridTraversal,
  Movement,
  type Journey,
  type ActorTraversal,
  type MoveRequest,
} from '../../src/navigation/index.js';
import {
  validatePoint,
  validateMoveRequest,
} from '../../src/navigation/contracts.js';
import {
  ChunkStream,
  chunkSize,
  tileSize,
  type DemandHandle,
  type TileBounds,
} from '../streaming/ChunkStream.js';
import {
  StreamedRoutePlanner,
  defaultRouteBudget,
  type RouteBudget,
} from './StreamedRoutePlanner.js';
const domain = { minX: -1024, minY: -256, columns: 96, rows: 16, tileSize };
const profile: ActorTraversal = {
  radius: 9,
  clearance: 2,
  capabilities: ['walk'],
};
/** Demo adapter: caller owns stream/time; actor owns local demand and a bounded route corridor. */
export class StreamedWalker {
  #actorDemand: DemandHandle;
  #planner: StreamedRoutePlanner;
  #movement: Movement;
  #world: GridTraversal;
  #journey: Journey | undefined;
  #revision = 0;
  #signature = '';
  #disposed = false;
  constructor(
    readonly stream: ChunkStream,
    position: Readonly<Point> = { x: 48, y: 48 },
  ) {
    validatePoint(position);
    if (
      position.x <= domain.minX + 11 ||
      position.x >= domain.minX + domain.columns * tileSize - 11 ||
      position.y <= domain.minY + 11 ||
      position.y >= domain.minY + domain.rows * tileSize - 11
    )
      throw new Error('Actor outside finite proof domain');
    const world = new GridTraversal(
      domain,
      (x, y) => {
        const cell = {
            x: x + domain.minX / tileSize,
            y: y + domain.minY / tileSize,
          },
          tile = stream.read(cell);
        if (tile.state !== 'ready') return { status: 'unknown' };
        return tile.value === 1
          ? { status: 'blocked' }
          : { status: 'passable', cost: tile.value === 2 ? 3 : 1 };
      },
      () => this.#revision,
    );
    this.#planner = new StreamedRoutePlanner(world, domain, stream);
    this.#world = world;
    this.#movement = new Movement(this.#planner, position, profile);
    this.#actorDemand = stream.createDemand();
    try {
      this.#actorDemand.set(this.#local());
    } catch (error) {
      this.#actorDemand.dispose();
      this.#movement.dispose();
      throw error;
    }
  }
  get position(): Readonly<Point> {
    return this.#movement.position;
  }
  snapshot() {
    return Object.freeze({
      position: this.position,
      journey: this.#journey?.snapshot() ?? null,
      actorDemand: !this.#disposed,
      routeDemand: this.#planner.demandActive,
      planning: this.#planner.snapshot(),
    });
  }
  go(
    destination: Readonly<Point>,
    budget: RouteBudget = defaultRouteBudget,
  ): void {
    this.move(
      { destination, speed: 100, arrivalTolerance: 0.1, replan: 'on-change' },
      budget,
    );
  }
  canStand(position: Readonly<Point>): boolean {
    this.#live();
    return this.#world.point(position, profile).status === 'passable';
  }
  move(
    request: MoveRequest,
    budget: RouteBudget = defaultRouteBudget,
  ): Journey {
    this.#live();
    validateMoveRequest(request);
    const destination = request.destination;
    if (
      destination.x <= domain.minX + 11 ||
      destination.x >= domain.minX + domain.columns * tileSize - 11 ||
      destination.y <= domain.minY + 11 ||
      destination.y >= domain.minY + domain.rows * tileSize - 11
    )
      throw new Error('Destination outside finite proof domain');
    this.#planner.begin(this.position, destination, budget);
    this.#syncRevision();
    this.#journey = this.#movement.move(request);
    const journey = this.#journey;
    return Object.freeze({
      id: journey.id,
      snapshot: () => journey.snapshot(),
      retry: () => journey.retry(),
      cancel: () => {
        journey.cancel();
        if (this.#journey === journey) this.#planner.release();
      },
    });
  }
  /** Publish/load once in the host; this consumes readiness and updates one actor. */
  update(dt: number): undefined {
    this.#live();
    if (!Number.isFinite(dt) || dt < 0) throw new Error('Invalid walker time');
    this.#syncRevision();
    this.#movement.update(dt);
    this.#actorDemand.set(this.#local());
    const state = this.#journey?.snapshot();
    if (state) this.#planner.retainRoute(state);
    const status = state?.status;
    if (
      status === 'arrived' ||
      status === 'unreachable' ||
      status === 'cancelled'
    )
      this.#planner.release();
    this.#signature = this.#fingerprint();
  }
  cancel(): void {
    this.#live();
    this.#journey?.cancel();
    this.#planner.release();
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#journey?.cancel();
    this.#planner.release();
    this.#actorDemand.dispose();
    this.#movement.dispose();
    this.#disposed = true;
  }
  #local(): TileBounds {
    const x = Math.floor(this.position.x / tileSize),
      y = Math.floor(this.position.y / tileSize);
    return {
      minX: x - chunkSize,
      minY: y - chunkSize,
      maxX: x + chunkSize + 1,
      maxY: y + chunkSize + 1,
    };
  }
  #fingerprint(): string {
    const keys = new Map<string, { x: number; y: number }>();
    for (const b of [this.#local(), this.#planner.bounds]) {
      if (!b) continue;
      for (
        let y = Math.floor(b.minY / chunkSize) * chunkSize;
        y < b.maxY;
        y += chunkSize
      )
        for (
          let x = Math.floor(b.minX / chunkSize) * chunkSize;
          x < b.maxX;
          x += chunkSize
        )
          keys.set(`${x},${y}`, { x, y });
    }
    return (
      [...keys]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, cell]) => `${id}:${this.stream.read(cell).state}`)
        .join('|') + `:${this.stream.edits.stats.revision}`
    );
  }
  #syncRevision(): void {
    const signature = this.#fingerprint(),
      retry = this.#planner.consumeRetry();
    if (signature !== this.#signature || retry) {
      this.#signature = signature;
      this.#revision++;
    }
  }
  #live(): void {
    if (this.#disposed) throw new Error('Streamed walker disposed');
  }
}
