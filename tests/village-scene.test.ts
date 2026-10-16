import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import type { SituationDefinition } from 'character-framework';
import { EncounterWorld } from '../examples/character-encounter/World.js';
import type { WorldSpec } from '../examples/character-encounter/World.js';
import { QuestHost } from '../examples/character-encounter/QuestHost.js';
import { contextProvider } from '../examples/quest-authoring/ContextProvider.js';
import type { AuthorContext } from '../examples/quest-authoring/ContextProvider.js';
async function fixture() {
  const base = new URL('../../examples/quest-authoring/', import.meta.url);
  const world = new EncounterWorld(
    JSON.parse(
      await readFile(new URL('village-world.json', base), 'utf8'),
    ) as WorldSpec,
  );
  const host = new QuestHost(world);
  const authored = JSON.parse(
    await readFile(new URL('village-author-context.json', base), 'utf8'),
  ) as AuthorContext;
  const adapter = contextProvider(
    world,
    host,
    authored,
    'village',
    [],
    'village-test',
  );
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await adapter.provider.call(name, args, {
      binding: {
        scope: 'village',
        providers: ['watchtower-context'],
        isCurrent: () => true,
      },
      signal: new AbortController().signal,
      headers: new Headers(),
    });
    assert.notEqual(result.isError, true);
    return result.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
  };
  return {
    world,
    host,
    call,
    async close() {
      await adapter.close();
      host.dispose();
      world.dispose();
    },
  };
}
void test('village discovery exposes real objects and neutral setting; full-height barrier has no detour', async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const briefing = await f.call('game_author_briefing', { section: 'story' });
  assert.doesNotMatch(
    briefing,
    /watchkeeper|seal|beacon|gate|well|stone|mage|enemy/i,
  );
  const people = await f.call('game_entities_list', { category: 'character' });
  for (const name of ['Mage', 'Foolish friend', 'Old woman'])
    assert.ok(people.includes(name));
  assert.match(
    await f.call('game_entities_list', { category: 'building' }),
    /House/,
  );
  assert.match(
    await f.call('game_entity_details', { ref: 'village-well' }),
    /cursed-stone → village-well/,
  );
  assert.match(
    await f.call('game_location_accessibility', { toRef: 'iron-sword' }),
    /Navigation result: unreachable/,
  );
  for (const ref of ['village-well', 'fire-pit', 'mage']) {
    assert.match(
      await f.call('game_location_accessibility', { toRef: ref }),
      /Navigation result: found/,
    );
  }
  f.world.entities.find((e) => e.id === 'iron-barrier')!.open = true;
  f.world.revision++;
  assert.match(
    await f.call('game_location_accessibility', { toRef: 'iron-sword' }),
    /Navigation result: found/,
  );
  assert.match(
    await f.call('game_location_accessibility', { toRef: 'cottage' }),
    /Navigation result: unreachable/,
  );
});
void test('village uses actual CFW consequences, custody, weapon eligibility and object inspection', async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const definition: SituationDefinition = {
    proposalVersion: 'cfw-situations-draft-2',
    id: 'village-capability-check',
    start: 'effects',
    situations: [
      {
        id: 'effects',
        routes: [
          {
            id: 'inspect-fire',
            priority: 1,
            next: 'inspect-well',
            when: {
              tool: 'entity_state',
              arguments: { entityRef: 'fire-pit', state: 'inspected' },
              expect: { path: ['count'], operator: 'at_least', value: 1 },
              evidence: { mode: 'events', after: { kind: 'run-start' } },
            },
          },
        ],
        onEnter: [
          {
            id: 'open',
            tool: 'game_open_gate',
            arguments: { entityRef: 'iron-barrier' },
          },
          {
            id: 'reveal',
            tool: 'game_activate_group',
            arguments: { groupRef: 'raiders' },
          },
          {
            id: 'activate',
            tool: 'give_item',
            arguments: { itemRef: 'bucket', fromRef: 'mage', toRef: 'player' },
          },
        ],
      },
      {
        id: 'inspect-well',
        routes: [
          {
            id: 'inspect-water',
            priority: 1,
            next: 'done',
            when: {
              tool: 'entity_state',
              arguments: { entityRef: 'village-well', state: 'inspected' },
              expect: { path: ['count'], operator: 'at_least', value: 1 },
              evidence: {
                mode: 'events',
                after: {
                  kind: 'situation-entry',
                  situationRef: 'inspect-well',
                },
              },
            },
          },
        ],
      },
      { id: 'done' },
    ],
  };
  f.world.observe(f.world.entities.find((e) => e.id === 'mage')!);
  f.host.loseNextReply();
  let settled = false;
  const started = f.host.start(definition);
  void started.finally(() => {
    settled = true;
  });
  for (let i = 0; i < 200 && !settled; i++) {
    f.host.advance(1 / 60);
    await setImmediate();
  }
  await started;
  for (let i = 0; i < 30; i++) {
    f.host.advance(1 / 60);
    await setImmediate();
  }
  assert.equal(f.host.view?.status, 'waiting');
  assert.equal(f.world.count('interaction', 'fire-pit', 0), 0);
  assert.equal(
    f.world.entities.find((e) => e.id === 'fire-pit')!.interacted,
    false,
  );
  for (const [ref, stage] of [
    ['fire-pit', 'inspect-well'],
    ['village-well', 'done'],
  ]) {
    f.world.observe(f.world.entities.find((e) => e.id === ref)!);
    assert.match(f.world.interact(ref), /inspected/);
    for (let i = 0; i < 30; i++) {
      f.host.advance(1 / 60);
      await setImmediate();
    }
    assert.equal(f.host.view?.situationId, stage);
    assert.equal(f.world.count('interaction', ref!, 0), 1);
    assert.equal(f.world.count('delivery', ref!, 0), 0);
  }
  assert.equal(f.host.view?.status, 'closed');
  assert.equal(
    f.world.entities.find((e) => e.id === 'iron-barrier')!.open,
    true,
  );
  assert.equal(
    f.world.entities.find((e) => e.id === 'bucket')!.ownerRef,
    'player',
  );
  assert.equal(f.world.count('pickup', 'bucket', 0), 1);
  assert.equal(f.host.executions, 3);
  const enemy = f.world.entities.find((e) => e.id === 'raider-one')!;
  f.world.observe(enemy);
  assert.match(f.world.interact(enemy.id), /weapon is required/);
  assert.equal(enemy.defeated, false);
  const sword = f.world.entities.find((e) => e.id === 'iron-sword')!;
  f.world.observe(sword);
  f.world.interact(sword.id);
  f.world.observe(enemy);
  assert.match(f.world.interact(enemy.id), /defeated/);
  const stone = f.world.entities.find((e) => e.id === 'cursed-stone')!;
  f.world.observe(stone);
  f.world.interact(stone.id);
  const well = f.world.entities.find((e) => e.id === 'village-well')!;
  f.world.observe(well);
  assert.equal(f.world.useItem(stone.id, well.id).applied, true);
  assert.equal(stone.deliveredTo, well.id);
  assert.doesNotMatch(f.world.interact(well.id), /delivered/);
  const statue = f.world.entities.find((e) => e.id === 'garden-statue')!;
  f.world.observe(statue);
  f.world.interact(statue.id);
  assert.equal(statue.interacted, true);
  assert.equal(f.world.count('interaction', statue.id, 0), 1);
});

void test('item rules reject atomically and preserve custody, fuel, water and finite matches', async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const w = f.world;
  const entity = (id: string) => w.entities.find((e) => e.id === id)!;
  const snapshot = () =>
    JSON.stringify({
      entities: w.entities,
      events: w.events,
      revision: w.revision,
      sequence: w.sequence,
    });
  const reject = (operation: () => { applied: boolean }) => {
    const before = snapshot();
    assert.equal(operation().applied, false);
    assert.equal(snapshot(), before);
  };
  reject(() => w.giveItem('bucket', 'mage', 'player'));
  w.observe(entity('mage'));
  assert.equal(w.giveItem('bucket', 'mage', 'player').applied, true);
  reject(() => w.giveItem('bucket', 'mage', 'player'));
  w.observe(entity('elder'));
  assert.equal(w.giveItem('matchbox', 'elder', 'player').applied, true);
  w.observe(entity('fire-pit'));
  reject(() => w.useItem('matchbox', 'fire-pit'));
  reject(() => w.useItem('bucket', 'fire-pit'));
  w.observe(entity('fallen-log'));
  w.interact('fallen-log');
  w.observe(entity('fire-pit'));
  assert.equal(w.useItem('fallen-log', 'fire-pit').applied, true);
  reject(() => w.useItem('fallen-log', 'fire-pit'));
  for (let i = 0; i < 3; i++) {
    assert.equal(w.useItem('matchbox', 'fire-pit').applied, true);
    assert.equal(entity('matchbox').usesRemaining, 2 - i);
    reject(() => w.useItem('matchbox', 'fire-pit'));
    w.observe(entity('village-well'));
    assert.equal(w.useItem('bucket', 'village-well').applied, true);
    reject(() => w.useItem('bucket', 'village-well'));
    w.observe(entity('fire-pit'));
    assert.equal(w.useItem('bucket', 'fire-pit').applied, true);
    assert.equal(entity('fire-pit').states['fueled'], true);
    assert.equal(entity('fire-pit').states['burning'], false);
  }
  reject(() => w.useItem('matchbox', 'fire-pit'));
  w.observe(entity('village-well'));
  assert.equal(w.useItem('bucket', 'village-well').applied, true);
  w.observe(entity('garden-bed'));
  assert.equal(w.useItem('bucket', 'garden-bed').applied, true);
  reject(() => w.useItem('bucket', 'garden-bed'));
  reject(() => w.useItem('iron-sword', 'garden-bed'));
  assert.equal(entity('garden-bed').states['watered'], true);
  assert.equal(entity('bucket').contents, 'empty');
  w.observe(entity('elder'));
  assert.equal(w.giveItem('bucket', 'player', 'elder').applied, true);
  assert.equal(entity('bucket').ownerRef, 'elder');
  assert.equal(
    w.carried().some((e) => e.id === 'bucket'),
    false,
  );
  w.observe({ x: 200, y: 48 });
  assert.equal(w.near({ ...entity('mage'), x: 156 }), false);
  const state = f.host.capabilities.find((c) => c.name === 'entity_state')!;
  assert.equal(
    state.validate({ entityRef: 'fire-pit', state: 'burning' }),
    true,
  );
  assert.equal(state.validate({ entityRef: 'mage', state: 'burning' }), false);
  assert.equal(
    state.validate({ entityRef: 'mage', state: 'inspected' }),
    false,
  );
  const use = f.host.capabilities.find((c) => c.name === 'use_item')!;
  assert.equal(
    use.validate({ itemRef: 'bucket', targetRef: 'village-well' }),
    true,
  );
  assert.equal(
    use.validate({ itemRef: 'iron-sword', targetRef: 'village-well' }),
    false,
  );
  for (const name of [
    'game_entity',
    'game_object',
    'game_delivery',
    'game_activate_object',
  ])
    assert.equal(
      f.host.capabilities.some((c) => c.name === name),
      false,
    );
});
void test('CFW executes item uses exactly once and advances on real state-event evidence', async (t) => {
  const f = await fixture();
  t.after(() => f.close());
  const w = f.world;
  const entity = (id: string) => w.entities.find((e) => e.id === id)!;
  w.observe(entity('elder'));
  assert.equal(w.giveItem('matchbox', 'elder', 'player').applied, true);
  w.observe(entity('fallen-log'));
  w.interact('fallen-log');
  w.observe(entity('fire-pit'));
  const definition: SituationDefinition = {
    proposalVersion: 'cfw-situations-draft-2',
    id: 'item-effect-chain',
    start: 'fuel',
    situations: [
      {
        id: 'fuel',
        onEnter: [
          {
            id: 'fuel-pit',
            tool: 'use_item',
            arguments: { itemRef: 'fallen-log', targetRef: 'fire-pit' },
          },
        ],
        routes: [
          {
            id: 'fuel-ready',
            priority: 1,
            next: 'ignite',
            when: {
              tool: 'entity_state',
              arguments: { entityRef: 'fire-pit', state: 'fueled' },
              expect: { path: ['count'], operator: 'at_least', value: 1 },
              evidence: { mode: 'events', after: { kind: 'run-start' } },
            },
          },
        ],
      },
      {
        id: 'ignite',
        onEnter: [
          {
            id: 'strike-match',
            tool: 'use_item',
            arguments: { itemRef: 'matchbox', targetRef: 'fire-pit' },
          },
        ],
        routes: [
          {
            id: 'burning',
            priority: 1,
            next: 'done',
            when: {
              tool: 'entity_state',
              arguments: { entityRef: 'fire-pit', state: 'burning' },
              expect: { path: ['count'], operator: 'at_least', value: 1 },
              evidence: {
                mode: 'events',
                after: { kind: 'situation-entry', situationRef: 'ignite' },
              },
            },
          },
        ],
      },
      { id: 'done' },
    ],
  };
  f.host.loseNextReply();
  const started = f.host.start(definition);
  let settled = false;
  void started.finally(() => {
    settled = true;
  });
  for (let i = 0; i < 200 && !settled; i++) {
    f.host.advance(1 / 60);
    await setImmediate();
  }
  await started;
  for (let i = 0; i < 60; i++) {
    f.host.advance(1 / 60);
    await setImmediate();
  }
  assert.equal(f.host.view?.status, 'closed');
  assert.equal(f.host.view?.situationId, 'done');
  assert.equal(f.host.executions, 2);
  assert.equal(entity('fallen-log').quantity, 0);
  assert.equal(entity('matchbox').usesRemaining, 2);
  assert.equal(w.count('use', 'fallen-log@fire-pit', 0), 1);
  assert.equal(w.count('state', 'fire-pit/burning', 0), 1);
});
