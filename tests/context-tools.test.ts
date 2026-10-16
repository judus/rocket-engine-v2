import test from 'node:test';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EncounterWorld } from '../examples/character-encounter/World.js';
import type { WorldSpec } from '../examples/character-encounter/World.js';
import { QuestHost } from '../examples/character-encounter/QuestHost.js';
import { contextProvider } from '../examples/quest-authoring/ContextProvider.js';
import type { AuthorContext } from '../examples/quest-authoring/ContextProvider.js';
import type { McpBinding } from '../src/mcp/contracts.js';
async function fixture(
  authoringTools: readonly Tool[] = [],
  validateAuthoringInput: (
    name: string,
    args: Readonly<Record<string, unknown>>,
  ) => boolean = () => false,
) {
  const base = new URL('../../examples/', import.meta.url);
  const world = new EncounterWorld(
    JSON.parse(
      await readFile(new URL('character-encounter/world.json', base), 'utf8'),
    ) as WorldSpec,
  );
  const game = new QuestHost(world);
  const authored = JSON.parse(
    await readFile(
      new URL('quest-authoring/author-context.json', base),
      'utf8',
    ),
  ) as AuthorContext;
  let current = true;
  const binding: McpBinding = {
    scope: 'author',
    providers: ['watchtower-context'],
    isCurrent: () => current,
  };
  const adapter = contextProvider(
    world,
    game,
    authored,
    'author',
    authoringTools,
    'test-context',
    validateAuthoringInput,
  );
  async function call(
    name: string,
    args: Record<string, unknown> = {},
    overrides: Partial<McpBinding> = {},
  ) {
    return adapter.provider.call(name, args, {
      binding: { ...binding, ...overrides },
      signal: new AbortController().signal,
      headers: new Headers(),
    });
  }
  return {
    world,
    game,
    authored,
    adapter,
    binding,
    call,
    expire() {
      current = false;
    },
    async close() {
      await adapter.close();
      game.dispose();
      world.dispose();
    },
  };
}
const text = (
  result: Awaited<ReturnType<Awaited<ReturnType<typeof fixture>>['call']>>,
) =>
  result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
void test('briefing vocabulary uses exactly executable game names; rejects invented/missing vocabulary', async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const result = await f.call('game_author_briefing');
  assert.equal(result.isError, undefined);
  assert.equal(result.structuredContent, undefined);
  const output = text(result);
  let previous = -1;
  for (const label of [
    'GAME TYPE',
    'SETTING',
    'STORY AND CONTEXT',
    'YOUR ASSIGNMENT',
    'GAME MECHANICS',
    'SUPPORTED GAME PRIMITIVES',
    'BEFORE AUTHORING',
    'HOW TO AUTHOR',
  ]) {
    const at = output.indexOf(label);
    assert.ok(at > previous);
    previous = at;
  }
  for (const capability of f.game.capabilities)
    assert.ok(
      output.includes('- ' + capability.name + ' (' + capability.kind + ')'),
    );
  assert.ok(!output.includes('defeat_enemy'));
  assert.throws(
    () =>
      contextProvider(
        f.world,
        f.game,
        { ...f.authored, vocabulary: { invented: 'Fake' } },
        'author',
        [],
        'other',
      ),
    /exactly match/,
  );
  assert.equal(f.world.sequence, 0);
  assert.equal(f.game.executions, 0);
});
void test('knowledge filters are explicit and separate from visibility; buildings are empty and pagination detects changed revision', async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  f.world.entities.find((e) => e.id === 'guide')!.visible = true;
  const unknown = text(
    await f.call('game_entities_list', {
      category: 'character',
      knowledge: 'unknown',
    }),
  );
  assert.match(unknown, /guide — Watchkeeper/);
  assert.ok(!unknown.includes('player — Protagonist'));
  assert.match(
    text(await f.call('game_entities_list', { category: 'building' })),
    /No matching records/,
  );
  assert.match(
    text(await f.call('game_entities_list', { category: 'spawn_location' })),
    /spawn:player/,
  );
  const first = text(await f.call('game_entities_list', { limit: 1 }));
  assert.match(first, /Next offset: 1/);
  const second = text(
    await f.call('game_entities_list', {
      limit: 1,
      offset: 1,
      expectedRevision: 0,
    }),
  );
  assert.ok(!second.includes('player — Protagonist'));
  f.world.observe({ x: 100, y: 208 });
  assert.equal(
    (await f.call('game_entities_list', { expectedRevision: 0 })).isError,
    true,
  );
  assert.equal(
    (await f.call('game_entities_list', { limit: 0 })).isError,
    true,
  );
  assert.equal(
    (await f.call('game_entity_details', { ref: 'invented' })).isError,
    true,
  );
});
void test('existing navigation distinguishes blocked goal, accessible detour and Euclidean/route distances without moving the player', async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const position = { ...f.world.position };
  assert.match(
    text(await f.call('game_location_accessibility', { toRef: 'gate' })),
    /unreachable.*invalid-goal/,
  );
  assert.match(
    text(await f.call('game_location_accessibility', { toRef: 'beacon-a' })),
    /Navigation result: found/,
  );
  const direct = text(await f.call('game_distance', { toRef: 'beacon-a' }));
  assert.match(direct, /Euclidean distance: 615.53/);
  const routed = text(
    await f.call('game_distance', { toRef: 'beacon-a', metric: 'route' }),
  );
  assert.match(routed, /Navigation result: found/);
  assert.ok(!routed.includes('Navigable route length: 615.53'));
  assert.match(
    text(await f.call('game_location_accessibility', { x: -1, y: 20 })),
    /invalid-goal/,
  );
  assert.equal(
    (
      await f.call('game_location_accessibility', {
        toRef: 'gate',
        x: 10,
        y: 20,
      })
    ).isError,
    true,
  );
  assert.equal(
    (await f.call('game_location_accessibility', { x: NaN, y: 20 })).isError,
    true,
  );
  f.world.entities.find((e) => e.id === 'gate')!.open = true;
  f.world.revision++;
  assert.match(
    text(await f.call('game_location_accessibility', { toRef: 'gate' })),
    /Navigation result: found/,
  );
  assert.deepEqual(f.world.position, position);
  assert.equal(f.game.executions, 0);
  assert.equal(f.world.events.length, 0);
});
void test('journal shares the actual fixture world, never invents events, rejects unknown history and expires with its binding', async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  assert.equal(f.adapter.provider.tools(f.binding).length, 8);
  assert.match(text(await f.call('game_journal_read')), /No confirmed events/);
  assert.match(
    text(await f.call('game_status_read', { domains: ['world', 'quests'] })),
    /status: none/,
  );
  f.world.observe({ x: 208, y: 208 });
  const result = text(await f.call('game_journal_read'));
  assert.match(result, /kind: location/);
  assert.match(result, /ref: courtyard/);
  const filtered = text(
    await f.call('game_journal_read', { type: 'quest.mission_report' }),
  );
  assert.match(filtered, /No events match this query\/window/);
  assert.ok(!filtered.includes('No confirmed events are recorded'));
  assert.match(filtered, /type: quest.mission_report/);
  assert.match(filtered, /head: 1/);
  assert.match(filtered, /complete: true/);
  assert.match(filtered, /nextCursor: none/);
  const head = await f.adapter.journal.head();
  assert.equal(text(await f.call('game_journal_read')), result);
  assert.equal(await f.adapter.journal.head(), head);
  f.world.historyAvailable = false;
  assert.equal((await f.call('game_journal_read')).isError, true);
  assert.match(
    text(await f.call('game_status_read', { domains: ['world'] })),
    /availability: unavailable/,
  );
  assert.equal(
    (await f.call('game_entity_details', { ref: 'guide' }, { scope: 'other' }))
      .isError,
    true,
  );
  assert.equal(
    (await f.call('game_entity_details', { ref: 'guide' }, { providers: [] }))
      .isError,
    true,
  );
  f.expire();
  assert.deepEqual(f.adapter.provider.tools(f.binding), []);
  assert.equal((await f.call('game_author_briefing')).isError, true);
});

void test('authoring-tool descriptions come from granted discovery, with the example pointer before the tool list', async (t) => {
  const tool: Tool = {
    name: 'add_stage',
    description:
      'Current provider description, not an independently maintained copy.',
    inputSchema: { type: 'object' },
  };
  const f = await fixture([tool]);
  t.after(() => f.close());
  const output = text(
    await f.call('game_author_briefing', { section: 'authoring' }),
  );
  assert.ok(!output.includes('authoring keywords'));
  assert.ok(output.includes('Available authoring tools:'));
  assert.ok(output.includes('- add_stage: ' + tool.description));
  assert.ok(
    output.indexOf('show_authoring_example') <
      output.indexOf('Available authoring tools'),
  );
});
void test('CFW example is a complete explained call chain with resulting Mermaid, never resulting quest JSON; missing grants and changed inputs fail closed', async (t) => {
  const doc = new URL(
    '../../docs/contracts/quest-builder-mcp-tools.json',
    import.meta.resolve('cfw-authoring-candidate'),
  );
  const native = JSON.parse(await readFile(doc, 'utf8')) as { tools: Tool[] };
  const validated: string[] = [];
  const f = await fixture(native.tools, (name) => {
    validated.push(name);
    return true;
  });
  t.after(() => f.close());
  const result = await f.call('show_authoring_example');
  assert.equal(result.isError, undefined);
  const output = text(result);
  assert.match(output, /COMPLETE TOOL-CALL CHAIN/);
  assert.equal([...output.matchAll(/^\d+\. \w+\(/gm)].length, 63);
  assert.match(output, /Explanation:/);
  assert.match(output, /Rejected call;/);
  assert.match(output, /```mermaid\nflowchart/);
  assert.match(output, /s1/);
  assert.match(output, /s12/);
  assert.ok(!output.includes('"situations":'));
  assert.ok(output.indexOf('RESULTING QUEST') > output.indexOf('63. '));
  assert.ok(validated.includes('create_quest_draft'));
  const page = text(
    await f.call('show_authoring_example', {
      section: 'steps',
      start: 5,
      limit: 4,
    }),
  );
  assert.match(page, /CONSECUTIVE CALLS 5–8/);
  assert.match(page, /start: 9/);
  assert.equal(
    (await f.call('show_authoring_example', { section: 'steps', start: 999 }))
      .isError,
    true,
  );
  const diagram = text(
    await f.call('show_authoring_example', { section: 'diagram' }),
  );
  assert.match(diagram, /```mermaid/);
  assert.ok(!diagram.includes('1. create_quest_draft('));
  assert.equal(f.game.executions, 0);
  assert.equal(f.world.events.length, 0);
  const missing = await fixture();
  t.after(() => missing.close());
  assert.equal((await missing.call('show_authoring_example')).isError, true);
  const changed = await fixture(native.tools, () => false);
  t.after(() => changed.close());
  assert.match(
    text(await changed.call('show_authoring_example')),
    /no longer matches/,
  );
});
