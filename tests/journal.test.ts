import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Journal,
  MemoryJournalStore,
  JournalError,
} from '../src/journal/index.js';
import type { EventInput, JournalStore } from '../src/journal/index.js';
import { SqliteJournalStore } from '../src/journal/sqlite.js';
import { journalProvider } from '../src/journal/mcp.js';
const identity = { gameId: 'game', saveId: 'save', timelineId: 'one' };
const schemas = {
  'game.changed': {
    version: 1,
    validate: (v: unknown) => typeof v === 'object' && v !== null,
  },
};
const event = (id: string): EventInput => ({
  eventId: id,
  type: 'game.changed',
  version: 1,
  subjectRefs: ['entity'],
  payload: { value: id },
});
const code = (expected: string) => (e: unknown) =>
  e instanceof JournalError && e.code === expected;
void test('durable records reopen, retries retain first sequence, batch conflicts roll back and timelines cannot mix', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'rocket-journal-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'journal.sqlite');
  let store = new SqliteJournalStore(path, identity, 3);
  let journal = new Journal().configure(store);
  let producer = journal.registerProducer('game', schemas);
  const first = await producer.append(event('a'));
  assert.equal(first.sequence, 1);
  assert.equal((await producer.append(event('a'))).replayed, true);
  await assert.rejects(
    producer.appendBatch([
      event('b'),
      { ...event('a'), payload: { changed: true } },
    ]),
    code('identity_conflict'),
  );
  assert.equal(await journal.head(), 1);
  await producer.append(event('b'));
  await producer.append(event('c'));
  await assert.rejects(producer.append(event('d')), code('archive_full'));
  journal.dispose();
  await journal.drain();
  await store.close();
  assert.throws(
    () => new SqliteJournalStore(path, { ...identity, timelineId: 'other' }),
    code('wrong_timeline'),
  );
  store = new SqliteJournalStore(path, identity, 3);
  journal = new Journal().configure(store);
  producer = journal.registerProducer('game', schemas);
  assert.equal((await producer.append(event('a'))).sequence, 1);
  const page = await journal.read();
  assert.equal(page.durability, 'durable');
  assert.deepEqual(
    page.events.map((e) => e.sequence),
    [1, 2, 3],
  );
  await store.close();
  await assert.rejects(journal.read(), code('store_unavailable'));
});
void test('query windows remain frozen across appends; filtered cursor advances without skipping and rejects changed filters/timelines', async () => {
  const journal = new Journal().configure(new MemoryJournalStore(identity));
  const producer = journal.registerProducer('game', schemas);
  await producer.appendBatch([
    event('a'),
    { ...event('b'), subjectRefs: ['else'] },
    event('c'),
  ]);
  const first = await journal.read({ subjectRef: 'entity', limit: 1 });
  assert.equal(first.events[0]?.eventId, 'a');
  assert.ok(first.nextCursor);
  await producer.append(event('d'));
  const second = await journal.read({
    subjectRef: 'entity',
    limit: 1,
    cursor: first.nextCursor,
  });
  assert.deepEqual(
    second.events.map((e) => e.eventId),
    ['c'],
  );
  assert.equal(second.head, 3);
  assert.equal(second.nextCursor, null);
  await assert.rejects(
    journal.read({ cursor: first.nextCursor }),
    code('invalid_cursor'),
  );
  const other = new Journal().configure(
    new MemoryJournalStore({ ...identity, timelineId: 'two' }),
  );
  await assert.rejects(
    other.read({ subjectRef: 'entity', cursor: first.nextCursor }),
    code('wrong_timeline'),
  );
  assert.deepEqual((await journal.read({ subjectRef: 'absent' })).events, []);
  assert.equal((await journal.read()).head, 4);
});
void test('finite payload/batch/queue bounds, copied input and producer disposal retain admitted records', async () => {
  const memory = new MemoryJournalStore(identity);
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const store: JournalStore = {
    identity,
    durability: 'volatile',
    head: () => memory.head(),
    range: (...a) => memory.range(...a),
    close: () => memory.close(),
    append: async (e) => {
      await gate;
      return memory.append(e);
    },
  };
  const journal = new Journal().configure(store),
    producer = journal.registerProducer('game', schemas);
  const mutable = { ...event('a'), payload: { value: 'original' } };
  const pending = producer.append(mutable);
  mutable.payload.value = 'mutated';
  const rest = producer.appendBatch(
    Array.from({ length: 32 }, (_, i) => event('b' + i)),
  );
  const more = producer.appendBatch(
    Array.from({ length: 31 }, (_, i) => event('c' + i)),
  );
  await assert.rejects(producer.append(event('over')), code('queue_full'));
  producer.dispose();
  await assert.rejects(producer.append(event('late')), code('disposed'));
  journal.dispose();
  release();
  await Promise.all([pending, rest, more]);
  await journal.drain();
  assert.deepEqual(journal.stats, {
    producers: 0,
    statusReaders: 0,
    pending: 0,
    disposed: true,
  });
  assert.equal(await memory.head(), 64);
  assert.deepEqual((await memory.range(0, 64, 1))[0]?.payload, {
    value: 'original',
  });
  const other = new Journal().configure(new MemoryJournalStore(identity));
  const p = other.registerProducer('game', schemas);
  await assert.rejects(
    p.append({ ...event('large'), payload: { text: 'x'.repeat(17000) } }),
    code('event_limit'),
  );
  await assert.rejects(
    p.appendBatch(Array.from({ length: 33 }, (_, i) => event(String(i)))),
    code('batch_limit'),
  );
  await assert.rejects(
    p.append({ ...event('bad'), version: 2 }),
    code('invalid_event'),
  );
});
void test('failed writes do not poison later explicit retries; no implicit event replay or action execution', async () => {
  const memory = new MemoryJournalStore(identity);
  let fail = true;
  let writes = 0;
  const journal = new Journal().configure({
    identity,
    durability: 'volatile',
    head: () => memory.head(),
    range: (...a) => memory.range(...a),
    close: () => memory.close(),
    append: (e) => {
      writes++;
      if (fail) throw new Error('disk unavailable');
      return memory.append(e);
    },
  });
  const p = journal.registerProducer('game', schemas);
  await assert.rejects(p.append(event('a')), /disk unavailable/);
  await journal.drain();
  assert.equal(writes, 1);
  assert.equal(await journal.head(), 0);
  fail = false;
  await p.append(event('a'));
  assert.equal(await journal.head(), 1);
  assert.equal(writes, 2);
});
void test('page response byte bound preserves the next matching record; domain status is copied and removed explicitly', async () => {
  const journal = new Journal().configure(new MemoryJournalStore(identity));
  const p = journal.registerProducer('game', schemas);
  for (let i = 0; i < 8; i++)
    await p.append({
      ...event('large' + i),
      payload: { text: 'x'.repeat(14000) },
    });
  let cursor: string | undefined;
  const ids: string[] = [];
  do {
    const page = await journal.read({
      ...(cursor ? { cursor } : {}),
      limit: 100,
    });
    assert.ok(new TextEncoder().encode(JSON.stringify(page)).length <= 65536);
    ids.push(...page.events.map((e) => e.eventId));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  assert.equal(new Set(ids).size, 8);
  const value = {
    revision: 1,
    recordedThrough: 8,
    availability: 'available' as const,
    data: { pose: 1 },
  };
  const reader = journal.registerStatus('world', () => value);
  const status = await journal.status(['world']);
  value.data.pose = 2;
  assert.equal(
    status.domains['world']?.data &&
      typeof status.domains['world'].data === 'object' &&
      !Array.isArray(status.domains['world'].data)
      ? status.domains['world'].data['pose']
      : null,
    1,
  );
  reader.dispose();
  await assert.rejects(journal.status(['world']), code('unknown_domain'));
  assert.equal((await journal.read()).head, 8);
});
void test('history gaps fail explicitly instead of returning complete empty history', async () => {
  const memory = new MemoryJournalStore(identity);
  const journal = new Journal().configure({
    identity,
    durability: 'volatile',
    head: () => Promise.resolve(3),
    append: (e) => memory.append(e),
    range: () => Promise.resolve([]),
    close: () => memory.close(),
  });
  await assert.rejects(journal.read(), code('history_gap'));
});
void test('MCP journal provider scopes reads to host binding and has no write tool', async () => {
  const journal = new Journal().configure(new MemoryJournalStore(identity)),
    p = journal.registerProducer('game', schemas);
  await p.append(event('a'));
  journal.registerStatus('world', () => ({
    revision: 1,
    recordedThrough: 1,
    availability: 'stale',
    data: {},
  }));
  const provider = journalProvider(journal, (s) =>
    s === 'save' ? identity : null,
  );
  const binding = {
    scope: 'save',
    providers: ['game-journal'],
    isCurrent: () => true,
  };
  const context = {
    binding,
    headers: new Headers(),
    signal: new AbortController().signal,
  };
  assert.deepEqual(
    provider.tools(binding).map((t) => t.name),
    ['game_journal_read', 'game_status_read'],
  );
  assert.equal(provider.tools({ ...binding, scope: 'other' }).length, 0);
  assert.equal(
    (await provider.call('game_journal_read', {}, context)).isError,
    undefined,
  );
  assert.equal(
    (await provider.call('game_status_read', { domains: ['world'] }, context))
      .isError,
    undefined,
  );
  await assert.rejects(
    Promise.resolve().then(() =>
      provider.call(
        'game_journal_read',
        {},
        { ...context, binding: { ...binding, scope: 'other' } },
      ),
    ),
    code('wrong_timeline'),
  );
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    Promise.resolve().then(() =>
      provider.call(
        'game_journal_read',
        {},
        { ...context, signal: aborted.signal },
      ),
    ),
    code('cancelled'),
  );
  const expired = await provider.call(
    'game_journal_read',
    {},
    { ...context, binding: { ...binding, isCurrent: () => false } },
  );
  assert.equal(expired.isError, true);
  const result = await provider.call(
    'game_journal_read',
    { invented: true },
    context,
  );
  assert.equal(result.isError, true);
});
