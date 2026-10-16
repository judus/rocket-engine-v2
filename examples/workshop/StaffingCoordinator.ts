import type { Point } from '../../src/types.js';
import { validatePoint } from '../../src/navigation/contracts.js';
import {
  WorkplaceOperator,
  type WorkplaceMovement,
  type WorkerSave,
} from './WorkplaceOperator.js';
export interface StaffingSlot {
  readonly id: string;
  readonly workplace: string;
  readonly position: Readonly<Point>;
}
export interface StaffingPort {
  slots(): readonly StaffingSlot[];
  canStand(worker: string, position: Readonly<Point>): boolean;
  setAttendance(workplace: string, count: number): void;
}
export interface StaffWorkerSave extends WorkerSave {
  readonly id: string;
}
export interface SlotReservation {
  readonly slot: string;
  readonly worker: string;
}
/** Game adapter. Owns operators and reservations; publishes counts, never advances production. */
export class Staffing {
  #workers = new Map<string, WorkplaceOperator>();
  #reservations = new Map<string, string>();
  #present = new Map<string, string>();
  #published = new Map<string, number>();
  #disposed = false;
  constructor(private readonly port: StaffingPort) {
    this.#slots();
  }
  #slots(): readonly StaffingSlot[] {
    const slots = this.port.slots(),
      ids = new Set<string>();
    for (const slot of slots) {
      if (!slot.id || !slot.workplace || ids.has(slot.id))
        throw new Error('Invalid staffing slots');
      validatePoint(slot.position);
      ids.add(slot.id);
    }
    return slots;
  }
  add(id: string, movement: WorkplaceMovement): void {
    this.#live();
    if (!id || this.#workers.has(id))
      throw new Error('Duplicate or invalid worker ID');
    const operator = new WorkplaceOperator(movement, {
      workplace: (slot) => this.#slots().find((s) => s.id === slot)?.position,
      canStand: (p) => this.port.canStand(id, p),
      setPresent: (slot, present) => {
        if (present) {
          if (this.#reservations.get(slot) !== id)
            throw new Error('Attendance requires reservation');
          const workplace = this.#slots().find((s) => s.id === slot)?.workplace;
          if (!workplace) throw new Error('Missing staffing slot');
          this.#present.set(id, workplace);
        } else this.#present.delete(id);
        this.#publish();
      },
    });
    this.#workers.set(id, operator);
  }
  #worker(id: string): WorkplaceOperator {
    this.#live();
    const worker = this.#workers.get(id);
    if (!worker) throw new Error('Unknown worker');
    return worker;
  }
  assign(workerId: string, slotId: string): void {
    const worker = this.#worker(workerId),
      slot = this.#slots().find((s) => s.id === slotId);
    if (!slot) throw new Error('Unavailable staffing slot');
    const owner = this.#reservations.get(slotId);
    if (owner && owner !== workerId)
      throw new Error(`Slot reserved by ${owner}`);
    // Reject conflicts before clearing a valid assignment or acquiring anything.
    this.cancel(workerId);
    this.#reservations.set(slotId, workerId);
    try {
      worker.assign(slotId);
      this.#reconcileReservations();
    } catch (error) {
      worker.cancel();
      this.#release(workerId);
      throw error;
    }
  }
  cancel(id: string): void {
    this.#worker(id).cancel();
    this.#release(id);
  }
  remove(id: string): void {
    const worker = this.#worker(id);
    try {
      worker.dispose();
    } finally {
      this.#workers.delete(id);
      this.#release(id);
    }
  }
  reconcile(): void {
    this.#live();
    for (const worker of this.#workers.values()) worker.reconcile();
    this.#reconcileReservations();
    this.#publish();
  }
  update(dt: number): undefined {
    this.#live();
    if (!Number.isFinite(dt) || dt < 0)
      throw new Error('Invalid staffing time');
    for (const worker of this.#workers.values()) worker.update(dt);
    this.#reconcileReservations();
    this.#publish();
  }
  #reconcileReservations(): void {
    for (const [slot, id] of this.#reservations) {
      const s = this.#workers.get(id)?.snapshot();
      if (!s || s.target !== slot || s.status === 'unreachable')
        this.#release(id);
    }
  }
  #release(id: string): void {
    for (const [slot, owner] of this.#reservations)
      if (owner === id) this.#reservations.delete(slot);
    this.#present.delete(id);
    this.#publish();
  }
  #publish(): void {
    const counts = new Map<string, number>();
    for (const workplace of this.#present.values())
      counts.set(workplace, (counts.get(workplace) ?? 0) + 1);
    for (const workplace of new Set([
      ...this.#published.keys(),
      ...counts.keys(),
    ])) {
      const count = counts.get(workplace) ?? 0;
      if (this.#published.get(workplace) !== count) {
        this.port.setAttendance(workplace, count);
        this.#published.set(workplace, count);
      }
    }
  }
  snapshot() {
    return Object.freeze({
      workers: Object.freeze(
        [...this.#workers].map(([id, worker]) =>
          Object.freeze({
            id,
            position: worker.position,
            ...worker.snapshot(),
          }),
        ),
      ),
      reservations: Object.freeze(
        [...this.#reservations].map(([slot, worker]) =>
          Object.freeze({ slot, worker }),
        ),
      ),
    });
  }
  save() {
    this.#live();
    return {
      workers: [...this.#workers].map(([id, worker]) => ({
        id,
        ...worker.save(),
      })),
      reservations: [...this.#reservations].map(([slot, worker]) => ({
        slot,
        worker,
      })),
    };
  }
  /** Checkpoint owner validates identities and associations before this call. */
  restore(
    workers: readonly StaffWorkerSave[],
    reservations: readonly SlotReservation[],
  ): void {
    this.#live();
    if (
      this.#reservations.size ||
      [...this.#workers.values()].some((w) => w.snapshot().target)
    )
      throw new Error('Restore requires fresh staffing');
    const slots = this.#slots(),
      owners = new Set<string>(),
      proposed = new Map<string, string>();
    for (const r of reservations) {
      if (
        proposed.has(r.slot) ||
        owners.has(r.worker) ||
        !this.#workers.has(r.worker) ||
        !slots.some((s) => s.id === r.slot)
      )
        throw new Error('Invalid reservation');
      proposed.set(r.slot, r.worker);
      owners.add(r.worker);
    }
    this.#reservations = proposed;
    try {
      for (const saved of workers) this.#worker(saved.id).restore(saved);
      this.#reconcileReservations();
    } catch (error) {
      for (const id of this.#workers.keys()) this.cancel(id);
      throw error;
    }
  }
  dispose(): undefined {
    if (this.#disposed) return;
    const errors: unknown[] = [];
    for (const id of [...this.#workers.keys()])
      try {
        this.remove(id);
      } catch (error) {
        errors.push(error);
      }
    this.#disposed = true;
    if (errors.length)
      throw new AggregateError(errors, 'Staffing cleanup failed');
  }
  #live(): void {
    if (this.#disposed) throw new Error('Staffing disposed');
  }
}
