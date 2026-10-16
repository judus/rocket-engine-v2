import {
  GridTraversal,
  GridNavigator,
  Movement,
  DirectMovement,
} from '../../src/navigation/index.js';
import type {
  MoveRequest,
  ActorTraversal,
} from '../../src/navigation/index.js';
import type { Point } from '../../src/types.js';
import { Staffing } from '../workshop/StaffingCoordinator.js';
import { FactoryDemo } from '../workshop/FactoryDemo.js';
import {
  walkSpeed,
  runSpeed,
} from '../character-control/ControlledCharacter.js';
const domain = { minX: 0, minY: 0, columns: 18, rows: 12, tileSize: 32 };
const actor: ActorTraversal = {
  radius: 8,
  clearance: 1,
  capabilities: ['walk'],
};
/** One live pose owner. Old journey handles belong to a disposed mover. */
class WorkerMovement {
  #owner: Movement | DirectMovement;
  manual = false;
  direction = { x: 0, y: 0 };
  running = false;
  constructor(
    readonly world: GridTraversal,
    position: Readonly<Point>,
  ) {
    this.#owner = new Movement(
      new GridNavigator(world, domain),
      position,
      actor,
    );
  }
  get position() {
    return this.#owner.position;
  }
  handoff(manual: boolean): void {
    const position = this.position;
    this.#owner.dispose();
    this.manual = manual;
    this.direction = { x: 0, y: 0 };
    this.running = false;
    this.#owner = manual
      ? new DirectMovement(this.world, position, actor)
      : new Movement(new GridNavigator(this.world, domain), position, actor);
  }
  move(request: MoveRequest) {
    if (!(this.#owner instanceof Movement))
      throw new Error('Manual worker cannot accept a journey');
    return this.#owner.move(request);
  }
  update(dt: number): undefined {
    if (this.#owner instanceof DirectMovement)
      this.#owner.update(
        dt,
        this.direction,
        this.running ? runSpeed : walkSpeed,
      );
    else this.#owner.update(dt);
    return;
  }
  dispose(): undefined {
    this.#owner.dispose();
    return;
  }
}
export interface WorkCheckpoint {
  factory: ReturnType<FactoryDemo['save']>;
  workers: { id: string; position: Point }[];
  gate: boolean;
}
/** Game-owned assignment/control policy, using Workshop's actual attendance and output. */
export class WorkDemo {
  gate = false;
  revision = 0;
  controlled: string | null = null;
  readonly workers = new Map<string, WorkerMovement>();
  readonly factory: FactoryDemo;
  readonly world = new GridTraversal(
    domain,
    () => ({ status: 'passable', cost: 1 }),
    () => this.revision,
    () =>
      this.gate
        ? [{ id: 'gate', bounds: { minX: 288, minY: 0, maxX: 320, maxY: 384 } }]
        : [],
  );
  readonly staffing: Staffing;
  readonly slots;
  #disposed = false;
  constructor(saved?: WorkCheckpoint) {
    this.factory = saved
      ? FactoryDemo.restore(saved.factory)
      : new FactoryDemo(1, true, true);
    this.gate = saved?.gate ?? false;
    this.slots = [
      {
        id: 'A',
        workplace: this.factory.ids[1]!,
        position: { x: 432, y: 112 },
      },
      {
        id: 'B',
        workplace: this.factory.ids[2]!,
        position: { x: 432, y: 272 },
      },
    ];
    this.staffing = new Staffing({
      slots: () => this.slots,
      canStand: (_id, p) => this.world.point(p, actor).status === 'passable',
      setAttendance: (id, count) => this.factory.operatorAttendance(id, count),
    });
    this.slots.forEach((s) => this.factory.operatorAttendance(s.workplace, 0));
    for (const row of saved?.workers ?? [
      { id: 'A', position: { x: 80, y: 112 } },
      { id: 'B', position: { x: 80, y: 272 } },
    ]) {
      const movement = new WorkerMovement(this.world, row.position);
      this.workers.set(row.id, movement);
      this.staffing.add(row.id, movement);
      this.staffing.assign(row.id, row.id);
    }
  }
  takeover(id: string): void {
    this.#live();
    if (!this.workers.has(id)) throw new Error('Worker removed');
    if (this.controlled === id) return;
    this.release();
    this.staffing.cancel(id); // Clear attendance before any movement or production.
    this.workers.get(id)!.handoff(true);
    this.controlled = id;
  }
  release(): void {
    this.#live();
    if (!this.controlled) return;
    const id = this.controlled;
    this.controlled = null;
    this.workers.get(id)!.handoff(false);
    this.staffing.assign(id, id);
  }
  toggleGate(): void {
    this.#live();
    this.gate = !this.gate;
    this.revision++;
    for (const id of this.workers.keys())
      if (id !== this.controlled) this.staffing.assign(id, id);
    this.staffing.reconcile();
  }
  update(dt: number, direction = { x: 0, y: 0 }, running = false): void {
    this.#live();
    const manual = this.controlled && this.workers.get(this.controlled);
    if (manual) {
      manual.direction = direction;
      manual.running = running;
    }
    this.staffing.update(dt);
    this.factory.advance(dt); // Attendance reconciled before production consumes this step.
  }
  remove(id: string): void {
    this.#live();
    if (!this.workers.has(id)) return;
    if (this.controlled === id) this.controlled = null;
    this.staffing.remove(id);
    this.workers.delete(id);
  }
  save(): WorkCheckpoint {
    this.#live();
    return {
      factory: this.factory.save(),
      gate: this.gate,
      workers: [...this.workers].map(([id, m]) => ({
        id,
        position: { ...m.position },
      })),
    };
  }
  #live(): void {
    if (this.#disposed) throw new Error('Work demo disposed');
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.staffing.dispose();
    this.workers.clear();
    this.controlled = null;
    this.factory.dispose();
    this.#disposed = true;
    return;
  }
}
