import type {
  AppendReceipt,
  JournalEvent,
  JournalStore,
  PendingEvent,
  Timeline,
} from './contracts.js';
import { fail, signature, timeline } from './value.js';
export class MemoryJournalStore implements JournalStore {
  readonly identity: Timeline;
  readonly durability = 'volatile';
  #events: JournalEvent[] = [];
  #identities = new Map<string, JournalEvent>();
  #closed = false;
  constructor(
    identity: Timeline,
    readonly capacity = 10000,
  ) {
    this.identity = timeline(identity);
    if (!Number.isSafeInteger(capacity) || capacity < 1)
      fail('invalid_input', 'Invalid capacity');
  }
  #live() {
    if (this.#closed) fail('store_unavailable', 'Store closed');
  }
  head(): Promise<number> {
    this.#live();
    return Promise.resolve(this.#events.length);
  }
  append(events: readonly PendingEvent[]): Promise<readonly AppendReceipt[]> {
    this.#live();
    const staged: JournalEvent[] = [],
      receipts: AppendReceipt[] = [];
    const identities = new Map<string, JournalEvent>();
    // Copy only incoming data; accepted private history is never exposed or recloned.
    for (const input of structuredClone(events)) {
      if (
        input.gameId !== this.identity.gameId ||
        input.saveId !== this.identity.saveId ||
        input.timelineId !== this.identity.timelineId
      )
        fail('wrong_timeline', 'Store timeline mismatch');
      const key = JSON.stringify([input.source, input.eventId]);
      const prior = identities.get(key) ?? this.#identities.get(key);
      if (prior && signature(prior) !== signature(input))
        fail('identity_conflict', 'Event identity has different content');
      if (!prior && this.#events.length + staged.length >= this.capacity)
        fail('archive_full', 'Archive capacity reached');
      const sequence =
        prior?.sequence ?? this.#events.length + staged.length + 1;
      if (!prior) {
        const event = { ...input, sequence };
        staged.push(event);
        identities.set(key, event);
      }
      receipts.push({
        source: input.source,
        eventId: input.eventId,
        sequence,
        replayed: !!prior,
      });
    }
    for (const event of staged) this.#events.push(event);
    for (const [key, event] of identities) this.#identities.set(key, event);
    return Promise.resolve(receipts);
  }
  range(
    after: number,
    through: number,
    limit: number,
  ): Promise<readonly JournalEvent[]> {
    this.#live();
    return Promise.resolve(
      structuredClone(
        this.#events
          .filter((e) => e.sequence > after && e.sequence <= through)
          .slice(0, limit),
      ),
    );
  }
  close(): Promise<void> {
    this.#closed = true;
    return Promise.resolve();
  }
}
