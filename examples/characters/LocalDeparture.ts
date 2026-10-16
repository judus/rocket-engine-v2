import type { Point } from '../../src/types.js';
import type {
  Journey,
  JourneySnapshot,
  Movement,
} from '../../src/navigation/index.js';
export interface DepartureRequest {
  readonly sessionId: string;
  readonly operationId: string;
  readonly effectKey: string;
  readonly actor: string;
  readonly incarnation: string;
  readonly destinationRef: string;
}
export interface DepartureOutcome {
  readonly request: DepartureRequest;
  readonly journeyId: string;
  readonly status: 'arrived' | 'unreachable' | 'cancelled';
  readonly reason: string | null;
}
type Record = {
  request: DepartureRequest;
  journey: Journey;
  promise: Promise<DepartureOutcome>;
  resolve: (outcome: DepartureOutcome) => void;
  outcome: DepartureOutcome | null;
};
/** Local game authority, not an MCP gateway. Owns one pose and a bounded volatile ledger. */
export class LocalDeparture {
  #records = new Map<string, Record>();
  #active: Record | null = null;
  #last: Record | null = null;
  #retired = false;
  #starts = 0;
  #terminals = 0;
  constructor(
    private readonly movement: Movement,
    private readonly session: () => string,
    private readonly destinations: ReadonlyMap<string, Readonly<Point>>,
    readonly actor = 'mara',
    readonly incarnation = 'mara-body-1',
  ) {
    this.destinations = new Map(
      [...destinations].map(([id, point]) => [id, Object.freeze({ ...point })]),
    );
  }
  get position(): Readonly<Point> {
    return this.movement.position;
  }
  get stats() {
    return Object.freeze({
      starts: this.#starts,
      terminals: this.#terminals,
      retained: this.#records.size,
      retired: this.#retired,
    });
  }
  snapshot(): JourneySnapshot | null {
    return this.#last?.journey.snapshot() ?? null;
  }
  run(request: DepartureRequest): Promise<DepartureOutcome> {
    if (
      request.sessionId !== this.session() ||
      request.actor !== this.actor ||
      request.incarnation !== this.incarnation ||
      !request.operationId ||
      !request.effectKey
    )
      return Promise.reject(new Error('Departure authority mismatch'));
    const point = this.destinations.get(request.destinationRef);
    if (!point)
      return Promise.reject(new Error('Unknown authored destination'));
    const prior = this.#records.get(request.operationId);
    if (prior) {
      if (
        Object.keys(prior.request).some(
          (key) =>
            prior.request[key as keyof DepartureRequest] !==
            request[key as keyof DepartureRequest],
        )
      )
        return Promise.reject(
          new Error('Departure operation identity conflict'),
        );
      return prior.promise;
    }
    if (
      [...this.#records.values()].some(
        (record) => record.request.effectKey === request.effectKey,
      )
    )
      return Promise.reject(new Error('Departure effect identity conflict'));
    if (this.#retired) return Promise.reject(new Error('Actor retired'));
    if (this.#active)
      return Promise.reject(new Error('Actor already travelling'));
    if (this.#records.size >= 128)
      return Promise.reject(new Error('Departure ledger saturated'));
    const journey = this.movement.move({
      destination: point,
      speed: 90,
      arrivalTolerance: 0.5,
      replan: 'on-change',
    });
    let resolve!: (outcome: DepartureOutcome) => void;
    const promise = new Promise<DepartureOutcome>((done) => {
      resolve = done;
    });
    const record: Record = {
      request: Object.freeze({ ...request }),
      journey,
      promise,
      resolve,
      outcome: null,
    };
    this.#records.set(request.operationId, record);
    this.#active = this.#last = record;
    this.#starts++;
    this.#settle();
    return promise;
  }
  update(dt: number): void {
    if (this.#retired) return;
    this.movement.update(dt);
    this.#settle();
  }
  retryRoute(): void {
    this.#active?.journey.retry();
    this.#settle();
  }
  cancel(): void {
    this.#active?.journey.cancel();
    this.#settle();
  }
  #settle(): void {
    const record = this.#active;
    if (!record) return;
    const snapshot = record.journey.snapshot();
    if (snapshot.status === 'moving' || snapshot.status === 'blocked') return;
    const outcome: DepartureOutcome = Object.freeze({
      request: record.request,
      journeyId: snapshot.id,
      status: snapshot.status,
      reason: snapshot.reason,
    });
    record.outcome = outcome;
    this.#active = null;
    this.#terminals++;
    record.resolve(outcome);
  }
  dispose(): undefined {
    if (this.#retired) return;
    this.#retired = true;
    this.cancel();
    this.movement.dispose();
  }
}
