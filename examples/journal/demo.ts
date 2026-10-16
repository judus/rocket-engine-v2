import type { SituationDefinition } from 'character-framework';
import { Journal, MemoryJournalStore } from '../../src/journal/index.js';
import type { JournalStore } from '../../src/journal/index.js';
import { EncounterWorld } from '../character-encounter/World.js';
import type { WorldSpec } from '../character-encounter/World.js';
import { QuestHost } from '../character-encounter/QuestHost.js';
import { WatchtowerReporter } from './WatchtowerReporter.js';
import { startEpisode, completeEpisode, nextEpisode } from './episodes.js';
const output = document.querySelector('output')!,
  history = document.querySelector('#journal')!,
  status = document.querySelector('#status')!;
const button = (id: string) =>
  document.querySelector<HTMLButtonElement>('#' + id)!;
const input = async (name: string): Promise<unknown> => {
  const r = await fetch('./examples/character-encounter/' + name + '.json');
  if (!r.ok) throw new Error('Cannot load ' + name);
  return r.json();
};
const [spec, baseline] = (await Promise.all([
  input('world'),
  input('quest'),
])) as [WorldSpec, SituationDefinition];
let memory: MemoryJournalStore,
  journal: Journal,
  world: EncounterWorld,
  host: QuestHost,
  reporter: WatchtowerReporter;
let busy = false,
  disposed = true,
  broken = false,
  episodeA = false,
  episodeB = false,
  generation = 0,
  reportingFailed = false;
function controls() {
  button('blue').disabled = busy || disposed || episodeA;
  button('red').disabled = busy || disposed || episodeA;
  button('next').disabled =
    busy || disposed || !episodeA || episodeB || reportingFailed;
  button('dispose').disabled = busy || disposed;
  button('reset').disabled = busy;
  button('failure').disabled = busy || disposed || !episodeA || reportingFailed;
  button('retry').disabled = busy || disposed || !reportingFailed;
}
async function show() {
  const page = await journal.read();
  history.textContent = JSON.stringify(page, null, 2);
  const reports = page.events.filter((e) => e.type === 'quest.mission_report');
  document.querySelector('#summary')!.textContent =
    reports.length +
    ' confirmed mission reports · ' +
    world.entities
      .filter((e) => e.kind === 'beacon')
      .map((e) => e.label + ': ' + (e.lit ? 'lit' : 'unlit'))
      .join(' · ');
  status.textContent = JSON.stringify(
    await journal.status(['world', 'quests']),
    null,
    2,
  );
}
async function cleanup() {
  if (disposed) return;
  reporter.dispose();
  host.dispose();
  world.dispose();
  journal.dispose();
  await journal.drain();
  await memory.close();
  disposed = true;
}
function reset() {
  generation++;
  broken = false;
  reportingFailed = false;
  episodeA = false;
  episodeB = false;
  memory = new MemoryJournalStore({
    gameId: 'rocket-encounter',
    saveId: 'browser-proof',
    timelineId: 'timeline-' + generation,
  });
  const store: JournalStore = {
    identity: memory.identity,
    durability: 'volatile',
    head: () => memory.head(),
    range: (...a) => memory.range(...a),
    close: () => memory.close(),
    append: (e) => {
      if (broken) {
        broken = false;
        throw new Error(
          'Simulated journal write failure; game state retained. Retry reporting.',
        );
      }
      return memory.append(e);
    },
  };
  journal = new Journal().configure(store);
  world = new EncounterWorld(spec);
  host = new QuestHost(world);
  reporter = new WatchtowerReporter(journal, world);
  disposed = false;
  output.textContent = 'Ready. Choose an episode A branch.';
  history.textContent = '[]';
  document.querySelector('#summary')!.textContent =
    'No confirmed mission reports yet.';
  status.textContent = 'No active quest.';
  controls();
}
async function run(action: () => Promise<void>) {
  if (busy) return;
  busy = true;
  controls();
  try {
    await action();
  } catch (e) {
    output.textContent = String(e);
    if (!disposed) await show();
  } finally {
    busy = false;
    controls();
  }
}
for (const color of ['blue', 'red'] as const)
  button(color).addEventListener('click', () => {
    void run(async () => {
      await reporter.attach(host, baseline, 'A');
      await startEpisode(host, baseline);
      await completeEpisode(world, host, reporter, color, true);
      episodeA = true;
      output.textContent =
        'Episode A confirmed: ' +
        color +
        '. Episode B will react to this report and current world facts.';
      await show();
    });
  });
button('next').addEventListener('click', () => {
  void run(async () => {
    const next = await nextEpisode(journal, world, baseline);
    host.dispose();
    host = new QuestHost(world);
    await reporter.attach(host, next.definition, 'B');
    await startEpisode(host, next.definition);
    await completeEpisode(world, host, reporter, next.color, false);
    episodeB = true;
    output.textContent =
      'Episode B confirmed: ' +
      next.color +
      '. Both beacons lit; two evidence-backed mission reports, no AI.';
    await show();
  });
});
button('failure').addEventListener('click', () => {
  void run(async () => {
    broken = true;
    reportingFailed = true;
    world.observe({ x: 208, y: 208 });
    await reporter.capture();
  });
});
button('retry').addEventListener('click', () => {
  void run(async () => {
    await reporter.capture();
    reportingFailed = false;
    output.textContent =
      'Reporting retried using original event/effect identities. No game action rerun.';
    await show();
  });
});
button('dispose').addEventListener('click', () => {
  void run(async () => {
    await cleanup();
    output.textContent =
      'Disposed: producer handles, status readers, CFW host, world and volatile store released.';
  });
});
button('reset').addEventListener('click', () => {
  void run(async () => {
    await cleanup();
    reset();
  });
});
window.addEventListener(
  'pagehide',
  () => {
    void cleanup();
  },
  { once: true },
);
reset();
