import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { HostTransport } from './HostTransport.js';
import type { SituationDefinition } from 'character-framework';
import { Rocket } from '../../src/Rocket.js';
import { McpService } from '../../src/mcp/index.js';
import { Journal } from '../../src/journal/index.js';
import { SqliteJournalStore } from '../../src/journal/sqlite.js';
import { journalProvider } from '../../src/journal/mcp.js';
import { EncounterWorld } from '../character-encounter/World.js';
import type { WorldSpec } from '../character-encounter/World.js';
import { QuestHost } from '../character-encounter/QuestHost.js';
import {
  WatchtowerReporter,
  snapshotWorld,
  restoreWorld,
} from './WatchtowerReporter.js';
import { startEpisode, completeEpisode, nextEpisode } from './episodes.js';
const root = new URL('../../../examples/character-encounter/', import.meta.url);
const spec = JSON.parse(
  await readFile(new URL('world.json', root), 'utf8'),
) as WorldSpec;
const definition = JSON.parse(
  await readFile(new URL('quest.json', root), 'utf8'),
) as SituationDefinition;
const dir = await mkdtemp(join(tmpdir(), 'rocket-journal-proof-'));
const results = [];
for (const color of ['blue', 'red'] as const) {
  const identity = {
      gameId: 'rocket-encounter',
      saveId: 'proof',
      timelineId: color,
    },
    path = join(dir, color + '.sqlite');
  let store = new SqliteJournalStore(path, identity),
    journal = new Journal().configure(store),
    world = new EncounterWorld(spec),
    game = new QuestHost(world),
    reporter = new WatchtowerReporter(journal, world);
  await reporter.attach(game, definition, 'A');
  await startEpisode(game, definition);
  await reporter.capture();
  await completeEpisode(world, game, reporter, color, true);
  store.saveCheckpoint(snapshotWorld(world), await journal.head());
  reporter.dispose();
  game.dispose();
  world.dispose();
  journal.dispose();
  await journal.drain();
  await store.close();
  store = new SqliteJournalStore(path, identity);
  journal = new Journal().configure(store);
  world = restoreWorld(store.readCheckpoint().data);
  game = new QuestHost(world);
  reporter = new WatchtowerReporter(journal, world);
  const next = await nextEpisode(journal, world, definition);
  await reporter.attach(game, next.definition, 'B');
  await startEpisode(game, next.definition);
  await reporter.capture();
  await completeEpisode(world, game, reporter, next.color, false);
  const app = new Rocket(),
    url = new URL('http://127.0.0.1:8095/mcp');
  const host = app.use(McpService).configure({
    credential: 'journal-proof-only',
    allowedHosts: [url.host],
    resolveBinding: () => ({
      scope: 'proof',
      providers: ['game-journal'],
      isCurrent: () => true,
    }),
  });
  host.register(
    journalProvider(journal, (scope) => (scope === 'proof' ? identity : null)),
  );
  const client = new Client({ name: 'journal-proof', version: '1' });
  const transport = new HostTransport(host, url, 'journal-proof-only');
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((t) => t.name),
      ['game_journal_read', 'game_status_read'],
    );
    const records = await client.callTool({
      name: 'game_journal_read',
      arguments: { type: 'quest.mission_report' },
    });
    assert.equal(records.isError, undefined);
    const status = await client.callTool({
      name: 'game_status_read',
      arguments: { domains: ['world', 'quests'] },
    });
    assert.equal(status.isError, undefined);
    const reports = await journal.read({ type: 'quest.mission_report' });
    assert.equal(reports.events.length, 2);
    results.push({
      first: color,
      second: next.color,
      restarted: true,
      parentRun: next.parentRun,
      journalHead: await journal.head(),
      reports: reports.events,
      status: status.structuredContent,
      tools: tools.tools.map((t) => t.name),
      transport:
        'official MCP client through actual Rocket handle (in process; not TCP)',
    });
  } finally {
    await client.close();
    await app.dispose();
    await host.close();
    assert.deepEqual(host.stats, {
      providers: 0,
      connections: 0,
      disposed: true,
    });
    reporter.dispose();
    game.dispose();
    world.dispose();
    journal.dispose();
    await journal.drain();
    assert.equal(journal.pending, 0);
    await store.close();
  }
}
await writeFile(
  join(dir, 'result.json'),
  JSON.stringify(results, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    passed: true,
    branches: 2,
    episodes: 4,
    durableRestart: true,
    artifact: dir,
  }),
);
