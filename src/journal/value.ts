import { JournalError } from './contracts.js';
import type { Json, PendingEvent, Timeline } from './contracts.js';
export function fail(code: string, message: string): never {
  throw new JournalError(code, message);
}
export function identifier(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.length > 160)
    fail('invalid_input', 'Identifiers must contain 1–160 characters');
}
export function integer(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    fail('invalid_input', 'Expected a nonnegative safe integer');
}
export function json(value: unknown, depth = 0): asserts value is Json {
  if (depth > 32) fail('invalid_input', 'JSON nesting exceeds 32');
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    for (const item of value) json(item, depth + 1);
    return;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    for (const item of Object.values(value)) json(item, depth + 1);
    return;
  }
  fail('invalid_input', 'Expected finite plain JSON');
}
export function canonical(value: unknown): string {
  json(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (typeof value === 'object' && value !== null)
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + canonical(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
export function timeline(value: Timeline): Timeline {
  identifier(value.gameId);
  identifier(value.saveId);
  identifier(value.timelineId);
  return Object.freeze({
    gameId: value.gameId,
    saveId: value.saveId,
    timelineId: value.timelineId,
  });
}
export function signature(event: PendingEvent): string {
  const {
    recordedAt: ignored,
    sequence: ignoredSequence,
    ...content
  } = event as PendingEvent & { sequence?: number };
  void ignored;
  void ignoredSequence;
  return canonical(content);
}
