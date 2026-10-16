import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { SituationDefinition } from 'character-framework';
import {
  Journal,
  MemoryJournalStore,
  JournalError,
} from '../src/journal/index.js';
import { SqliteJournalStore } from '../src/journal/sqlite.js';
import { EncounterWorld } from '../examples/character-encounter/World.js';
import type { WorldSpec } from '../examples/character-encounter/World.js';
import { QuestHost } from '../examples/character-encounter/QuestHost.js';
import {
  WatchtowerReporter,
  definitionDigest,
  snapshotWorld,
  restoreWorld,
} from '../examples/journal/WatchtowerReporter.js';
import {
  startEpisode,
  completeEpisode,
  nextEpisode,
  settle,
} from '../examples/journal/episodes.js';
async function inputs() {
  const root = new URL('../../examples/character-encounter/', import.meta.url);
  return {
    spec: JSON.parse(
      await readFile(new URL('world.json', root), 'utf8'),
    ) as WorldSpec,
    definition: JSON.parse(
      await readFile(new URL('quest.json', root), 'utf8'),
    ) as SituationDefinition,
  };
}
for (const color of ['blue', 'red'] as const)
  void test(`${color}: confirmed outcome drives the other episode through ordinary handlers after coherent durable restart`, async (t) => {
    const { spec, definition } = await inputs();
    const dir = await mkdtemp(join(tmpdir(), 'rocket-episodes-'));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const path = join(dir, 'journal.sqlite');
    const identity = {
      gameId: 'watchtower',
      saveId: 'proof',
      timelineId: color,
    };
    let store = new SqliteJournalStore(path, identity),
      journal = new Journal().configure(store),
      world = new EncounterWorld(spec),
      host = new QuestHost(world),
      reporter = new WatchtowerReporter(journal, world);
    t.after(async () => {
      reporter.dispose();
      host.dispose();
      world.dispose();
      journal.dispose();
      await journal.drain();
      await store.close();
    });
    await reporter.attach(host, definition, 'A');
    await startEpisode(host, definition);
    await reporter.capture();
    await assert.rejects(
      nextEpisode(journal, world, definition),
      /No confirmed/,
    );
    world.observe({ x: 0, y: 0 });
    assert.match(world.interact('beacon-a'), /Move within/);
    await reporter.capture();
    assert.equal(
      (await journal.read({ type: 'quest.mission_report' })).events.length,
      0,
    );
    host.loseNextReply();
    await completeEpisode(world, host, reporter, color, true);
    const before = await journal.head();
    await reporter.capture();
    assert.equal(
      await journal.head(),
      before,
      'reobserving/replaying must not duplicate records',
    );
    const report = (await journal.read({ type: 'quest.mission_report' }))
      .events[0]!;
    assert.ok(report);
    assert.equal(report.correlation?.['questRunId'], host.view?.runId);
    const selected = await nextEpisode(journal, world, definition);
    assert.notEqual(selected.color, color);
    store.saveCheckpoint(snapshotWorld(world), await journal.head());
    reporter.dispose();
    host.dispose();
    world.dispose();
    journal.dispose();
    await journal.drain();
    await store.close();
    store = new SqliteJournalStore(path, identity);
    journal = new Journal().configure(store);
    world = restoreWorld(store.readCheckpoint().data);
    host = new QuestHost(world);
    reporter = new WatchtowerReporter(journal, world);
    const resumed = await nextEpisode(journal, world, definition);
    assert.equal(resumed.parentRun, selected.parentRun);
    assert.equal(resumed.color, selected.color);
    await reporter.attach(host, resumed.definition, 'B');
    await startEpisode(host, resumed.definition);
    await reporter.capture();
    await completeEpisode(world, host, reporter, resumed.color, false);
    const reports = await journal.read({ type: 'quest.mission_report' });
    assert.equal(reports.events.length, 2);
    assert.ok(
      world.entities.filter((e) => e.kind === 'beacon').every((e) => e.lit),
    );
    assert.throws(
      () => store.readCheckpoint(),
      (e: unknown) =>
        e instanceof JournalError && e.code === 'checkpoint_mismatch',
    );
    assert.throws(
      () => store.saveCheckpoint(snapshotWorld(world), before),
      (e: unknown) =>
        e instanceof JournalError && e.code === 'checkpoint_mismatch',
    );
  });
void test('reporting failure marks status unavailable and retries evidence without executing world action again', async () => {
  const { spec, definition } = await inputs();
  const memory = new MemoryJournalStore({
    gameId: 'g',
    saveId: 's',
    timelineId: 't',
  });
  let broken = false;
  const journal = new Journal().configure({
    identity: memory.identity,
    durability: 'volatile',
    head: () => memory.head(),
    range: (...a) => memory.range(...a),
    close: () => memory.close(),
    append: (e) => {
      if (broken) throw new Error('write failed');
      return memory.append(e);
    },
  });
  const world = new EncounterWorld(spec),
    host = new QuestHost(world),
    reporter = new WatchtowerReporter(journal, world);
  try {
    await reporter.attach(host, definition, 'A');
    await startEpisode(host, definition);
    await reporter.capture();
    world.observe({ x: 208, y: 208 });
    await settle(host);
    const count = host.executions;
    broken = true;
    await assert.rejects(reporter.capture(), /write failed/);
    assert.equal(
      (await journal.status(['world'])).domains['world']?.availability,
      'unavailable',
    );
    broken = false;
    const unrelated = journal.registerProducer('other', {
      'other.changed': { version: 1, validate: () => true },
    });
    await unrelated.append({
      eventId: 'unrelated',
      type: 'other.changed',
      version: 1,
      subjectRefs: [],
      payload: null,
    });
    assert.equal(
      (await journal.status(['world'])).domains['world']?.availability,
      'unavailable',
      'a higher unrelated journal head cannot hide missing evidence',
    );
    unrelated.dispose();
    await reporter.capture();
    assert.equal(host.executions, count);
    assert.equal(
      (await journal.status(['world'])).domains['world']?.availability,
      'available',
    );
  } finally {
    reporter.dispose();
    host.dispose();
    world.dispose();
    journal.dispose();
    await journal.drain();
    await memory.close();
  }
});
for (const observed of [true, false])
  void test(`shared-destination choices retain exact accepted identity; observed=${observed}`, async () => {
    const { spec } = await inputs();
    const definition: SituationDefinition = {
      proposalVersion: 'cfw-situations-draft-2',
      id: 'shared-choice',
      start: 'offer',
      situations: [
        {
          id: 'offer',
          dialogue: { text: 'Choose' },
          choices: [
            { id: 'one', label: 'First', next: 'end' },
            { id: 'two', label: 'Second', next: 'end' },
          ],
        },
        { id: 'end', dialogue: { text: 'Done' } },
      ],
    };
    const journal = new Journal().configure(
        new MemoryJournalStore({ gameId: 'g', saveId: 's', timelineId: 't' }),
      ),
      world = new EncounterWorld(spec),
      host = new QuestHost(world),
      reporter = new WatchtowerReporter(journal, world);
    try {
      await reporter.attach(host, definition, 'A');
      await startEpisode(host, definition);
      const view = host.view!,
        choice = view.choices[1]!;
      const operation = observed
        ? reporter.choose(choice.id, view.revision, 'choose-second')
        : host.handle.choose(
            view.runId,
            choice.id,
            view.revision,
            'choose-second',
          );
      await settle(host, operation);
      await reporter.capture();
      const records = await journal.read({ type: 'quest.choice_confirmed' });
      assert.equal(records.events.length, observed ? 1 : 0);
      if (observed) {
        assert.deepEqual(records.events[0]?.payload, {
          choiceRef: choice.id,
          choiceLabel: 'Second',
          from: 'offer',
          to: 'end',
          acceptedRevision: view.revision + 1,
        });
        await settle(
          host,
          reporter.choose(choice.id, view.revision, 'choose-second'),
        );
        await reporter.capture();
        assert.equal(
          (await journal.read({ type: 'quest.choice_confirmed' })).events
            .length,
          1,
        );
        await assert.rejects(
          reporter.choose(view.choices[0]!.id, view.revision, 'choose-second'),
          /identity conflict/,
        );
      }
    } finally {
      reporter.dispose();
      host.dispose();
      world.dispose();
      journal.dispose();
      await journal.drain();
    }
  });
void test('runtime closure without the required beacon result does not certify mission success', async () => {
  const { spec, definition } = await inputs();
  const modified: SituationDefinition = {
    ...definition,
    id: 'no-beacon-effect',
    situations: definition.situations.map((s) =>
      s.id === 'blue-complete'
        ? {
            ...s,
            onEnter: [
              {
                id: 'show-guide',
                tool: 'game_reveal',
                arguments: { entityRef: 'guide' },
              },
            ],
          }
        : s,
    ),
  };
  const journal = new Journal().configure(
      new MemoryJournalStore({ gameId: 'g', saveId: 's', timelineId: 't' }),
    ),
    world = new EncounterWorld(spec),
    host = new QuestHost(world),
    reporter = new WatchtowerReporter(journal, world);
  try {
    await reporter.attach(host, modified, 'A');
    await startEpisode(host, modified);
    await assert.rejects(
      completeEpisode(world, host, reporter, 'blue', true),
      /did not complete/,
    );
    assert.equal(host.view?.status, 'closed');
    assert.equal(
      (await journal.read({ type: 'quest.mission_report' })).events.length,
      0,
    );
    await assert.rejects(nextEpisode(journal, world, modified), /No confirmed/);
  } finally {
    reporter.dispose();
    host.dispose();
    world.dispose();
    journal.dispose();
    await journal.drain();
  }
});

void test('same-ID altered attachment cannot certify the executed definition digest', async () => {
  const { spec, definition } = await inputs();
  const altered: SituationDefinition = {
    ...definition,
    situations: definition.situations.map((stage, i) =>
      i === 0
        ? { ...stage, dialogue: { text: 'Same ID, different content' } }
        : stage,
    ),
  };
  const journal = new Journal().configure(
      new MemoryJournalStore({ gameId: 'g', saveId: 's', timelineId: 't' }),
    ),
    world = new EncounterWorld(spec),
    host = new QuestHost(world),
    reporter = new WatchtowerReporter(journal, world);
  try {
    await reporter.attach(host, altered, 'A');
    await startEpisode(host, definition);
    await assert.rejects(
      reporter.capture(),
      /does not match executed definition/,
    );
    assert.equal(await journal.head(), 0);
    assert.equal(
      (await journal.status(['quests'])).domains['quests']?.availability,
      'unavailable',
    );
    assert.equal(
      (await journal.read({ type: 'quest.mission_report' })).events.length,
      0,
    );
    await reporter.attach(host, definition, 'A');
    await reporter.capture();
    await completeEpisode(world, host, reporter, 'blue', true);
    const report = (await journal.read({ type: 'quest.mission_report' }))
      .events[0]!;
    assert.ok(report);
    assert.equal(
      (report.payload as { definitionDigest: string }).definitionDigest,
      await definitionDigest(definition),
    );
  } finally {
    reporter.dispose();
    host.dispose();
    world.dispose();
    journal.dispose();
    await journal.drain();
  }
});
