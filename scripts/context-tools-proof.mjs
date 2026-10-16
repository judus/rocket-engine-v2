// Exact native MCP text responses; deterministic read-only proof, no model calls.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { FakeCaiClient } from '../node_modules/cfw-authoring-candidate/examples/fake-cai-client.js';
import { combinedFixture } from '../dist/examples/quest-authoring/CombinedFixture.js';
import { listen } from '../dist/examples/quest-authoring/Loopback.js';
import { EncounterWorld } from '../dist/examples/character-encounter/World.js';
const root = new URL('../', import.meta.url);
const output =
  process.argv[2] ?? (await mkdtemp(join(tmpdir(), 'rocket-context-output-')));
await mkdir(output, { recursive: true });
let fixture, server, client;
const port = Number(process.env.ROCKET_CONTEXT_PORT ?? 8098);
const credential = randomBytes(32).toString('hex');
if (process.env.ROCKET_CONTEXT_CONNECTION) {
  const config = JSON.parse(
    await readFile(process.env.ROCKET_CONTEXT_CONNECTION, 'utf8'),
  );
  client = new FakeCaiClient(
    new URL(config.endpoint),
    config.bindingHeaders,
    await readFile(config.credentialFile, 'utf8'),
  );
} else {
  fixture = combinedFixture({
    world: new EncounterWorld(
      JSON.parse(
        await readFile(
          new URL('examples/character-encounter/world.json', root),
          'utf8',
        ),
      ),
    ),
    authorContext: JSON.parse(
      await readFile(
        new URL('examples/quest-authoring/author-context.json', root),
        'utf8',
      ),
    ),
    path: join(
      await mkdtemp(join(tmpdir(), 'rocket-context-proof-')),
      'author.sqlite',
    ),
    credential,
    port,
  });
  server = listen(fixture.host, port, () => fixture.drain());
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  client = new FakeCaiClient(
    new URL(`http://127.0.0.1:${port}/mcp`),
    fixture.headers,
    credential,
  );
}
const examples = [
  ['authoring-example', 'show_authoring_example', {}],
  [
    'authoring-example-steps',
    'show_authoring_example',
    { section: 'steps', start: 1, limit: 4 },
  ],
  ['briefing', 'game_author_briefing', {}],
  ['vocabulary', 'game_author_briefing', { section: 'vocabulary' }],
  [
    'context-instructions',
    'game_author_briefing',
    { section: 'context_tools' },
  ],
  [
    'characters-unknown',
    'game_entities_list',
    { category: 'character', knowledge: 'unknown' },
  ],
  [
    'characters-known',
    'game_entities_list',
    { category: 'character', knowledge: 'known' },
  ],
  ['locations', 'game_entities_list', { category: 'location' }],
  ['spawn-locations', 'game_entities_list', { category: 'spawn_location' }],
  ['buildings', 'game_entities_list', { category: 'building' }],
  ['watchkeeper', 'game_entity_details', { ref: 'guide' }],
  [
    'beacon-accessibility',
    'game_location_accessibility',
    { toRef: 'beacon-a' },
  ],
  ['gate-accessibility', 'game_location_accessibility', { toRef: 'gate' }],
  ['distance-straight', 'game_distance', { toRef: 'beacon-a' }],
  ['distance-route', 'game_distance', { toRef: 'beacon-a', metric: 'route' }],
  ['journal', 'game_journal_read', {}],
  ['status', 'game_status_read', { domains: ['world', 'quests'] }],
];
const transcript = [];
try {
  await client.connect();
  const { tools } = await client.client.listTools();
  assert.equal(tools.length, 32);
  assert.ok(!tools.some((tool) => tool.name === 'game_world_summary'));
  await writeFile(
    join(output, 'native-discovery.json'),
    JSON.stringify(tools, null, 2) + '\n',
  );
  for (const [slug, name, args] of examples) {
    const result = await client.call(name, args, {
      callId: 'context-proof-' + slug,
      turnId: 'context-proof',
    });
    assert.ok(!result.isError, JSON.stringify(result));
    assert.equal(
      result.structuredContent,
      undefined,
      'new context tools return plain text',
    );
    const text = result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
    assert.ok(text.length && !text.startsWith('{'));
    transcript.push({ tool: name, arguments: args, text });
    await writeFile(join(output, slug + '.txt'), text + '\n');
  }
  assert.match(
    transcript.find((t) => t.tool === 'game_author_briefing').text,
    /game_encounter \(inspection\)/,
  );
  assert.match(
    transcript.find((t) => t.arguments.category === 'building').text,
    /No matching records/,
  );
  assert.match(
    transcript.find(
      (t) =>
        t.tool === 'game_location_accessibility' &&
        t.arguments.toRef === 'gate',
    ).text,
    /unreachable/,
  );
  assert.match(
    transcript.find(
      (t) =>
        t.tool === 'game_location_accessibility' &&
        t.arguments.toRef === 'beacon-a',
    ).text,
    /found/,
  );
  const invalid = await client.call(
    'game_entities_list',
    { category: 'invented' },
    { callId: 'invalid-context', turnId: 'context-proof' },
  );
  assert.equal(invalid.isError, true);
  await writeFile(
    join(output, 'context-tools.txt'),
    transcript
      .map(
        (c) =>
          `${c.tool}(${Object.entries(c.arguments)
            .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`)
            .join(', ')})\n${'='.repeat(60)}\n${c.text}`,
      )
      .join('\n\n') + '\n',
  );
  await writeFile(
    join(output, 'protocol-transcript.json'),
    JSON.stringify(transcript, null, 2) + '\n',
  );
  if (fixture) {
    assert.equal(fixture.world.events.length, 0);
    assert.equal(fixture.game.executions, 0);
  }
} finally {
  await client.close();
  if (fixture) {
    fixture.host.dispose();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await fixture.close();
    assert.deepEqual(fixture.host.stats, {
      providers: 0,
      connections: 0,
      disposed: true,
    });
    assert.deepEqual(fixture.context.journal.stats, {
      producers: 0,
      statusReaders: 0,
      pending: 0,
      disposed: true,
    });
  }
}
console.log(
  JSON.stringify({
    passed: true,
    tools: 32,
    plainTextExamples: examples.length,
    modelCalls: 0,
    output,
  }),
);
