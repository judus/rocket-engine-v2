// Deterministic TCP integration proof only. No model call or generation batch.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { FakeCaiClient } from '../node_modules/cfw-authoring-candidate/examples/fake-cai-client.js';
import { combinedFixture } from '../dist/examples/quest-authoring/CombinedFixture.js';
import { listen } from '../dist/examples/quest-authoring/Loopback.js';
import { EncounterWorld } from '../dist/examples/character-encounter/World.js';
import { QuestHost } from '../dist/examples/character-encounter/QuestHost.js';
const root = new URL('../', import.meta.url);
const baselineBytes = await readFile(
  new URL('examples/character-encounter/quest.json', root),
);
assert.equal(
  createHash('sha256').update(baselineBytes).digest('hex'),
  '32aabc76aaf1c3f0a8cc57bb6a9287ac3f55eb46334c78a3ba6086be8d0c9f9d',
);
const baseline = JSON.parse(baselineBytes);
const spec = JSON.parse(
  await readFile(
    new URL('examples/character-encounter/world.json', root),
    'utf8',
  ),
);
const dir = await mkdtemp(join(tmpdir(), 'rocket-quest-proof-'));
const credential = randomBytes(32).toString('hex');
const port = Number(process.env.ROCKET_PROOF_PORT ?? 8095);
const options = {
  authorContext: JSON.parse(
    await readFile(
      new URL('examples/quest-authoring/author-context.json', root),
      'utf8',
    ),
  ),
  credential,
  port,
  path: join(dir, 'author.sqlite'),
};
let fixture, server, client;
async function open() {
  fixture = combinedFixture({ ...options, world: new EncounterWorld(spec) });
  server = listen(fixture.host, port, () => fixture.drain());
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  client = new FakeCaiClient(
    new URL(`http://127.0.0.1:${port}/mcp`),
    fixture.headers,
    credential,
    (target, init) => {
      // Each request owns its socket so host restart cannot reuse a retired connection.
      const headers = new Headers(init?.headers);
      headers.set('Connection', 'close');
      return fetch(target, { ...init, headers });
    },
  );
  await client.connect();
}
async function close() {
  await client.close();
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
}
await open();
/* old startup removed */
const transcript = [];
async function call(name, args, effectKey) {
  const identity = {
    callId: `proof-call-${transcript.length + 1}`,
    turnId: 'deterministic-proof',
    ...(effectKey ? { effectKey } : {}),
  };
  const result = await client.call(name, args, identity);
  transcript.push({ name, arguments: args, identity, result });
  await writeFile(
    join(dir, 'calls.json'),
    JSON.stringify(transcript, null, 2) + '\n',
  );
  return result.structuredContent;
}
let definition;
try {
  const tools = await client.client.listTools();
  assert.equal(tools.tools.length, 32);
  assert.ok(!tools.tools.some((tool) => tool.name === 'game_world_summary'));
  const briefing = await client.client.callTool({
    name: 'game_author_briefing',
    arguments: {},
  });
  assert.equal(briefing.structuredContent, undefined);
  assert.match(briefing.content[0].text, /GAME TYPE/);
  const catalogue = await call('read_quest_draft', { section: 'catalogue' });
  assert.equal(catalogue.status, 'completed');
  assert.equal(
    catalogue.data.capabilities.length,
    fixture.game.capabilities.length,
  );
  assert.equal(fixture.world.events.length, 0);
  await writeFile(
    join(dir, 'tools.json'),
    JSON.stringify(tools.tools, null, 2) + '\n',
  );
  assert.ok(!tools.tools.some((t) => t.name === 'edit_quest_draft'));
  const recorded = JSON.parse(
    await readFile(
      new URL('tests/fixtures/quest-builder/calls.json', root),
      'utf8',
    ),
  );
  let draftId, publication, publishArgs, publishKey;
  for (const [i, step] of recorded.entries()) {
    const args = structuredClone(step.arguments);
    if (args.draft) args.draft.id = draftId;
    if (args.draftId) args.draftId = draftId;
    const mutation =
      tools.tools.find((t) => t.name === step.tool).annotations.readOnlyHint ===
      false;
    const key = mutation ? `builder-${i}` : undefined;
    const result = await call(step.tool, args, key);
    assert.equal(result.status, step.expectedStatus, JSON.stringify(result));
    if (step.tool === 'create_quest_draft') {
      draftId = result.data.draftId;
      assert.deepEqual(await call(step.tool, args, key), result);
      assert.equal(
        (await call(step.tool, { ...args, title: 'Conflicting retry' }, key))
          .status,
        'rejected',
      );
    }
    if (step.tool === 'publish_quest_draft' && result.status === 'completed') {
      publication = result;
      publishArgs = args;
      publishKey = key;
      assert.deepEqual(await call(step.tool, args, key), result);
    }
  }
  assert.ok(publication);
  assert.equal(
    (await call('read_quest_draft', { section: 'publications', draftId }))
      .status,
    'rejected',
  );
  definition = fixture.author.readPublishedDefinition(
    publication.data.publication.definitionId,
  );
  const canonical = (value) =>
    Array.isArray(value)
      ? '[' + value.map(canonical).join(',') + ']'
      : value && typeof value === 'object'
        ? '{' +
          Object.keys(value)
            .sort()
            .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
            .join(',') +
          '}'
        : JSON.stringify(value);
  assert.equal(
    createHash('sha256').update(canonical(definition)).digest('hex'),
    publication.data.publication.digest,
  );
  const mapping = JSON.parse(
    await readFile(
      new URL('tests/fixtures/quest-builder/id-mapping.json', root),
      'utf8',
    ),
  );
  const expected = structuredClone(baseline);
  expected.start = mapping.stageMap[expected.start];
  for (const stage of expected.situations) {
    const original = stage.id;
    stage.id = mapping.stageMap[original];
    for (const record of [...(stage.routes ?? []), ...(stage.choices ?? [])]) {
      record.id = mapping.recordMap[original + ':' + record.id];
      record.next = mapping.stageMap[record.next];
      if (record.when?.evidence.after?.situationRef)
        record.when.evidence.after.situationRef =
          mapping.stageMap[record.when.evidence.after.situationRef];
    }
    for (const action of stage.onEnter ?? [])
      action.id = mapping.recordMap[original + ':' + action.id];
  }
  assert.deepEqual(definition.situations, expected.situations);
  assert.equal(definition.start, expected.start);
  assert.equal(fixture.world.events.length, 0);
  const listed = await call('list_quest_drafts', {});
  const commandId = publication.data.commandId;
  assert.ok(listed.data.recentCommands.some((c) => c.commandId === commandId));
  const outcome = await call('get_authoring_command_outcome', { commandId });
  assert.equal(outcome.status, 'completed');
  await close();
  await open();
  assert.deepEqual(
    fixture.author.readPublishedDefinition(definition.id),
    definition,
  );
  assert.deepEqual(
    await call('publish_quest_draft', publishArgs, publishKey),
    publication,
  );
  assert.deepEqual(
    await call('get_authoring_command_outcome', { commandId }),
    outcome,
  );
  assert.equal(fixture.world.events.length, 0);
  await writeFile(
    join(dir, 'publication.json'),
    JSON.stringify(publication, null, 2) + '\n',
  );
  await writeFile(
    join(dir, 'published-definition.json'),
    JSON.stringify(definition, null, 2) + '\n',
  );
  await writeFile(
    join(dir, 'calls.json'),
    JSON.stringify(transcript, null, 2) + '\n',
  );
} finally {
  await close();
}
const branches = [];
async function ticks(host, n = 30) {
  for (let i = 0; i < n; i++) {
    host.advance(1 / 60);
    await setImmediate();
  }
}
async function settle(host, promise) {
  let done = false;
  void promise.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  for (let i = 0; i < 200 && !done; i++) await ticks(host, 1);
  assert.ok(done);
  await promise;
  await ticks(host);
}
for (const color of ['blue', 'red']) {
  const world = new EncounterWorld(spec);
  const host = new QuestHost(world);
  try {
    await settle(host, host.start(definition));
    world.observe({ x: 208, y: 208 });
    await ticks(host);
    for (const enemy of world.entities.filter((e) => e.kind === 'enemy')) {
      world.observe(enemy);
      world.interact(enemy.id);
      await ticks(host);
    }
    world.observe({ x: 448, y: 208 });
    await ticks(host);
    const view = host.view;
    const choice = view.choices.find((c) =>
      c.label.toLowerCase().startsWith(color),
    );
    await settle(
      host,
      host.handle.choose(
        view.runId,
        choice.id,
        view.revision,
        `proof-${color}`,
      ),
    );
    const item = world.entities.find((e) => e.id === `${color}-seal`);
    world.observe(item);
    world.interact(item.id);
    await ticks(host);
    const beacon = world.entities.find((e) => e.acceptsItemRef === item.id);
    world.observe(beacon);
    world.interact(beacon.id);
    await ticks(host);
    assert.equal(host.view.status, 'closed');
    assert.equal(beacon.lit, true);
    assert.equal(host.executions, 5);
    branches.push({
      color,
      status: host.view.status,
      path: host.journal.runs[0].path,
      executions: host.executions,
    });
  } finally {
    host.dispose();
    world.dispose();
  }
}
const result = {
  tcp: true,
  tools: 32,
  builderSteps: 63,
  durablePublicationRecovery: true,
  durableCommandRecovery: true,
  conflictingRetryRejected: true,
  catalogueOnly: true,
  briefing: true,
  catalogue: true,
  exactPublicationReplay: true,
  authoringGameEvents: 0,
  cleanup: fixture.host.stats,
  branches,
  artifacts: dir,
};
await writeFile(
  join(dir, 'result.json'),
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result));
