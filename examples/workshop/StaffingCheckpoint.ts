import {
  ChunkStream,
  MemoryEdits,
  type ChunkLoader,
  type TileEdit,
} from '../streaming/ChunkStream.js';
import { StreamedWalker } from '../navigation/StreamedWalker.js';
import { FactoryDemo, type FactorySave } from './FactoryDemo.js';
import {
  workplaceTerrain,
  readWorkerSave,
  readWorkplaceEdits,
} from './WorkplaceCheckpoint.js';
import {
  Staffing,
  type StaffingSlot,
  type StaffWorkerSave,
  type SlotReservation,
} from './StaffingCoordinator.js';
export interface StaffingCheckpoint {
  readonly format: 'rocket-staffing';
  readonly version: 1;
  readonly terrain: 'workplace-proof-v1';
  readonly factory: FactorySave;
  readonly workers: readonly StaffWorkerSave[];
  readonly reservations: readonly SlotReservation[];
  readonly edits: readonly TileEdit[];
}
const initialWorkers: readonly StaffWorkerSave[] = [
  {
    id: 'worker-a',
    position: { x: 48, y: 48 },
    target: null,
    destination: null,
    phase: 'idle',
    reason: null,
  },
  {
    id: 'worker-b',
    position: { x: 48, y: 80 },
    target: null,
    destination: null,
    phase: 'idle',
    reason: null,
  },
];
export function createStaffedWorkplace(
  factory = new FactoryDemo(1, true, true),
  edits = new MemoryEdits(workplaceTerrain),
  saved: readonly StaffWorkerSave[] = initialWorkers,
  reservations: readonly SlotReservation[] = [],
  load?: ChunkLoader,
) {
  const smelter = factory.ids[1]!,
    press = factory.ids[2]!;
  const slots: StaffingSlot[] = [
    {
      id: 'smelter.operator.0',
      workplace: smelter,
      position: { x: 240, y: 48 },
    },
    { id: 'press.operator.0', workplace: press, position: { x: 816, y: 48 } },
  ];
  const stream = new ChunkStream(
      edits,
      64,
      0,
      load ? { load, maxJobs: 4 } : {},
    ),
    walkers = new Map<string, StreamedWalker>();
  const staffing = new Staffing({
    slots: () => slots,
    canStand: (id, p) => walkers.get(id)?.canStand(p) ?? false,
    setAttendance: (id, count) => {
      if (factory.ids.includes(id)) factory.operatorAttendance(id, count);
    },
  });
  try {
    for (const id of [smelter, press]) factory.operatorAttendance(id, 0);
    for (const worker of saved) {
      const walker = new StreamedWalker(stream, worker.position);
      try {
        staffing.add(worker.id, walker);
        walkers.set(worker.id, walker);
      } catch (error) {
        walker.dispose();
        throw error;
      }
    }
    staffing.restore(saved, reservations);
    return {
      factory,
      edits,
      stream,
      walkers,
      staffing,
      slots,
      smelter,
      press,
      removeWorker(id: string): void {
        try {
          staffing.remove(id);
        } finally {
          walkers.delete(id);
        }
      },
      save(): StaffingCheckpoint {
        return structuredClone({
          format: 'rocket-staffing',
          version: 1,
          terrain: 'workplace-proof-v1',
          factory: factory.save(),
          ...staffing.save(),
          edits: edits.snapshot(),
        });
      },
      dispose(): undefined {
        try {
          staffing.dispose();
        } finally {
          try {
            factory.dispose();
          } finally {
            stream.dispose();
            walkers.clear();
          }
        }
      },
    };
  } catch (error) {
    staffing.dispose();
    stream.dispose();
    factory.dispose();
    throw error;
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid staffing checkpoint');
  return value as Record<string, unknown>;
}
export function restoreStaffedWorkplace(value: unknown, load?: ChunkLoader) {
  const v = object(value);
  if (
    v.format !== 'rocket-staffing' ||
    v.version !== 1 ||
    v.terrain !== 'workplace-proof-v1' ||
    !Array.isArray(v.workers) ||
    v.workers.length > 2 ||
    !Array.isArray(v.reservations) ||
    v.reservations.length > 2
  )
    throw new Error('Incompatible staffing checkpoint');
  const ids = new Set<string>();
  const workers: StaffWorkerSave[] = v.workers.map((item) => {
    const w = object(item);
    if ((w.id !== 'worker-a' && w.id !== 'worker-b') || ids.has(w.id))
      throw new Error('Invalid worker identity');
    ids.add(w.id);
    return { id: w.id, ...readWorkerSave(w) };
  });
  const edits = readWorkplaceEdits(v.edits),
    factory = FactoryDemo.restore(v.factory);
  try {
    if (
      !factory.workshop ||
      !factory.transport ||
      factory.ids.length !== 3 ||
      factory
        .read()
        .facilities.some(
          (f, i) =>
            f.id !== factory.ids[i] ||
            f.definitionId !== ['mine', 'smelter', 'press'][i],
        )
    )
      throw new Error('Wrong staffing factory');
    const entrances = new Map([
      ['smelter.operator.0', { x: 240, y: 48 }],
      ['press.operator.0', { x: 816, y: 48 }],
    ]);
    for (const w of workers)
      if (w.target) {
        const p = entrances.get(w.target);
        if (
          !p ||
          !w.destination ||
          w.destination.x !== p.x ||
          w.destination.y !== p.y
        )
          throw new Error('Missing or relocated staffing slot');
      }
    const slots = new Set<string>(),
      owners = new Set<string>();
    const reservations: SlotReservation[] = v.reservations.map((item) => {
      const r = object(item);
      if (
        typeof r.slot !== 'string' ||
        typeof r.worker !== 'string' ||
        !entrances.has(r.slot) ||
        slots.has(r.slot) ||
        owners.has(r.worker)
      )
        throw new Error('Invalid slot reservation');
      const worker = workers.find((w) => w.id === r.worker);
      if (
        !worker ||
        worker.target !== r.slot ||
        !['travelling', 'arrived'].includes(worker.phase)
      )
        throw new Error('Reservation does not match active assignment');
      slots.add(r.slot);
      owners.add(r.worker);
      return { slot: r.slot, worker: r.worker };
    });
    for (const w of workers)
      if (['travelling', 'arrived'].includes(w.phase) && !owners.has(w.id))
        throw new Error('Active worker has no reservation');
    return createStaffedWorkplace(factory, edits, workers, reservations, load);
  } catch (error) {
    factory.dispose();
    throw error;
  }
}
