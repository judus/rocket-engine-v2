import type { SituationDefinition } from 'character-framework';
import { QuestHost } from '../character-encounter/QuestHost.js';
import type { EncounterWorld } from '../character-encounter/World.js';
import type { Journal } from '../../src/journal/index.js';
import { WatchtowerReporter, definitionDigest } from './WatchtowerReporter.js';
import type { Seal } from './WatchtowerReporter.js';
/** Deterministic proof driver, not an autonomous simulation or alternate action handler. */
export async function settle(
  host: QuestHost,
  operation?: Promise<unknown>,
): Promise<void> {
  let done = !operation,
    error: unknown;
  void operation?.then(
    () => {
      done = true;
    },
    (e) => {
      done = true;
      error = e;
    },
  );
  for (let i = 0; i < 300; i++) {
    host.advance(1 / 60);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    if (done && i >= 60) break;
  }
  if (!done) throw new Error('CFW operation did not settle');
  if (error) throw error;
}
export async function startEpisode(
  host: QuestHost,
  definition: SituationDefinition,
): Promise<void> {
  await settle(host, host.start(definition));
}
export async function completeEpisode(
  world: EncounterWorld,
  host: QuestHost,
  reporter: WatchtowerReporter,
  color: Seal,
  first: boolean,
): Promise<void> {
  if (first) {
    world.observe({ x: 208, y: 208 });
    await settle(host);
    await reporter.capture();
    for (const e of world.entities.filter((e) => e.kind === 'enemy')) {
      world.observe(e);
      world.interact(e.id);
      await settle(host);
      await reporter.capture();
    }
    world.observe({ x: 448, y: 208 });
    await settle(host);
    const view = host.view!;
    const choice = view.choices.find((c) =>
      c.label.toLowerCase().startsWith(color),
    );
    if (!choice) throw new Error('Missing ordinary choice');
    await settle(
      host,
      reporter.choose(choice.id, view.revision, 'proof:' + color),
    );
    await reporter.capture();
  }
  const item = world.entities.find((e) => e.id === color + '-seal')!;
  world.observe(item);
  world.interact(item.id);
  await settle(host);
  await reporter.capture();
  const beacon = world.entities.find(
    (e) => e.id === (color === 'blue' ? 'beacon-a' : 'beacon-b'),
  )!;
  world.observe(beacon);
  world.interact(beacon.id);
  await settle(host);
  await reporter.capture();
  if (host.view?.status !== 'closed' || !beacon.lit)
    throw new Error('Ordinary handlers did not complete episode');
}
/** Reads the actual report + current game facts; an unknown/pending run produces no sequel. */
export async function nextEpisode(
  journal: Journal,
  world: EncounterWorld,
  baseline: SituationDefinition,
): Promise<{
  definition: SituationDefinition;
  color: Seal;
  parentRun: string;
}> {
  const page = await journal.read({
    type: 'quest.mission_report',
    source: 'watchtower-quests',
    limit: 100,
  });
  if (page.nextCursor) throw new Error('Proof history exceeds one report page');
  const report = page.events.find(
    (e) =>
      e.payload &&
      typeof e.payload === 'object' &&
      !Array.isArray(e.payload) &&
      e.payload['episode'] === 'A',
  );
  const payload = report?.payload;
  if (
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload['outcome'] !== 'completed' ||
    typeof payload['questRunId'] !== 'string'
  )
    throw new Error('No confirmed episode A outcome');
  if (
    payload['definitionId'] !== baseline.id ||
    payload['definitionDigest'] !== (await definitionDigest(baseline))
  )
    throw new Error('Parent report definition/digest mismatch');
  const ending = payload['endingRef'];
  const color: Seal =
    ending === 'blue-complete'
      ? 'red'
      : ending === 'red-complete'
        ? 'blue'
        : (() => {
            throw new Error('Unknown prior ending');
          })();
  const priorBeacon = world.entities.find(
    (e) => e.id === (color === 'red' ? 'beacon-a' : 'beacon-b'),
  );
  const priorSeal = world.entities.find(
    (e) => e.id === (color === 'red' ? 'blue-seal' : 'red-seal'),
  );
  if (!priorBeacon?.lit || priorSeal?.deliveredTo !== priorBeacon.id)
    throw new Error('Current world does not match prior confirmed outcome');
  const ids = new Set([
    color + '-router',
    color + '-pickup',
    color + '-delivery',
    color + '-complete',
  ]);
  const definition: SituationDefinition = {
    ...structuredClone(baseline),
    id: 'continuation-after-' + payload['questRunId'],
    start: color + '-router',
    situations: structuredClone(
      baseline.situations.filter((s) => ids.has(s.id)),
    ),
  };
  return { definition, color, parentRun: payload['questRunId'] };
}
