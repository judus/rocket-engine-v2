import {
  TerrainGenerator,
  terrainVersion,
} from '../terrain/TerrainGenerator.js';
import { chunkSize } from '../streaming/ChunkStream.js';
export interface TerrainInput {
  x: number;
  y: number;
  seed: number;
  scale: number;
  identity: string;
  passes: number;
}
export interface TerrainOutput extends TerrainInput {
  bytes: Uint8Array;
  computeMs: number;
}
export interface TerrainTasks {
  terrain: { input: TerrainInput; output: TerrainOutput };
}
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}
export function validInput(v: unknown): v is TerrainInput {
  if (!record(v)) return false;
  return (
    typeof v['x'] === 'number' &&
    Number.isSafeInteger(v['x']) &&
    Math.abs(v['x']) <= 124999 &&
    typeof v['y'] === 'number' &&
    Number.isSafeInteger(v['y']) &&
    Math.abs(v['y']) <= 124999 &&
    typeof v['seed'] === 'number' &&
    Number.isInteger(v['seed']) &&
    v['seed'] >= 0 &&
    v['seed'] <= 0xffffffff &&
    typeof v['scale'] === 'number' &&
    Number.isFinite(v['scale']) &&
    v['scale'] >= 1 &&
    v['scale'] <= 8192 &&
    typeof v['passes'] === 'number' &&
    Number.isInteger(v['passes']) &&
    v['passes'] >= 1 &&
    v['passes'] <= 1024 &&
    v['identity'] === `${terrainVersion};seed=${v['seed']};scale=${v['scale']}`
  );
}
export function validOutput(v: unknown): v is TerrainOutput {
  return (
    validInput(v) &&
    record(v) &&
    v['bytes'] instanceof Uint8Array &&
    v['bytes'].length === chunkSize * chunkSize &&
    v['bytes'].every((n) => n < 6) &&
    typeof v['computeMs'] === 'number' &&
    Number.isFinite(v['computeMs']) &&
    v['computeMs'] >= 0
  );
}
/** The authoritative generator is imported, never reproduced in the worker. */
export function generateTerrain(input: TerrainInput): TerrainOutput {
  if (!validInput(input)) throw new Error('Invalid terrain task');
  const start = performance.now();
  const generator = new TerrainGenerator(input);
  let bytes: Uint8Array = new Uint8Array(chunkSize * chunkSize);
  for (let pass = 0; pass < input.passes; pass++)
    bytes = generator.chunk(input.x, input.y, chunkSize).biomes;
  return { ...input, bytes, computeMs: performance.now() - start };
}
export const terrainTask = {
  input: validInput,
  handle: (input: TerrainInput) => {
    const value = generateTerrain(input);
    return { value, transfer: [value.bytes.buffer as ArrayBuffer] };
  },
};

/** Declared work units: 64 generated cells per pass, not measured memory or CPU time. */
export function terrainCost(input: TerrainInput): number {
  return chunkSize * chunkSize * input.passes;
}
