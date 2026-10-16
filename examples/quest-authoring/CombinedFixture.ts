import { randomUUID } from 'node:crypto';
import { CharacterRuntime } from 'cfw-authoring-candidate';
import type { Json } from 'cfw-authoring-candidate';
import { CfwMcpProvider } from 'cfw-authoring-candidate/mcp';
import { QuestBuilderAuthoring } from 'cfw-authoring-candidate/authoring-prototype';
import { Rocket } from '../../src/Rocket.js';
import { McpService } from '../../src/mcp/index.js';
import { QuestHost } from '../character-encounter/QuestHost.js';
import type { EncounterWorld } from '../character-encounter/World.js';
import { contextProvider } from './ContextProvider.js';
import type { AuthorContext } from './ContextProvider.js';
const referenceBindings = {
  inventory_item: [{ path: ['itemRef'], category: 'item' }],
  entity_state: [{ path: ['entityRef'], category: 'entity' }],
  give_item: [
    { path: ['itemRef'], category: 'item' },
    { path: ['fromRef'], category: 'holder' },
    { path: ['toRef'], category: 'holder' },
  ],
  use_item: [
    { path: ['itemRef'], category: 'item' },
    { path: ['targetRef'], category: 'use-target' },
  ],
  game_location: [{ path: ['locationRef'], category: 'location' }],
  game_encounter: [{ path: ['groupRef'], category: 'group' }],
  game_entity: [{ path: ['entityRef'], category: 'entity' }],
  game_activate_group: [{ path: ['groupRef'], category: 'group' }],
  game_reveal: [{ path: ['entityRef'], category: 'entity' }],
  game_open_gate: [{ path: ['entityRef'], category: 'gate' }],
  game_light_beacon: [{ path: ['entityRef'], category: 'beacon' }],
  game_object: [{ path: ['entityRef'], category: 'object' }],
  game_activate_object: [{ path: ['entityRef'], category: 'object' }],
  game_delivery: [
    { path: ['itemRef'], category: 'item' },
    { path: ['destinationRef'], category: 'destination' },
  ],
};
/** One application-owned world, actual game capability declarations, optional CFW authoring provider. */
export function combinedFixture(options: {
  world: EncounterWorld;
  authorContext: AuthorContext;
  path: string;
  credential: string;
  port: number;
  sessionId?: string;
  characterId?: string;
  privateHost?: string;
}) {
  const { world } = options;
  const game = new QuestHost(world);
  const references = {
    holder: [
      'player',
      ...world.entities.filter((e) => e.kind === 'guide').map((e) => e.id),
    ],
    'use-target': [
      ...new Set(world.spec.itemUses?.map((r) => r.targetRef) ?? []),
    ],
    location: world.spec.locations.map((l) => l.id),
    entity: world.entities.map((e) => e.id),
    group: [
      ...new Set(
        world.entities.filter((e) => e.kind === 'enemy').map((e) => e.group),
      ),
    ],
    item: world.entities.filter((e) => e.kind === 'item').map((e) => e.id),
    gate: world.entities.filter((e) => e.kind === 'gate').map((e) => e.id),
    beacon: world.entities.filter((e) => e.kind === 'beacon').map((e) => e.id),
    destination: world.entities
      .filter((e) => e.kind === 'beacon' || e.kind === 'destination')
      .map((e) => e.id),
    object: world.entities
      .filter((e) => e.kind === 'prop' || e.kind === 'destination')
      .map((e) => e.id),
  };
  const author = new QuestBuilderAuthoring({
    path: options.path,
    authorId: 'watchtower-author',
    authorize: (c) => c.character.id === 'author',
    capabilities: game.capabilities,
    references,
    referenceBindings,
  });
  const runtime = new CharacterRuntime({
    gameId: 'rocket-encounter',
    capabilities: author.tools,
  });
  const handle = runtime.register({
    id: 'author',
    name: 'Quest author',
    binding: { id: 'watchtower-author', generation: 'fixture-one' },
    cai: {
      characterId: options.characterId ?? 'watchtower-author',
      sessionId: options.sessionId ?? 'watchtower-author-session',
    },
    capabilities: author.tools.map((t) => t.name),
  });
  const provider = new CfwMcpProvider({ runtime });
  const headers = provider.bind('watchtower-author', handle, author.tools, [
    'cfw',
    'watchtower-context',
  ]);
  const binding = provider.resolveBinding(
    new Request('http://127.0.0.1/mcp', { headers }),
  );
  if (!binding) throw new Error('Author binding unavailable');
  const context = contextProvider(
    world,
    game,
    options.authorContext,
    binding.scope,
    provider.tools(binding),
    randomUUID(),
    (name, args) =>
      author.tools.find((tool) => tool.name === name)?.validate(args as Json) ??
      false,
  );
  const app = new Rocket();
  const host = app.use(McpService).configure({
    credential: options.credential,
    allowedHosts: [
      `127.0.0.1:${options.port}`,
      ...(options.privateHost
        ? [`${options.privateHost}:${options.port}`]
        : []),
    ],
    resolveBinding: (request) => provider.resolveBinding(request),
  });
  host.register(provider);
  host.register(context.provider);
  return {
    host,
    provider,
    author,
    game,
    world,
    headers,
    context,
    drain() {
      runtime.advance(0);
      provider.advance(0);
    },
    async close() {
      await app.dispose();
      await host.close();
      provider.dispose();
      runtime.dispose();
      await author.close();
      await context.close();
      game.dispose();
      world.dispose();
    },
  };
}
