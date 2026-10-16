import { showAuthoringExample } from './AuthoringExample.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { McpBinding, McpProvider } from '../../src/mcp/contracts.js';
import type { Point } from '../../src/types.js';
import { GridNavigator, GridTraversal } from '../../src/navigation/index.js';
import { Journal, MemoryJournalStore } from '../../src/journal/index.js';
import { journalProvider } from '../../src/journal/mcp.js';
import type { QuestHost } from '../character-encounter/QuestHost.js';
import type { EncounterWorld } from '../character-encounter/World.js';
export interface AuthorContext {
  readonly identity: string;
  readonly setting: string;
  readonly story: string;
  readonly assignment: string;
  readonly mechanics: string;
  readonly vocabulary: Readonly<Record<string, string>>;
  readonly knownEntityRefs: readonly string[];
  readonly knownLocationRefs: readonly string[];
  readonly knowledgeDescription: string;
}
const sections = [
  'all',
  'identity',
  'setting',
  'story',
  'assignment',
  'mechanics',
  'vocabulary',
  'context_tools',
  'authoring',
] as const;
const categories = [
  'all',
  'character',
  'item',
  'gate',
  'beacon',
  'destination',
  'prop',
  'location',
  'spawn_location',
  'building',
] as const;
const knowledge = ['all', 'known', 'unknown'] as const;
const hints = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};
const objectSchema = (
  properties: Record<string, object>,
  required: string[] = [],
) => ({
  type: 'object' as const,
  properties,
  required,
  additionalProperties: false,
});
const string = { type: 'string', minLength: 1, maxLength: 160 };
const enumeration = (values: readonly string[]) => ({
  type: 'string',
  enum: [...values],
});
function tool(
  name: string,
  description: string,
  properties: Record<string, object>,
  required: string[] = [],
): Tool {
  return {
    name,
    description,
    inputSchema: objectSchema(properties, required),
    annotations: hints,
  };
}
const queryTools = [
  tool(
    'show_authoring_example',
    'Show an explained tool-call chain for a branching watchtower quest, followed by the resulting Mermaid diagram. Default chain shows every recorded call with an explanation and the final Mermaid. Section steps pages the chain; diagram returns its final Mermaid. Never returns resulting quest JSON.',
    {
      section: enumeration(['chain', 'steps', 'diagram']),
      start: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 8 },
    },
  ),
  tool(
    'game_author_briefing',
    'Read the game-owned plain-text author introduction in narrative order, or one section. Vocabulary uses executable game identifiers; native discovery remains parameter authority.',
    { section: enumeration(sections) },
  ),
  tool(
    'game_entities_list',
    'List author-visible records, filtered by category and explicit protagonist knowledge. Unknown-to-protagonist is not unknown-to-author. Empty categories are reported, never invented. offset/limit paginate this current revision; pass expectedRevision to reject changed pages.',
    {
      category: enumeration(categories),
      knowledge: enumeration(knowledge),
      offset: { type: 'integer', minimum: 0, maximum: 4096 },
      limit: { type: 'integer', minimum: 1, maximum: 50 },
      expectedRevision: { type: 'integer', minimum: 0 },
    },
  ),
  tool(
    'game_entity_details',
    'Inspect one exact entity, location or spawn reference. Shows explicit knowledge, actual state and provenance; does not invent motives or relationships.',
    { ref: string },
    ['ref'],
  ),
  tool(
    'game_location_accessibility',
    'Check a target reference or map coordinate from the protagonist using existing bounded navigation and current gate collision geometry. Location references target their centre; pass a point for another entrance. No simulation or movement.',
    { toRef: string, x: { type: 'number' }, y: { type: 'number' } },
  ),
  tool(
    'game_distance',
    'Measure Euclidean or bounded navigable-route distance in canvas pixels. Default origin is the protagonist; optional fromRef. Location references mean their centre, not their nearest boundary. Unreachable is not a finite travel distance.',
    {
      fromRef: string,
      toRef: string,
      metric: enumeration(['euclidean', 'route']),
    },
    ['toRef'],
  ),
];
type Entry = {
  ref: string;
  label: string;
  category: string;
  point: Point;
  known: boolean;
  detail: string;
};
const fixed = (n: number) => Number(n.toFixed(2));
const line = (e: Entry) =>
  `${e.ref} — ${e.label}; ${e.category}; ${e.known ? 'known' : 'unknown'} to protagonist; (${e.point.x}, ${e.point.y}).`;
const plain = (value: unknown, depth = 0): string => {
  const pad = '  '.repeat(depth);
  if (value === null) return 'none';
  if (Array.isArray(value))
    return value.length
      ? '\n' + value.map((v) => pad + '- ' + plain(v, depth + 1)).join('\n')
      : 'none';
  if (typeof value === 'object')
    return (
      '\n' +
      Object.entries(value)
        .map(([key, v]) => `${pad}${key}: ${plain(v, depth + 1)}`)
        .join('\n')
    );
  return String(value);
};
/** Watchtower application adapter, never an engine-owned world/knowledge model. */
export function contextProvider(
  world: EncounterWorld,
  game: QuestHost,
  authored: AuthorContext,
  scope: string,
  authoringTools: readonly Tool[],
  timelineId: string,
  validateAuthoringInput: (
    name: string,
    args: Readonly<Record<string, unknown>>,
  ) => boolean = () => false,
) {
  const description = structuredClone(authored);
  const actual = game.capabilities.map((c) => c.name).sort();
  if (
    actual.join('\n') !== Object.keys(description.vocabulary).sort().join('\n')
  )
    throw new Error(
      'Vocabulary must exactly match supported game capabilities',
    );
  for (const text of [
    description.identity,
    description.setting,
    description.story,
    description.assignment,
    description.mechanics,
    description.knowledgeDescription,
    ...Object.values(description.vocabulary),
  ])
    if (typeof text !== 'string' || !text.trim() || text.length > 4096)
      throw new Error('Invalid author context description');
  if (
    description.knownEntityRefs.some(
      (ref) => !world.entities.some((e) => e.id === ref),
    ) ||
    description.knownLocationRefs.some(
      (ref) => !world.spec.locations.some((e) => e.id === ref),
    )
  )
    throw new Error('Unknown protagonist knowledge reference');
  const knownEntities = new Set(description.knownEntityRefs),
    knownLocations = new Set(description.knownLocationRefs);
  const store = new MemoryJournalStore({
    gameId: 'rocket-encounter',
    saveId: 'authoring-fixture',
    timelineId,
  });
  const journal = new Journal().configure(store);
  const producer = journal.registerProducer('watchtower-game', {
    'watchtower.world_event': {
      version: 1,
      validate: (v) =>
        !!v &&
        typeof v === 'object' &&
        !Array.isArray(v) &&
        typeof v['kind'] === 'string',
    },
  });
  let recordedThrough = 0,
    capturedRevision = -1,
    gap = false,
    disposed = false;
  const statusHandles = [
    journal.registerStatus('world', () => ({
      revision: world.revision,
      recordedThrough,
      availability:
        gap || !world.historyAvailable || !world.historyComplete
          ? 'unavailable'
          : capturedRevision === world.revision
            ? 'available'
            : 'stale',
      data: {
        position: { ...world.position },
        events: world.sequence,
        context: 'Independent authoring fixture; not the browser session.',
      },
    })),
    journal.registerStatus('quests', () => ({
      revision: game.view?.revision ?? 0,
      recordedThrough,
      availability: 'available',
      data: {
        activeRun: game.view?.runId ?? null,
        status: game.view?.status ?? 'none',
        note: 'Published authoring drafts are not gameplay runs.',
      },
    })),
  ];
  const allowed = (binding: McpBinding) =>
    !disposed &&
    binding.scope === scope &&
    binding.providers.includes('watchtower-context') &&
    binding.isCurrent();
  const reader = journalProvider(journal, (s) =>
    s === scope ? journal.identity : null,
  );
  const domain = { minX: 0, minY: 0, columns: 24, rows: 13, tileSize: 32 };
  const actor = { radius: 8, clearance: 1, capabilities: [] };
  const traversal = new GridTraversal(
    domain,
    () => ({ status: 'passable', cost: 1 }),
    () => world.revision,
    () => world.blockers(),
  );
  const navigator = new GridNavigator(traversal, domain);
  function entries(): Entry[] {
    return [
      {
        ref: 'player',
        label: 'Protagonist',
        category: 'character',
        point: { ...world.position },
        known: true,
        detail:
          'Player-controlled protagonist. Motives and relationships are not authored in this fixture.',
      },
      ...world.entities.map((e) => ({
        ref: e.id,
        label: e.label,
        category:
          e.kind === 'enemy' || e.kind === 'guide' ? 'character' : e.kind,
        point: { x: e.x, y: e.y },
        known: knownEntities.has(e.id),
        detail: `Kind: ${e.kind}. Group: ${e.group}. Visible: ${e.visible}. Defeated: ${e.defeated}. Collected: ${e.collected}. Open: ${e.open}. Lit: ${e.lit}. Delivered to: ${e.deliveredTo ?? 'none'}.${e.acceptsItemRef ? ' Accepts item: ' + e.acceptsItemRef + '.' : ''}${e.acceptsItemRefs ? ' Accepts items: ' + e.acceptsItemRefs.join(', ') + '.' : ''}${e.requiresItemRef ? ' Required carried item: ' + e.requiresItemRef + '.' : ''} Holder: ${e.ownerRef ?? 'none'}. Quantity: ${e.quantity}. Contents: ${e.contents ?? 'none'}. Uses remaining: ${e.usesRemaining ?? 'unlimited'}. States: ${
          Object.entries(e.states)
            .map(([k, v]) => k + ' = ' + v)
            .join(', ') || 'none'
        }. Item-use rules: ${
          world.spec.itemUses
            ?.filter((r) => r.itemRef === e.id || r.targetRef === e.id)
            .map(
              (r) =>
                r.itemRef +
                ' → ' +
                r.targetRef +
                '; requires ' +
                [
                  r.requiresContents ? 'contents ' + r.requiresContents : '',
                  ...Object.entries(r.requiresStates ?? {}).map(
                    ([k, v]) => k + ' = ' + v,
                  ),
                  r.usesMatch ? 'one remaining match' : '',
                ]
                  .filter(Boolean)
                  .join(', ') +
                '; effects ' +
                [
                  r.setsContents ? 'contents ' + r.setsContents : '',
                  ...Object.entries(r.setsStates ?? {}).map(
                    ([k, v]) => k + ' = ' + v,
                  ),
                  r.consumesItem ? 'item consumed' : '',
                  r.usesMatch ? 'one match consumed' : '',
                ]
                  .filter(Boolean)
                  .join(', '),
            )
            .join(' | ') || 'none'
        }. Active: ${e.active}. Inspected: ${e.interacted}. ${e.description ?? 'No further description authored.'}`,
      })),
      ...world.spec.locations.map((e) => ({
        ref: e.id,
        label: e.label,
        category: 'location',
        point: {
          x: (e.bounds.minX + e.bounds.maxX) / 2,
          y: (e.bounds.minY + e.bounds.maxY) / 2,
        },
        known: knownLocations.has(e.id),
        detail: `Bounds: (${e.bounds.minX}, ${e.bounds.minY}) to (${e.bounds.maxX}, ${e.bounds.maxY}). Visited: ${world.visited.has(e.id)}. Inside: ${world.inside.has(e.id)}. Position is the location centre.`,
      })),
      {
        ref: 'spawn:player',
        label: 'Player spawn',
        category: 'spawn_location',
        point: { ...world.spec.spawn },
        known: true,
        detail:
          'Application-authored player spawn. Context reference only; not an entityRef in quest JSON. This spawn is a context reference, not an executable entity.',
      },
    ];
  }
  function find(ref: unknown): Entry {
    if (typeof ref !== 'string') throw new Error('Expected reference string');
    const entry = entries().find((e) => e.ref === ref);
    if (!entry) throw new Error('Unknown reference: ' + ref);
    return entry;
  }
  function briefing(section: string, binding: McpBinding): string {
    const tools = [...queryTools, ...reader.tools(binding)];
    const parts: Record<string, string> = {
      identity: 'GAME TYPE\n' + description.identity,
      setting: 'SETTING\n' + description.setting,
      story: 'STORY AND CONTEXT\n' + description.story,
      assignment: 'YOUR ASSIGNMENT\n' + description.assignment,
      mechanics: 'GAME MECHANICS\n' + description.mechanics,
      vocabulary:
        'SUPPORTED GAME PRIMITIVES\n' +
        game.capabilities
          .map(
            (c) => `- ${c.name} (${c.kind}): ${description.vocabulary[c.name]}`,
          )
          .join('\n'),
      context_tools:
        'BEFORE AUTHORING\nYou must gather context before creating a quest. You can:\n- Review confirmed game events (game_journal_read).\n- Inspect current world and quest status (game_status_read).\n- List characters, items, locations, spawn locations and buildings, filtering known/unknown to the protagonist (game_entities_list).\n- Read details of an exact reference (game_entity_details).\n- Verify map accessibility (game_location_accessibility).\n- Calculate straight-line or navigable-route distances (game_distance).\n- Read executable capability schemas (read_quest_draft, section catalogue).\nSee your native MCP tools for parameters and further instructions.\n' +
        description.knowledgeDescription +
        '\nThese tools inspect this independent authoring fixture, not the browser world. Journal storage is volatile and initially empty; empty history is not a prior adventure.',
      authoring:
        'HOW TO AUTHOR\nBuild stages, dialogue, fact/event conditions, transitions, choices, objectives and ordered entry consequences. Inspect and revise the draft, review findings, then publish. Use returned IDs and the latest revisions for each edit. Publication does not activate gameplay.\nFor a usage example of the authoring tools, use your tool: show_authoring_example.\nAvailable authoring tools:\n' +
        authoringTools
          .map(
            (t) =>
              `- ${t.name}: ${t.description ?? 'No description supplied by native discovery.'}`,
          )
          .join('\n') +
        '\nNative MCP discovery supplies detailed descriptions and parameters.',
    };
    // Only expose pointers to tools actually present in this binding.
    if (tools.length !== 8)
      throw new Error('Incomplete author context binding');
    return section === 'all'
      ? Object.values(parts).join('\n\n')
      : parts[section]!;
  }
  const provider: McpProvider = {
    id: 'watchtower-context',
    tools: (binding) =>
      allowed(binding) ? [...queryTools, ...reader.tools(binding)] : [],
    async call(name, args, context) {
      try {
        world.live();
        if (!allowed(context.binding) || context.signal.aborted)
          throw new Error('Context binding expired or not granted');
        let text: string;
        if (name === 'game_journal_read' || name === 'game_status_read') {
          try {
            if (!world.historyAvailable || !world.historyComplete)
              throw new Error(
                'World history unavailable; cannot certify reporting',
              );
            const observedRevision = world.revision;
            const events = [...world.events];
            for (const e of events)
              await producer.append({
                eventId: 'world:' + e.sequence,
                type: 'watchtower.world_event',
                version: 1,
                subjectRefs: [e.ref],
                payload: {
                  kind: e.kind,
                  ref: e.ref,
                  worldSequence: e.sequence,
                },
              });
            recordedThrough = await journal.head();
            capturedRevision = observedRevision;
            gap = false;
          } catch (error) {
            gap = true;
            if (name === 'game_journal_read') throw error;
          }
          const result = await reader.call(name, args, context);
          if (result.isError)
            throw new Error(
              plain(result.structuredContent ?? 'Journal read failed'),
            );
          const structured = result.structuredContent as {
            data: Record<string, unknown>;
          };
          const data = structured.data;
          if (name === 'game_journal_read') {
            const empty =
              Array.isArray(data['events']) && !data['events'].length;
            const query = Object.keys(args).length
              ? plain(args)
              : 'default unfiltered window';
            const message = empty
              ? data['head'] === 0
                ? 'No confirmed events are recorded in this authoring fixture at this window head.'
                : 'No events match this query/window.'
              : '';
            text = `GAME JOURNAL\nQuery: ${query}\n${plain(data)}\n${message}\nStorage: volatile. This is not the browser journal.`;
          } else text = `CURRENT GAME STATUS\n${plain(data)}`;
        } else {
          const selected = queryTools.find((t) => t.name === name);
          if (!selected) throw new Error('Unknown context tool');
          const keys = Object.keys(selected.inputSchema.properties ?? {});
          if (Object.keys(args).some((k) => !keys.includes(k)))
            throw new Error('Unexpected argument');
          if (name === 'show_authoring_example') {
            text = await showAuthoringExample(
              authoringTools,
              args,
              validateAuthoringInput,
            );
          } else if (name === 'game_author_briefing') {
            const section = args['section'] ?? 'all';
            if (
              typeof section !== 'string' ||
              !sections.includes(section as (typeof sections)[number])
            )
              throw new Error('Unknown briefing section');
            text = briefing(section, context.binding);
          } else if (name === 'game_entities_list') {
            const category = args['category'] ?? 'all',
              known = args['knowledge'] ?? 'all';
            if (
              !categories.includes(category as (typeof categories)[number]) ||
              !knowledge.includes(known as (typeof knowledge)[number])
            )
              throw new Error('Unknown category or knowledge filter');
            const offset = args['offset'] ?? 0,
              limit = args['limit'] ?? 20;
            if (
              !Number.isSafeInteger(offset) ||
              (offset as number) < 0 ||
              (offset as number) > 4096 ||
              !Number.isSafeInteger(limit) ||
              (limit as number) < 1 ||
              (limit as number) > 50
            )
              throw new Error('Invalid page bounds');
            if (
              args['expectedRevision'] !== undefined &&
              args['expectedRevision'] !== world.revision
            )
              throw new Error('World revision changed; restart listing');
            const matching = entries().filter(
              (e) =>
                (category === 'all' || category === e.category) &&
                (known === 'all' || e.known === (known === 'known')),
            );
            const page = matching.slice(
              offset as number,
              (offset as number) + (limit as number),
            );
            const next = (offset as number) + page.length;
            text = `WORLD RECORDS\nRevision: ${world.revision}. Category: ${category}. Protagonist knowledge: ${known}. Matching: ${matching.length}.\n${page.length ? page.map(line).join('\n') : 'No matching records are authored.'}\nNext offset: ${next < matching.length ? next : 'none'}.\n${description.knowledgeDescription}`;
          } else if (name === 'game_entity_details') {
            const e = find(args['ref']);
            text = `WORLD DETAILS\nRevision: ${world.revision}.\n${line(e)}\n${e.detail}\nKnowledge source: authored fixture declaration; visibility is separate.`;
          } else {
            const from =
              name === 'game_distance'
                ? args['fromRef'] === undefined
                  ? { ...world.position }
                  : find(args['fromRef']).point
                : { ...world.position };
            const hasPoint = args['x'] !== undefined || args['y'] !== undefined;
            if (hasPoint && args['toRef'] !== undefined)
              throw new Error('Choose a reference or coordinates, not both');
            const to = hasPoint
              ? { x: args['x'] as number, y: args['y'] as number }
              : find(args['toRef']).point;
            if (!Number.isFinite(to.x) || !Number.isFinite(to.y))
              throw new Error('Expected finite x and y');
            const metric = args['metric'] ?? 'euclidean';
            if (metric !== 'euclidean' && metric !== 'route')
              throw new Error('Unknown distance metric');
            const euclidean = fixed(Math.hypot(to.x - from.x, to.y - from.y));
            if (name === 'game_distance' && metric === 'euclidean')
              text = `DISTANCE\nRevision: ${world.revision}. From (${from.x}, ${from.y}) to (${to.x}, ${to.y}).\nEuclidean distance: ${euclidean} canvas pixels. This does not establish accessibility.`;
            else {
              const route = navigator.route(from, to, actor);
              const distance =
                route.status === 'found' ? fixed(route.distance) : undefined;
              text = `${name === 'game_distance' ? 'ROUTE DISTANCE' : 'ACCESSIBILITY'}\nRevision: ${world.revision}. From (${from.x}, ${from.y}) to (${to.x}, ${to.y}).\nNavigation result: ${route.status}.${route.status === 'unreachable' ? ' Reason: ' + route.reason + '.' : ''}\n${distance === undefined ? 'No confirmed navigable-route distance.' : `Navigable route length: ${distance} canvas pixels; Euclidean distance: ${euclidean}.`}\nExisting four-neighbour grid search; 8-pixel actor radius plus 1-pixel clearance; current closed barriers and solid buildings block their exact rectangles. No movement occurred.`;
            }
          }
        }
        if (!allowed(context.binding) || context.signal.aborted)
          throw new Error('Context read cancelled');
        if (
          Buffer.byteLength(text) >
          (name === 'show_authoring_example' ? 49152 : 32768)
        )
          throw new Error('Context output exceeds its bounded text budget');
        return { content: [{ type: 'text', text }] };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Context unavailable: ${error instanceof Error ? error.message : 'read failed'}`,
            },
          ],
        };
      }
    },
  };
  return {
    provider,
    journal,
    async close() {
      disposed = true;
      producer.dispose();
      statusHandles.forEach((h) => h.dispose());
      journal.dispose();
      await journal.drain();
      await store.close();
    },
  };
}
