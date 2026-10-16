import { DatabaseSync } from 'node:sqlite';
import type {
  AppendReceipt,
  JournalEvent,
  JournalStore,
  PendingEvent,
  Timeline,
  Json,
} from './contracts.js';
import {
  bytes,
  json,
  integer,
  canonical,
  fail,
  signature,
  timeline,
} from './value.js';
/** Optional Node adapter; neutral journal entry never imports this module. */
export class SqliteJournalStore implements JournalStore {
  readonly identity: Timeline;
  readonly durability = 'durable';
  #db: DatabaseSync;
  #closed = false;
  constructor(
    path: string,
    identity: Timeline,
    readonly capacity = 10000,
  ) {
    this.identity = timeline(identity);
    if (
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      !path.length ||
      path.startsWith(':')
    )
      fail(
        'invalid_input',
        'Durable adapter requires a file and positive capacity',
      );
    this.#db = new DatabaseSync(path);
    try {
      this.#db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS journal_identity(id INTEGER PRIMARY KEY CHECK(id=1),document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS journal_records(sequence INTEGER PRIMARY KEY,source TEXT NOT NULL,event_id TEXT NOT NULL,signature TEXT NOT NULL,document TEXT NOT NULL,UNIQUE(source,event_id));`);
      this.#db
        .prepare('INSERT OR IGNORE INTO journal_identity VALUES(1,?)')
        .run(canonical(this.identity));
      const row = this.#db
        .prepare('SELECT document FROM journal_identity WHERE id=1')
        .get() as { document: string };
      if (row.document !== canonical(this.identity))
        fail('wrong_timeline', 'Journal belongs to a different save/timeline');
    } catch (error) {
      this.#db.close();
      throw error;
    }
  }
  #live() {
    if (this.#closed) fail('store_unavailable', 'Store closed');
  }
  #head(): number {
    return Number(
      (
        this.#db
          .prepare(
            'SELECT COALESCE(MAX(sequence),0) AS head FROM journal_records',
          )
          .get() as { head: number }
      ).head,
    );
  }
  head(): Promise<number> {
    this.#live();
    return Promise.resolve(this.#head());
  }
  append(events: readonly PendingEvent[]): Promise<readonly AppendReceipt[]> {
    this.#live();
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      let head = this.#head();
      const receipts: AppendReceipt[] = [];
      for (const input of events) {
        if (
          canonical({
            gameId: input.gameId,
            saveId: input.saveId,
            timelineId: input.timelineId,
          }) !== canonical(this.identity)
        )
          fail('wrong_timeline', 'Store timeline mismatch');
        const sig = signature(input);
        const prior = this.#db
          .prepare(
            'SELECT sequence,signature FROM journal_records WHERE source=? AND event_id=?',
          )
          .get(input.source, input.eventId) as
          { sequence: number; signature: string } | undefined;
        if (prior && prior.signature !== sig)
          fail('identity_conflict', 'Event identity has different content');
        if (!prior) {
          if (head >= this.capacity)
            fail('archive_full', 'Archive capacity reached');
          head++;
          const event: JournalEvent = { ...input, sequence: head };
          this.#db
            .prepare('INSERT INTO journal_records VALUES(?,?,?,?,?)')
            .run(head, input.source, input.eventId, sig, JSON.stringify(event));
        }
        receipts.push({
          source: input.source,
          eventId: input.eventId,
          sequence: prior?.sequence ?? head,
          replayed: !!prior,
        });
      }
      this.#db.exec('COMMIT');
      return Promise.resolve(receipts);
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }
  range(
    after: number,
    through: number,
    limit: number,
  ): Promise<readonly JournalEvent[]> {
    this.#live();
    const rows = this.#db
      .prepare(
        'SELECT document FROM journal_records WHERE sequence>? AND sequence<=? ORDER BY sequence LIMIT ?',
      )
      .all(after, through, limit) as { document: string }[];
    return Promise.resolve(
      rows.map((r) => JSON.parse(r.document) as JournalEvent),
    );
  }
  /** Host-controlled opaque checkpoint; does not serialize or restore any domain itself. */
  saveCheckpoint(data: Json, expectedHead: number): void {
    this.#live();
    json(data);
    integer(expectedHead);
    if (bytes(data) > 256 * 1024)
      fail('checkpoint_limit', 'Checkpoint exceeds 256 KiB');
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      if (this.#head() !== expectedHead)
        fail(
          'checkpoint_mismatch',
          'Journal advanced while capturing checkpoint',
        );
      this.#db.exec(
        'CREATE TABLE IF NOT EXISTS journal_checkpoint(id INTEGER PRIMARY KEY CHECK(id=1), head INTEGER NOT NULL, document TEXT NOT NULL)',
      );
      this.#db
        .prepare(
          'INSERT INTO journal_checkpoint VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET head=excluded.head,document=excluded.document',
        )
        .run(expectedHead, JSON.stringify(data));
      this.#db.exec('COMMIT');
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }
  readCheckpoint(): { identity: Timeline; head: number; data: Json } {
    this.#live();
    const exists = this.#db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='journal_checkpoint'",
      )
      .get();
    if (!exists) fail('checkpoint_missing', 'No controlled checkpoint');
    const row = this.#db
      .prepare('SELECT head,document FROM journal_checkpoint WHERE id=1')
      .get() as { head: number; document: string } | undefined;
    if (!row) fail('checkpoint_missing', 'No controlled checkpoint');
    if (row.head !== this.#head())
      fail(
        'checkpoint_mismatch',
        'Checkpoint is older than journal; continuation rejected',
      );
    return {
      identity: this.identity,
      head: row.head,
      data: JSON.parse(row.document) as Json,
    };
  }
  close(): Promise<void> {
    if (!this.#closed) {
      this.#closed = true;
      this.#db.close();
    }
    return Promise.resolve();
  }
}
