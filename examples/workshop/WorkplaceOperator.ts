import type { Point } from '../../src/types.js';
import type {
  Journey,
  JourneySnapshot,
  MoveRequest,
  JourneyStatus,
} from '../../src/navigation/index.js';
import { validatePoint } from '../../src/navigation/contracts.js';
/** Game-side commands; implementations must tolerate clearing a removed workplace. */
export interface WorkplacePort {
  workplace(id: string): Readonly<Point> | undefined;
  canStand(position: Readonly<Point>): boolean;
  setPresent(id: string, present: boolean): undefined;
}
/** Same boundary for finite Movement and actor-owned streamed movement. */
export interface WorkplaceMovement {
  readonly position: Readonly<Point>;
  move(request: MoveRequest): Journey;
  update(dt: number): undefined;
  dispose(): undefined;
}
export interface WorkerSave {
  readonly position: Readonly<Point>;
  readonly target: string | null;
  readonly destination: Readonly<Point> | null;
  readonly phase: 'idle' | 'travelling' | 'arrived' | 'unreachable';
  readonly reason: string | null;
}
/** One operator and one exclusive attendance slot per target. Owns its movement. */
export class WorkplaceOperator {
  #target: string | undefined;
  #destination: Readonly<Point> | undefined;
  #journey: Journey | undefined;
  #present: string | undefined;
  #disposed = false;
  #settled: 'arrived' | 'unreachable' | undefined;
  #reason: string | null = null;
  constructor(
    private readonly movement: WorkplaceMovement,
    private readonly port: WorkplacePort,
  ) {}
  get position(): Readonly<Point> {
    return this.movement.position;
  }
  snapshot(): {
    readonly target: string | null;
    readonly present: string | null;
    readonly journey: JourneySnapshot | null;
    readonly status: JourneyStatus | null;
    readonly reason: string | null;
  } {
    return Object.freeze({
      target: this.#target ?? null,
      present: this.#present ?? null,
      journey: this.#journey?.snapshot() ?? null,
      status: this.#settled ?? this.#journey?.snapshot().status ?? null,
      reason: this.#settled
        ? this.#reason
        : (this.#journey?.snapshot().reason ?? null),
    });
  }
  assign(id: string): void {
    this.#live();
    const destination = this.port.workplace(id);
    if (!destination) throw new Error('Unavailable workplace');
    validatePoint(destination);
    this.#settled = undefined;
    this.#clearPresence();
    this.#target = id;
    this.#destination = Object.freeze({ ...destination });
    this.#journey = this.movement.move({
      destination: this.#destination,
      speed: 90,
      arrivalTolerance: 0.1,
      replan: 'on-change',
    });
    this.reconcile();
  }
  /** Validate local presence before advancing production; never moves or advances Workshop. */
  reconcile(): void {
    this.#live();
    if (!this.#target || !this.#destination) return;
    const point = this.port.workplace(this.#target);
    if (
      !point ||
      point.x !== this.#destination.x ||
      point.y !== this.#destination.y
    ) {
      this.cancel();
      return;
    }
    const arrived = this.snapshot().status === 'arrived';
    const local =
      arrived &&
      Math.hypot(this.position.x - point.x, this.position.y - point.y) <= 0.1 &&
      this.port.canStand(this.position);
    if (!local) this.#clearPresence();
    else if (this.#present !== this.#target) {
      this.port.setPresent(this.#target, true);
      this.#present = this.#target;
    }
  }
  update(dt: number): undefined {
    this.#live();
    if (!Number.isFinite(dt) || dt < 0)
      throw new Error('Invalid operator update time');
    this.reconcile();
    this.movement.update(dt);
    this.reconcile();
  }
  retry(): void {
    this.#live();
    this.#journey?.retry();
  }
  cancel(): void {
    this.#live();
    this.#clearPresence();
    this.#journey?.cancel();
    this.#target = undefined;
    this.#destination = undefined;
    this.#settled = undefined;
  }
  save(): WorkerSave {
    this.#live();
    const s = this.snapshot();
    return {
      position: { ...this.position },
      target: this.#target ?? null,
      destination: this.#destination ? { ...this.#destination } : null,
      phase: !this.#target
        ? 'idle'
        : s.status === 'arrived'
          ? 'arrived'
          : s.status === 'unreachable'
            ? 'unreachable'
            : 'travelling',
      reason: s.status === 'unreachable' ? s.reason : null,
    };
  }
  /** Host validates the save and restores the pose first. Never restores an attendance assertion. */
  restore(saved: WorkerSave): void {
    this.#live();
    if (
      this.#target ||
      this.#journey ||
      this.position.x !== saved.position.x ||
      this.position.y !== saved.position.y
    )
      throw new Error('Restore requires a fresh operator at the saved pose');
    if (saved.phase === 'idle') return;
    const point = saved.target ? this.port.workplace(saved.target) : undefined;
    if (
      !point ||
      !saved.destination ||
      point.x !== saved.destination.x ||
      point.y !== saved.destination.y
    )
      throw new Error('Saved workplace is unavailable or relocated');
    if (saved.phase === 'travelling') {
      this.assign(saved.target!);
      return;
    }
    this.#target = saved.target!;
    this.#destination = Object.freeze({ ...point });
    this.#settled = saved.phase;
    this.#reason = saved.reason;
    this.reconcile();
  }
  dispose(): undefined {
    if (this.#disposed) return;
    try {
      this.cancel();
    } finally {
      this.#disposed = true;
      this.movement.dispose();
    }
  }
  #clearPresence(): void {
    if (this.#present) {
      this.port.setPresent(this.#present, false);
      this.#present = undefined;
    }
  }
  #live(): void {
    if (this.#disposed) throw new Error('Workplace operator disposed');
  }
}
