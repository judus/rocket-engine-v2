import type { Service } from '../Service.js';
import type {
  AppendReceipt,
  DomainStatus,
  EventInput,
  EventSchema,
  JournalEvent,
  JournalFilter,
  JournalPage,
  JournalProducer,
  JournalQuery,
  JournalStore,
  PendingEvent,
  Timeline,
} from './contracts.js';
import {
  bytes,
  canonical,
  fail,
  identifier,
  integer,
  json,
  timeline,
} from './value.js';
interface Cursor {
  version: 1;
  identity: Timeline;
  head: number;
  after: number;
  filter: JournalFilter;
}
/** Optional application-owned recording/query service. No domain state or new clock. */
export class Journal implements Service {
  #store: JournalStore | undefined;
  #identity: Timeline | undefined;
  #sources = new Set<string>();
  #domains = new Map<string, () => DomainStatus>();
  #tail: Promise<void> = Promise.resolve();
  #pending = 0;
  #disposed = false;
  configure(store: JournalStore): this {
    if (this.#store || this.#disposed)
      fail('invalid_lifecycle', 'Journal cannot be reconfigured');
    this.#identity = timeline(store.identity);
    this.#store = store;
    return this;
  }
  get identity(): Timeline {
    return (
      this.#identity ?? fail('invalid_lifecycle', 'Configure journal first')
    );
  }
  get stats() {
    return Object.freeze({
      producers: this.#sources.size,
      statusReaders: this.#domains.size,
      pending: this.#pending,
      disposed: this.#disposed,
    });
  }
  get domains(): readonly string[] {
    this.#live();
    return [...this.#domains.keys()].sort();
  }
  get pending(): number {
    return this.#pending;
  }
  #live(): JournalStore {
    if (this.#disposed) fail('disposed', 'Journal disposed');
    return this.#store ?? fail('invalid_lifecycle', 'Configure journal first');
  }
  registerProducer(
    source: string,
    schemas: Readonly<Record<string, EventSchema>>,
  ): JournalProducer {
    this.#live();
    identifier(source);
    if (this.#sources.has(source))
      fail('duplicate_source', 'Producer already registered');
    const definitions = new Map(
      Object.entries(schemas).map(([name, schema]) => {
        identifier(name);
        integer(schema.version);
        if (schema.version < 1 || typeof schema.validate !== 'function')
          fail('invalid_input', 'Invalid event schema');
        return [name, { ...schema }] as const;
      }),
    );
    if (!definitions.size)
      fail('invalid_input', 'Producer needs event schemas');
    this.#sources.add(source);
    let disposed = false;
    const appendBatch = async (
      events: readonly EventInput[],
    ): Promise<readonly AppendReceipt[]> => {
      const store = this.#live();
      if (disposed) fail('disposed', 'Producer disposed');
      if (!Array.isArray(events) || events.length < 1 || events.length > 32)
        fail('batch_limit', 'Batch must contain 1–32 events');
      const accepted: PendingEvent[] = events.map((event: EventInput) => {
        json(event as unknown);
        const e: EventInput = structuredClone(event);
        if (
          Object.keys(e).some(
            (k) =>
              ![
                'eventId',
                'type',
                'version',
                'subjectRefs',
                'correlation',
                'simulationTime',
                'payload',
              ].includes(k),
          )
        )
          fail('invalid_input', 'Unknown event field');
        identifier(e.eventId);
        identifier(e.type);
        integer(e.version);
        if (!Array.isArray(e.subjectRefs) || e.subjectRefs.length > 32)
          fail('invalid_input', 'Invalid subject references');
        e.subjectRefs.forEach(identifier);
        if (e.correlation !== undefined) {
          if (
            !e.correlation ||
            typeof e.correlation !== 'object' ||
            Array.isArray(e.correlation) ||
            Object.keys(e.correlation).length > 16
          )
            fail('invalid_input', 'Invalid correlation');
          for (const [key, value] of Object.entries(e.correlation)) {
            identifier(key);
            identifier(value);
          }
        }
        if (
          e.simulationTime !== undefined &&
          (typeof e.simulationTime !== 'number' ||
            !Number.isFinite(e.simulationTime) ||
            e.simulationTime < 0)
        )
          fail('invalid_input', 'Invalid simulation time');
        const schema = definitions.get(e.type);
        if (
          !schema ||
          e.version !== schema.version ||
          !schema.validate(e.payload)
        )
          fail(
            'invalid_event',
            'Unregistered event or invalid payload/version',
          );
        const record: PendingEvent = {
          ...e,
          ...this.identity,
          schemaVersion: 1,
          source,
          recordedAt: new Date().toISOString(),
        };
        if (bytes(record) > 16 * 1024)
          fail('event_limit', 'Event exceeds 16 KiB');
        return record;
      });
      if (this.#pending + accepted.length > 64)
        fail('queue_full', 'At most 64 pending records');
      this.#pending += accepted.length;
      const operation = this.#tail.then(() => store.append(accepted));
      this.#tail = operation.then(
        () => undefined,
        () => undefined,
      );
      try {
        return structuredClone(await operation);
      } finally {
        this.#pending -= accepted.length;
      }
    };
    return {
      append: async (event) => {
        const receipts = await appendBatch([event]);
        return receipts[0] ?? fail('store_error', 'Missing append receipt');
      },
      appendBatch,
      dispose: () => {
        if (!disposed) {
          disposed = true;
          this.#sources.delete(source);
        }
        return;
      },
    };
  }
  /** Waits for admitted writes. Individual failures are returned to their callers. */
  async drain(): Promise<void> {
    await this.#tail;
  }
  async head(): Promise<number> {
    const store = this.#live();
    await this.drain();
    return store.head();
  }
  async read(query: JournalQuery = {}): Promise<JournalPage> {
    const store = this.#live();
    json(query);
    if (
      Object.keys(query).some(
        (k) =>
          ![
            'cursor',
            'limit',
            'source',
            'type',
            'subjectRef',
            'questRunId',
          ].includes(k),
      )
    )
      fail('invalid_input', 'Unknown query field');
    const limit = query.limit ?? 50;
    integer(limit);
    if (limit < 1 || limit > 100) fail('invalid_input', 'Limit must be 1–100');
    const filter: JournalFilter = {
      ...(query.source !== undefined ? { source: query.source } : {}),
      ...(query.type !== undefined ? { type: query.type } : {}),
      ...(query.subjectRef !== undefined
        ? { subjectRef: query.subjectRef }
        : {}),
      ...(query.questRunId !== undefined
        ? { questRunId: query.questRunId }
        : {}),
    };
    Object.values(filter).forEach(identifier);
    await this.drain();
    const currentHead = await store.head();
    let head = currentHead,
      after = 0;
    if (query.cursor !== undefined) {
      if (typeof query.cursor !== 'string' || query.cursor.length > 8192)
        fail('invalid_cursor', 'Invalid cursor');
      let cursor: Cursor;
      try {
        cursor = JSON.parse(decodeURIComponent(query.cursor)) as Cursor;
        json(cursor);
        integer(cursor.head);
        integer(cursor.after);
        timeline(cursor.identity);
        if (
          !cursor.filter ||
          typeof cursor.filter !== 'object' ||
          Array.isArray(cursor.filter) ||
          Object.keys(cursor.filter).some(
            (k) => !['source', 'type', 'subjectRef', 'questRunId'].includes(k),
          )
        )
          fail('invalid_cursor', 'Invalid cursor filter');
        Object.values(cursor.filter).forEach(identifier);
      } catch {
        fail('invalid_cursor', 'Malformed cursor');
      }
      if (
        cursor.version !== 1 ||
        canonical(cursor.identity) !== canonical(this.identity)
      )
        fail('wrong_timeline', 'Cursor belongs to another timeline');
      if (
        canonical(cursor.filter) !== canonical(filter) ||
        cursor.after > cursor.head ||
        cursor.head > currentHead
      )
        fail('invalid_cursor', 'Cursor query/window mismatch');
      head = cursor.head;
      after = cursor.after;
    }
    const events: JournalEvent[] = [];
    const page = (): JournalPage => ({
      ...this.identity,
      durability: store.durability,
      head,
      earliestSequence: head ? 1 : null,
      complete: true,
      events,
      nextCursor:
        after < head
          ? encodeURIComponent(
              JSON.stringify({
                version: 1,
                identity: this.identity,
                head,
                after,
                filter,
              } satisfies Cursor),
            )
          : null,
    });
    while (after < head && events.length < limit) {
      const rows = await store.range(after, head, Math.min(100, head - after));
      if (!rows.length) fail('history_gap', 'Missing journal history');
      let stopped = false;
      for (const event of rows) {
        if (event.sequence !== after + 1)
          fail('history_gap', 'Noncontiguous journal history');
        const matches =
          (!filter.source || event.source === filter.source) &&
          (!filter.type || event.type === filter.type) &&
          (!filter.subjectRef ||
            event.subjectRefs.includes(filter.subjectRef)) &&
          (!filter.questRunId ||
            event.correlation?.['questRunId'] === filter.questRunId);
        if (matches) {
          events.push(event);
          if (bytes(page()) > 63 * 1024) {
            events.pop();
            stopped = true;
            break;
          }
        }
        after = event.sequence;
        if (events.length >= limit) {
          stopped = true;
          break;
        }
      }
      if (stopped) break;
    }
    return structuredClone(page());
  }
  registerStatus(
    domain: string,
    read: () => DomainStatus,
  ): { dispose(): undefined } {
    this.#live();
    identifier(domain);
    if (this.#domains.has(domain))
      fail('duplicate_domain', 'Status domain already registered');
    this.#domains.set(domain, read);
    let disposed = false;
    return {
      dispose: () => {
        if (!disposed) {
          disposed = true;
          this.#domains.delete(domain);
        }
        return;
      },
    };
  }
  async status(domains: readonly string[]): Promise<{
    identity: Timeline;
    capturedAt: string;
    head: number;
    atomic: false;
    domains: Readonly<Record<string, DomainStatus>>;
  }> {
    this.#live();
    if (
      !Array.isArray(domains) ||
      domains.length < 1 ||
      domains.length > 16 ||
      new Set(domains).size !== domains.length
    )
      fail('invalid_input', 'Select 1–16 distinct domains');
    domains.forEach(identifier);
    await this.drain();
    const head = await this.#live().head(),
      result: Record<string, DomainStatus> = {};
    for (const domain of domains as readonly string[]) {
      const read = this.#domains.get(domain);
      if (!read) fail('unknown_domain', 'Unknown status domain ' + domain);
      const value = read();
      json(value);
      integer(value.revision);
      integer(value.recordedThrough);
      if (
        value.recordedThrough > head ||
        !['available', 'stale', 'unavailable'].includes(value.availability)
      )
        fail('invalid_status', 'Invalid status provenance');
      Object.defineProperty(result, domain, {
        value: structuredClone(value),
        enumerable: true,
      });
    }
    const response = {
      identity: this.identity,
      capturedAt: new Date().toISOString(),
      head,
      atomic: false as const,
      domains: result,
    };
    if (bytes(response) > 63 * 1024)
      fail('status_limit', 'Status exceeds response budget');
    return response;
  }
  /** Stops admission; accepted writes finish. Host must await drain before closing its store. */
  dispose(): undefined {
    this.#disposed = true;
    this.#sources.clear();
    this.#domains.clear();
    return;
  }
}
