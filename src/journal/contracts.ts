export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };
export interface Timeline {
  readonly gameId: string;
  readonly saveId: string;
  readonly timelineId: string;
}
export interface EventInput {
  readonly eventId: string;
  readonly type: string;
  readonly version: number;
  readonly subjectRefs: readonly string[];
  readonly correlation?: Readonly<Record<string, string>>;
  readonly simulationTime?: number;
  readonly payload: Json;
}
export interface JournalEvent extends EventInput, Timeline {
  readonly schemaVersion: 1;
  readonly source: string;
  readonly sequence: number;
  readonly recordedAt: string;
}
export type PendingEvent = Omit<JournalEvent, 'sequence'>;
export interface AppendReceipt {
  readonly eventId: string;
  readonly source: string;
  readonly sequence: number;
  readonly replayed: boolean;
}
/** One timeline. Atomic batches, copied values, no silent eviction. */
export interface JournalStore {
  readonly identity: Timeline;
  readonly durability: 'volatile' | 'durable';
  head(): Promise<number>;
  append(events: readonly PendingEvent[]): Promise<readonly AppendReceipt[]>;
  range(
    after: number,
    through: number,
    limit: number,
  ): Promise<readonly JournalEvent[]>;
  close(): Promise<void>;
}
export interface EventSchema {
  readonly version: number;
  readonly validate: (payload: Json) => boolean;
}
export interface JournalProducer {
  append(event: EventInput): Promise<AppendReceipt>;
  appendBatch(events: readonly EventInput[]): Promise<readonly AppendReceipt[]>;
  dispose(): undefined;
}
export interface JournalFilter {
  readonly source?: string;
  readonly type?: string;
  readonly subjectRef?: string;
  readonly questRunId?: string;
}
export interface JournalQuery extends JournalFilter {
  readonly cursor?: string;
  readonly limit?: number;
}
export interface JournalPage extends Timeline {
  readonly durability: JournalStore['durability'];
  readonly head: number;
  readonly earliestSequence: number | null;
  readonly complete: true;
  readonly events: readonly JournalEvent[];
  readonly nextCursor: string | null;
}
export interface DomainStatus {
  readonly revision: number;
  readonly recordedThrough: number;
  readonly availability: 'available' | 'stale' | 'unavailable';
  readonly data: Json;
}
export class JournalError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'JournalError';
  }
}
