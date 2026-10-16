import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import type { SituationDefinition } from 'character-framework';
import { EncounterWorld } from '../examples/character-encounter/World.js';
import type { WorldSpec } from '../examples/character-encounter/World.js';
import { QuestHost } from '../examples/character-encounter/QuestHost.js';
import { QuestChat } from '../examples/character-encounter/QuestChat.js';
import { GridTraversal, DirectMovement } from '../src/navigation/index.js';
async function fixture(prior = false) {
  const base = new URL('../../examples/character-encounter/', import.meta.url);
  const world = new EncounterWorld(
    JSON.parse(
      await readFile(new URL('world.json', base), 'utf8'),
    ) as WorldSpec,
    prior,
  );
  const definition = JSON.parse(
    await readFile(new URL('quest.json', base), 'utf8'),
  ) as SituationDefinition;
  const host = new QuestHost(world);
  return { world, host, definition };
}
async function ticks(host: QuestHost, n = 30) {
  for (let i = 0; i < n; i++) {
    host.advance(1 / 60);
    await setImmediate();
  }
}
async function boot(host: QuestHost, definition: SituationDefinition) {
  let done = false;
  const promise = host.start(definition);
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
async function choose(host: QuestHost, id: string) {
  const view = host.view!;
  let done = false;
  const command = host.handle.choose(
    view.runId,
    view.choices.find((c) => c.label.toLowerCase().startsWith(id))!.id,
    view.revision,
    'test-choice:' + id,
  );
  void command.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  for (let i = 0; i < 200 && !done; i++) await ticks(host, 1);
  assert.ok(done);
  await command;
  await ticks(host);
}
async function clear(world: EncounterWorld, host: QuestHost) {
  world.observe({ x: 208, y: 208 });
  await ticks(host);
  assert.equal(host.view?.situationId, 'encounter');
  for (const e of world.entities.filter((e) => e.kind === 'enemy')) {
    world.observe(e);
    assert.match(world.interact(e.id), /defeated/);
    await ticks(host);
  }
  assert.equal(host.view?.situationId, 'watchkeeper');
}
void test('authored quest handles actual new defeats, guide consequence, item pickup, gate passage and beacon', async (t) => {
  const { world, host, definition } = await fixture();
  t.after(() => {
    host.dispose();
    world.dispose();
  });
  await boot(host, definition);
  assert.equal(host.view?.situationId, 'approach');
  assert.equal(world.entities.find((e) => e.id === 'guide')!.visible, false);
  assert.equal(world.interact('sentry-a').includes('defeated'), false);
  await clear(world, host);
  assert.equal(world.entities.find((e) => e.id === 'guide')!.visible, true);
  assert.equal(world.entities.find((e) => e.kind === 'gate')!.open, true);
  world.observe({ x: 448, y: 208 });
  await ticks(host);
  await choose(host, 'blue');
  assert.equal(host.view?.situationId, 'blue-pickup');
  assert.equal(world.entities.find((e) => e.id === 'blue-seal')!.visible, true);
  assert.equal(world.interact('blue-seal').includes('collected'), false);
  world.observe({ x: 528, y: 208 });
  assert.match(world.interact('blue-seal'), /collected/);
  await ticks(host);
  assert.equal(host.view?.situationId, 'blue-delivery');
  world.observe({ x: 688, y: 304 });
  assert.match(world.interact('beacon-b'), /matching carried seal/);
  await ticks(host);
  assert.equal(host.view?.situationId, 'blue-delivery');
  world.observe({ x: 688, y: 112 });
  assert.match(world.interact('beacon-a'), /delivered/);
  await ticks(host);
  assert.equal(host.view?.status, 'closed');
  assert.equal(world.entities.find((e) => e.id === 'beacon-a')!.lit, true);
  const path = host.journal!.runs[0]!.path;
  assert.deepEqual(path, [
    'approach',
    'encounter',
    'watchkeeper',
    'offer',
    'blue-router',
    'blue-pickup',
    'blue-delivery',
    'blue-complete',
  ]);
  assert.equal(host.executions, 5);
});
void test('prior item fact selects authored shortcut without revealing or granting a duplicate', async (t) => {
  const { world, host, definition } = await fixture(true);
  t.after(() => host.dispose());
  await boot(host, definition);
  await clear(world, host);
  world.observe({ x: 448, y: 208 });
  await ticks(host);
  await choose(host, 'blue');
  assert.equal(host.view?.situationId, 'blue-delivery');
  assert.equal(
    world.entities.find((e) => e.id === 'blue-seal')!.visible,
    false,
  );
  assert.ok(!host.journal!.runs[0]!.path.includes('blue-pickup'));
  assert.equal(host.executions, 3);
  world.observe({ x: 688, y: 112 });
  assert.match(world.interact('beacon-a'), /delivered/);
  await ticks(host);
  assert.equal(host.view?.status, 'closed');
});
void test('unavailable defeat history blocks; restoration retains cuts; lost consequence ack reconciles exactly once', async (t) => {
  const { world, host, definition } = await fixture();
  t.after(() => host.dispose());
  await boot(host, definition);
  world.observe({ x: 208, y: 208 });
  await ticks(host);
  const original = structuredClone(host.journal!.runs[0]!.cursors);
  world.historyAvailable = false;
  world.revision++;
  for (const e of world.entities.filter((e) => e.kind === 'enemy')) {
    world.observe(e);
    world.interact(e.id);
  }
  await ticks(host);
  assert.equal(host.view?.situationId, 'encounter');
  assert.equal(host.view?.status, 'blocked');
  host.loseNextReply();
  world.historyAvailable = true;
  world.revision++;
  await ticks(host, 60);
  assert.equal(host.view?.situationId, 'watchkeeper');
  assert.equal(host.executions, 3);
  for (const c of original)
    assert.deepEqual(
      host.journal!.runs[0]!.cursors.find((v) => v.effectId === c.effectId)
        ?.cursor,
      c.cursor,
    );
});
void test('JSON alone changes consequence target; invalid references rejected before gameplay effects', async (t) => {
  const { world, host, definition } = await fixture();
  t.after(() => host.dispose());
  const edited = structuredClone(definition);
  const terminal = edited.situations.find((s) => s.id === 'blue-complete')!;
  const altered = {
    ...edited,
    situations: edited.situations.map((s) =>
      s === terminal
        ? {
            ...s,
            onEnter: [
              {
                id: 'show-guide-again',
                tool: 'game_reveal',
                arguments: { entityRef: 'guide' },
              },
            ],
          }
        : s,
    ),
  };
  await boot(host, altered);
  await clear(world, host);
  world.observe({ x: 448, y: 208 });
  await ticks(host);
  await choose(host, 'blue');
  world.observe({ x: 528, y: 208 });
  world.interact('blue-seal');
  await ticks(host);
  world.observe({ x: 688, y: 112 });
  assert.match(world.interact('beacon-a'), /delivered/);
  await ticks(host);
  assert.equal(host.view?.status, 'closed');
  assert.equal(world.entities.find((e) => e.id === 'beacon-a')!.lit, false);
  const other = await fixture();
  t.after(() => other.host.dispose());
  const invalid = {
    ...other.definition,
    situations: other.definition.situations.map((s) =>
      s.id === 'blue-complete'
        ? {
            ...s,
            onEnter: [
              {
                id: 'bad',
                tool: 'game_light_beacon',
                arguments: { entityRef: 'invented' },
              },
            ],
          }
        : s,
    ),
  };
  await assert.rejects(boot(other.host, invalid));
  assert.equal(other.host.executions, 0);
});
void test('real navigation blocks a closed game gate and allows passage after authored consequence; disposal rejects late boot', async (t) => {
  const { world, host, definition } = await fixture();
  t.after(() => host.dispose());
  const grid = new GridTraversal(
    { minX: 0, minY: 0, columns: 24, rows: 13, tileSize: 32 },
    () => ({ status: 'passable', cost: 1 }),
    () => world.revision,
    () =>
      world.entities
        .filter((e) => e.kind === 'gate' && !e.open)
        .map((e) => ({
          id: e.id,
          bounds: {
            minX: e.x - 12,
            minY: e.y - 64,
            maxX: e.x + 12,
            maxY: e.y + 64,
          },
        })),
  );
  const movement = new DirectMovement(
    grid,
    { x: 568, y: 208 },
    { radius: 8, clearance: 1, capabilities: ['walk'] },
  );
  t.after(() => movement.dispose());
  assert.equal(movement.update(1, { x: 1, y: 0 }, 80), 'blocked');
  await boot(host, definition);
  await clear(world, host);
  assert.equal(movement.update(1, { x: 1, y: 0 }, 80), 'moved');
  const other = await fixture();
  const pending = other.host.start(other.definition);
  const rejected = assert.rejects(pending, /disposed/i);
  other.host.dispose();
  other.world.dispose();
  await rejected;
  assert.throws(() => other.host.advance(1 / 60), /disposed/i);
});
void test('prior courtyard entry cannot start an event quest; dialogue fields are optional', async (t) => {
  const { world, host, definition } = await fixture();
  t.after(() => host.dispose());
  world.observe({ x: 208, y: 208 });
  const silent = {
    ...definition,
    situations: definition.situations.map((s) => {
      const { dialogue: _text, ...rest } = s;
      void _text;
      return rest;
    }),
  };
  await boot(host, silent);
  assert.equal(host.view?.situationId, 'approach');
  assert.equal(host.view?.dialogue, null);
  assert.equal(host.executions, 0);
  world.observe({ x: 80, y: 208 });
  await clear(world, host);
  world.observe({ x: 448, y: 208 });
  await ticks(host);
  await choose(host, 'blue');
  world.observe({ x: 528, y: 208 });
  world.interact('blue-seal');
  await ticks(host);
  world.observe({ x: 688, y: 112 });
  assert.match(world.interact('beacon-a'), /delivered/);
  await ticks(host);
  assert.equal(host.view?.status, 'closed');
  assert.equal(host.view?.dialogue, null);
});
void test('red choice reveals only red; wrong destination and mere arrival cannot complete; matching delivery lights only B', async (t) => {
  const { world, host, definition } = await fixture();
  t.after(() => host.dispose());
  await boot(host, definition);
  await clear(world, host);
  world.observe({ x: 448, y: 208 });
  await ticks(host);
  assert.equal(host.view?.situationId, 'offer');
  assert.equal(host.view!.choices.length, 2);
  await choose(host, 'red');
  assert.equal(host.view?.situationId, 'red-pickup');
  assert.equal(
    world.entities.find((e) => e.id === 'blue-seal')!.visible,
    false,
  );
  assert.equal(world.entities.find((e) => e.id === 'red-seal')!.visible, true);
  world.observe({ x: 528, y: 240 });
  assert.match(world.interact('red-seal'), /collected/);
  await ticks(host);
  world.observe({ x: 688, y: 112 });
  assert.match(world.interact('beacon-a'), /matching carried seal/);
  await ticks(host);
  assert.equal(host.view?.situationId, 'red-delivery');
  assert.equal(host.view?.status, 'waiting');
  world.observe({ x: 688, y: 304 });
  await ticks(host);
  assert.equal(
    host.view?.status,
    'waiting',
    'arrival without delivery is insufficient',
  );
  assert.match(world.interact('beacon-b'), /delivered/);
  assert.match(world.interact('beacon-b'), /matching carried seal/);
  await ticks(host);
  assert.equal(host.view?.situationId, 'red-complete');
  assert.equal(host.view?.status, 'closed');
  assert.equal(world.entities.find((e) => e.id === 'beacon-a')!.lit, false);
  assert.equal(world.entities.find((e) => e.id === 'beacon-b')!.lit, true);
  assert.equal(world.count('delivery', 'red-seal@beacon-b', 0), 1);
});

void test('dialogue port retries the original rejected choice and stop-waiting blocks a second branch', async (t) => {
  const { world, host, definition } = await fixture();
  const chat = new QuestChat(host);
  t.after(() => {
    chat.dispose();
    host.dispose();
  });
  await boot(host, definition);
  await clear(world, host);
  world.observe({ x: 448, y: 208 });
  await ticks(host);
  chat.refresh();
  const choice = chat.read().choices.find((c) => c.text.startsWith('Red'))!;
  // Simulate a stale visible button: admission must re-check actual game proximity.
  world.observe({ x: 80, y: 208 });
  chat.dispatch({
    kind: 'choose',
    sessionId: chat.sessionId,
    requestId: 'original-red',
    choiceId: choice.id,
  });
  await ticks(host);
  chat.refresh();
  assert.equal(chat.read().error?.requestId, 'original-red');
  assert.equal(host.view?.situationId, 'offer');
  world.observe({ x: 448, y: 208 });
  await ticks(host);
  chat.refresh();
  chat.dispatch({
    kind: 'retry',
    sessionId: chat.sessionId,
    requestId: 'retry-ui',
    failedRequestId: 'original-red',
  });
  assert.equal(chat.read().pending?.requestId, 'original-red');
  chat.dispatch({
    kind: 'cancel',
    sessionId: chat.sessionId,
    requestId: 'cancel-ui',
    pendingRequestId: 'original-red',
  });
  assert.equal(chat.read().pending, null);
  assert.equal(chat.read().choices.length, 0);
  await ticks(host);
  chat.refresh();
  assert.equal(host.view?.situationId, 'red-pickup');
  assert.equal(chat.read().error, null);
  chat.dispose();
  chat.dispatch({
    kind: 'choose',
    sessionId: chat.sessionId,
    requestId: 'late',
    choiceId: choice.id,
  });
  assert.deepEqual(chat.read().actions, []);
});

for (const [color, destination, y, otherColor, otherDestination, otherY] of [
  ['blue', 'beacon-a', 112, 'red', 'beacon-b', 304],
  ['red', 'beacon-b', 304, 'blue', 'beacon-a', 112],
] as const) {
  void test(`${color}: matching delivery before watchkeeper choice completes without a second delivery`, async (t) => {
    const { world, host, definition } = await fixture(true);
    t.after(() => {
      host.dispose();
      world.dispose();
    });
    await boot(host, definition);
    await clear(world, host);
    world.observe({ x: 688, y });
    assert.match(world.interact(destination), /delivered/);
    await ticks(host);
    assert.equal(host.view?.situationId, 'watchkeeper');
    assert.equal(world.entities.find((e) => e.id === destination)!.lit, false);
    world.observe({ x: 448, y: 208 });
    await ticks(host);
    await choose(host, color);
    assert.equal(host.view?.situationId, `${color}-complete`);
    assert.equal(host.view?.status, 'closed');
    assert.equal(world.entities.find((e) => e.id === destination)!.lit, true);
    assert.equal(
      world.entities.find((e) => e.id === otherDestination)!.lit,
      false,
    );
    assert.equal(
      world.entities.find((e) => e.id === `${color}-seal`)!.deliveredTo,
      destination,
    );
    assert.equal(world.count('delivery', `${color}-seal@${destination}`, 0), 1);
    assert.ok(!host.journal!.runs[0]!.path.includes(`${color}-pickup`));
    world.observe({ x: 688, y });
    assert.match(world.interact(destination), /matching carried seal/);
    await ticks(host);
    assert.equal(world.count('delivery', `${color}-seal@${destination}`, 0), 1);
    assert.equal(
      host.executions,
      4,
      'one terminal consequence, no replacement pickup',
    );
  });
  void test(`${color}: another seal's early delivery and mere arrival do not satisfy the selected branch`, async (t) => {
    const { world, host, definition } = await fixture(true);
    t.after(() => {
      host.dispose();
      world.dispose();
    });
    await boot(host, definition);
    await clear(world, host);
    world.observe({ x: 688, y: otherY });
    assert.match(world.interact(otherDestination), /delivered/);
    await ticks(host);
    world.observe({ x: 448, y: 208 });
    await ticks(host);
    await choose(host, color);
    assert.equal(host.view?.situationId, `${color}-delivery`);
    assert.equal(host.view?.status, 'waiting');
    world.observe({ x: 688, y });
    await ticks(host);
    assert.equal(host.view?.status, 'waiting');
    assert.equal(world.entities.find((e) => e.id === destination)!.lit, false);
    assert.match(world.interact(destination), /delivered/);
    await ticks(host);
    assert.equal(host.view?.status, 'closed');
    assert.equal(world.entities.find((e) => e.id === destination)!.lit, true);
    assert.equal(
      world.entities.find((e) => e.id === otherDestination)!.lit,
      false,
    );
    assert.equal(
      world.count('delivery', `${otherColor}-seal@${otherDestination}`, 0),
      1,
    );
  });
}
