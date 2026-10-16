import type { Point } from '../../src/types.js';
import {
  ChunkStream,
  MemoryEdits,
  type ChunkLoader,
  type TileEdit,
} from '../streaming/ChunkStream.js';
import { StreamedWalker } from '../navigation/StreamedWalker.js';
import { FactoryDemo, type FactorySave } from './FactoryDemo.js';
import { WorkplaceOperator, type WorkerSave } from './WorkplaceOperator.js';

export const workplaceTerrain = (cell: { x: number; y: number }): 0 | 1 | 2 =>
  (cell.x === 12 || cell.x === 13) && cell.y >= -3 ? 1 : cell.y >= 4 ? 2 : 0;
export interface WorkplaceCheckpoint {
  readonly format: 'rocket-workplace';
  readonly version: 1;
  readonly terrain: 'workplace-proof-v1';
  readonly factory: FactorySave;
  readonly worker: WorkerSave;
  readonly edits: readonly TileEdit[];
}
export function createWorkplace(
  factory = new FactoryDemo(1, true, true),
  edits = new MemoryEdits(workplaceTerrain),
  saved?: WorkerSave,
  load?: ChunkLoader,
) {
  const smelter = factory.ids[1]!,
    press = factory.ids[2]!;
  const places = new Map<string, Readonly<Point>>([
    [smelter, { x: 240, y: 48 }],
    [press, { x: 816, y: 48 }],
  ]);
  const stream = new ChunkStream(
    edits,
    64,
    0,
    load ? { load, maxJobs: 4 } : {},
  );
  let walker: StreamedWalker | undefined,
    operator: WorkplaceOperator | undefined;
  try {
    // Workshop attendance is derived from the authoritative worker, never trusted from disk.
    for (const id of [smelter, press]) factory.operatorOnSite(id, false);
    walker = new StreamedWalker(stream, saved?.position);
    const movement = walker;
    operator = new WorkplaceOperator(movement, {
      workplace: (id) => places.get(id),
      canStand: (p) => movement.canStand(p),
      setPresent(id, present) {
        factory.operatorOnSite(id, present);
      },
    });
    if (saved) operator.restore(saved);
    const worker = operator;
    return {
      factory,
      edits,
      stream,
      walker: movement,
      operator: worker,
      smelter,
      press,
      places,
      save(): WorkplaceCheckpoint {
        return structuredClone({
          format: 'rocket-workplace',
          version: 1,
          terrain: 'workplace-proof-v1',
          factory: factory.save(),
          worker: worker.save(),
          edits: edits.snapshot(),
        });
      },
      dispose(): undefined {
        try {
          worker.dispose();
        } finally {
          try {
            factory.dispose();
          } finally {
            stream.dispose();
          }
        }
      },
    };
  } catch (error) {
    operator?.dispose();
    walker?.dispose();
    stream.dispose();
    factory.dispose();
    throw error;
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid workplace checkpoint');
  return value as Record<string, unknown>;
}
function point(value: unknown): Point {
  const p = object(value);
  if (
    typeof p.x !== 'number' ||
    typeof p.y !== 'number' ||
    !Number.isFinite(p.x) ||
    !Number.isFinite(p.y)
  )
    throw new Error('Invalid worker point');
  return { x: p.x, y: p.y };
}
/** Validate all associations before publishing either subsystem; no old formats or migrations. */
export function restoreWorkplace(value: unknown, load?: ChunkLoader) {
  const v = object(value);
  if (
    v.format !== 'rocket-workplace' ||
    v.version !== 1 ||
    v.terrain !== 'workplace-proof-v1'
  )
    throw new Error('Incompatible workplace checkpoint');
  const worker = readWorkerSave(v.worker),
    edits = readWorkplaceEdits(v.edits);
  const factory = FactoryDemo.restore(v.factory);
  try {
    const facilities = factory.read().facilities;
    if (
      !factory.workshop ||
      !factory.transport ||
      factory.ids.length !== 3 ||
      facilities.some(
        (f, i) =>
          f.id !== factory.ids[i] ||
          f.definitionId !== ['mine', 'smelter', 'press'][i],
      )
    )
      throw new Error('Wrong workplace factory');
    return createWorkplace(factory, edits, worker, load);
  } catch (error) {
    factory.dispose();
    throw error;
  }
}

export function readWorkerSave(value: unknown): WorkerSave {
  const w = object(value),
    position = point(w.position);
  if (
    typeof w.phase !== 'string' ||
    !['idle', 'travelling', 'arrived', 'unreachable'].includes(w.phase) ||
    !(w.target === null || typeof w.target === 'string') ||
    !(w.reason === null || typeof w.reason === 'string')
  )
    throw new Error('Invalid worker assignment');
  const phase = w.phase as WorkerSave['phase'],
    destination = w.destination === null ? null : point(w.destination);
  if (
    phase === 'idle'
      ? w.target !== null || destination !== null || w.reason !== null
      : !w.target ||
        !destination ||
        (phase === 'unreachable'
          ? typeof w.reason !== 'string' || !w.reason
          : w.reason !== null)
  )
    throw new Error('Inconsistent worker assignment');
  if (
    phase === 'arrived' &&
    destination &&
    Math.hypot(position.x - destination.x, position.y - destination.y) > 0.1
  )
    throw new Error('Arrived worker is not at workplace');
  return {
    position,
    target: w.target as string | null,
    destination,
    phase,
    reason: w.reason as string | null,
  };
}

export function readWorkplaceEdits(value: unknown): MemoryEdits {
  if (!Array.isArray(value) || value.length > 128)
    throw new Error('Invalid workplace edits');
  const edits = new MemoryEdits(workplaceTerrain),
    seen = new Set<string>();
  for (const item of value) {
    const c = object(item);
    if (
      typeof c.x !== 'number' ||
      typeof c.y !== 'number' ||
      !Number.isInteger(c.x) ||
      !Number.isInteger(c.y) ||
      c.x < -32 ||
      c.x >= 64 ||
      c.y < -8 ||
      c.y >= 8 ||
      !edits.accepts(c.value)
    )
      throw new Error('Invalid workplace edit');
    const id = `${c.x},${c.y}`;
    if (seen.has(id)) throw new Error('Duplicate workplace edit');
    seen.add(id);
    edits.set({ x: c.x, y: c.y }, c.value);
  }
  return edits;
}
