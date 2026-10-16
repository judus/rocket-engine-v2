import type { Point } from '../types.js';
import {
  checked,
  validateActor,
  validatePoint,
  validateMoveRequest,
  type ActorTraversal,
  type Journey,
  type JourneySnapshot,
  type JourneyStatus,
  type MoveRequest,
  type RoutePlanner,
} from './contracts.js';
class JourneyRecord implements Journey {
  status: JourneyStatus = 'blocked';
  reason: string | null = null;
  route: readonly Readonly<Point>[] = [];
  revision = -1;
  next = 1;
  position: Readonly<Point>;
  constructor(
    readonly id: string,
    readonly request: MoveRequest,
    position: Readonly<Point>,
    private readonly retryAction: () => void,
  ) {
    this.position = position;
  }
  snapshot(): JourneySnapshot {
    return Object.freeze({
      id: this.id,
      status: this.status,
      reason: this.reason,
      position: this.position,
      destination: this.request.destination,
      route: this.route,
      worldRevision: this.revision,
      nextWaypoint: this.next,
    });
  }
  retry(): void {
    this.retryAction();
  }
  cancel(): void {
    if (this.status === 'moving' || this.status === 'blocked') {
      this.status = 'cancelled';
      this.reason = 'cancelled';
      this.route = [];
    }
  }
}
/** One pose owner. Call update once per simulation update, never from draw. */
export class Movement {
  #position: Readonly<Point>;
  #actor: ActorTraversal;
  #current: JourneyRecord | undefined;
  #nextId = 1;
  #disposed = false;
  constructor(
    readonly navigator: RoutePlanner,
    position: Readonly<Point>,
    actor: ActorTraversal,
  ) {
    validatePoint(position);
    validateActor(actor);
    this.#position = Object.freeze({ ...position });
    this.#actor = Object.freeze({
      ...actor,
      capabilities: Object.freeze([...actor.capabilities]),
    });
  }
  get position(): Readonly<Point> {
    return this.#position;
  }
  move(request: MoveRequest): Journey {
    if (this.#disposed) throw new Error('Movement disposed');
    validateMoveRequest(request);
    this.#current?.cancel();
    const record = new JourneyRecord(
      `journey-${this.#nextId++}`,
      Object.freeze({
        ...request,
        destination: Object.freeze({ ...request.destination }),
      }),
      this.#position,
      () => this.#plan(record),
    );
    this.#current = record;
    this.#plan(record);
    return record;
  }
  #plan(record: JourneyRecord): void {
    if (
      this.#disposed ||
      this.#current !== record ||
      !['blocked', 'moving'].includes(record.status)
    )
      return;
    const result = this.navigator.route(
      this.#position,
      record.request.destination,
      this.#actor,
    );
    record.revision = this.navigator.world.revision;
    record.route = [];
    record.next = 1;
    if (result.status === 'found') {
      const points = result.points.map((point) => {
        validatePoint(point);
        return Object.freeze({ ...point });
      });
      const first = points[0],
        last = points.at(-1);
      if (
        !first ||
        !last ||
        first.x !== this.#position.x ||
        first.y !== this.#position.y ||
        last.x !== record.request.destination.x ||
        last.y !== record.request.destination.y
      )
        throw new Error('Planner returned invalid route endpoints');
      record.route = Object.freeze(points);
      record.status = 'moving';
      record.reason = null;
    } else if (result.status === 'unreachable') {
      record.status = 'unreachable';
      record.reason = result.reason;
    } else {
      record.status = 'blocked';
      record.reason =
        result.status === 'limited'
          ? (result.reason ?? 'search-limit')
          : 'unknown';
    }
  }
  update(dt: number): undefined {
    if (this.#disposed) throw new Error('Movement disposed');
    if (!Number.isFinite(dt) || dt < 0)
      throw new Error('Invalid movement time');
    const j = this.#current;
    if (!j || !['moving', 'blocked'].includes(j.status)) return;
    if (
      j.request.replan === 'on-change' &&
      j.revision !== this.navigator.world.revision
    )
      this.#plan(j);
    if (j.status !== 'moving') return;
    let remaining = j.request.speed * dt;
    if (!Number.isFinite(remaining))
      throw new Error('Movement distance overflow');
    while (j.next < j.route.length) {
      const target = j.route[j.next]!,
        dx = target.x - this.#position.x,
        dy = target.y - this.#position.y,
        length = Math.hypot(dx, dy);
      const travel = Math.min(remaining, length),
        ratio = length === 0 ? 1 : travel / length;
      const next = {
        x: this.#position.x + dx * ratio,
        y: this.#position.y + dy * ratio,
      };
      const result = checked(
        this.navigator.world.segment(this.#position, next, this.#actor),
      );
      if (result.status !== 'passable') {
        j.status = 'blocked';
        j.reason = result.status === 'unknown' ? 'unknown' : 'obstacle';
        return;
      }
      this.#position = Object.freeze(next);
      j.position = this.#position;
      remaining -= travel;
      if (travel < length) break;
      j.next++;
      if (remaining <= 0) break;
    }
    if (
      Math.hypot(
        this.#position.x - j.request.destination.x,
        this.#position.y - j.request.destination.y,
      ) <= j.request.arrivalTolerance
    ) {
      j.status = 'arrived';
      j.reason = null;
    }
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#current?.cancel();
    this.#disposed = true;
  }
}
