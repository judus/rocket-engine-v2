import {
  Rocket,
  Scene2D,
  Assets,
  Input,
  SpatialIndex,
  pickTop,
} from '../../src/index.js';
import { GridTraversal } from '../../src/navigation/index.js';
import { Panel, ChatBox } from '../../src/ui/index.js';
import type { SituationDefinition } from 'character-framework';
import { ControlledCharacter } from '../character-control/ControlledCharacter.js';
import { EncounterWorld } from '../character-encounter/World.js';
import type { WorldSpec } from '../character-encounter/World.js';
import { QuestHost } from '../character-encounter/QuestHost.js';
import { QuestChat } from '../character-encounter/QuestChat.js';
import { generationPanel } from './GenerationPanel.js';
const output = document.querySelector('#game-status')!;
const detail = document.querySelector('#quest-json')!;
const inventory = document.querySelector<HTMLSelectElement>('#inventory')!;
const objectiveStatus = document.querySelector('#objective-status')!;
const objectiveList = document.querySelector('#objective-list')!;
let objectiveSignature = '';
function renderObjectives(
  status: string,
  objectives: { description: string; satisfied: boolean | null }[] = [],
) {
  const signature = JSON.stringify([status, objectives]);
  if (signature === objectiveSignature) return;
  objectiveSignature = signature;
  objectiveStatus.textContent = status;
  (objectiveStatus as HTMLElement).hidden = !status;
  objectiveList.replaceChildren(
    ...objectives.map(({ description, satisfied }) => {
      const item = document.createElement('li');
      item.textContent = `${satisfied === true ? 'Complete' : satisfied === false ? 'To do' : 'Checking'}: ${description}`;
      return item;
    }),
  );
}
const events = new AbortController();
let app: Rocket | undefined,
  busy = false,
  released = 0;
let reset = () => {},
  toggleHistory = () => {},
  loseReply = () => {},
  show = () => {},
  useSelected = () => {},
  giveSelected = () => {};
async function json(url: URL, signal: AbortSignal): Promise<unknown> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Cannot load ${url.pathname}`);
  return r.json();
}
let candidate: SituationDefinition | undefined;
async function start(prior = false) {
  if (busy) return;
  busy = true;
  renderObjectives(candidate ? 'Loading quest…' : 'No quest loaded.');
  try {
    reset();
    await app?.dispose();
    toggleHistory =
      loseReply =
      show =
      retryBoot =
      useSelected =
      giveSelected =
        () => {};
    const application = new Rocket({
      fixed: { step: 1 / 60 },
      onError: (e) => {
        output.textContent = String(e);
        renderObjectives(String(e));
      },
    });
    app = application;
    const assets = application.use(Assets),
      input = application.use(Input);
    let world: EncounterWorld,
      host: QuestHost,
      chat: QuestChat,
      player: ControlledCharacter,
      note = '',
      ready = false,
      error = '';
    const index = new SpatialIndex<string>();
    const traversal = new GridTraversal(
      { minX: 0, minY: 0, columns: 24, rows: 13, tileSize: 32 },
      () => ({ status: 'passable', cost: 1 }),
      () => world.revision,
      () => world.blockers(),
    );
    const scene = application.scene(
      new Scene2D({
        async prepare({ signal }) {
          this.own(index);
          const spec = (await json(
            new URL(
              '../../../examples/quest-authoring/village-world.json',
              import.meta.url,
            ),
            signal,
          )) as WorldSpec;
          const definition = candidate;
          detail.textContent = definition
            ? JSON.stringify(definition, null, 2)
            : 'No quest loaded.';
          world = this.own(new EncounterWorld(spec, prior));
          host = this.own(new QuestHost(world));
          chat = new QuestChat(host, 'Dialogue');
          this.own(() => {
            chat.dispose();
            return;
          });
          new ChatBox(panel, chat);
          const lease = await assets.acquireImage(
            new URL(
              '../../../examples/character-sprites/Female1.png',
              import.meta.url,
            ).href,
            { signal },
          );
          if (signal.aborted) {
            lease.dispose();
            signal.throwIfAborted();
          }
          this.own(() => {
            lease.dispose();
            released++;
            return;
          });
          player = new ControlledCharacter(traversal, spec.spawn, lease.image);
          this.root.add(player.node);
          for (const e of world.entities)
            index.insert(
              e.id,
              {
                minX: e.x - 15,
                minY: e.y - 15,
                maxX: e.x + 15,
                maxY: e.y + 15,
              },
              e.id,
            );
          toggleHistory = () => {
            world.historyAvailable = !world.historyAvailable;
            world.revision++;
          };
          loseReply = () => {
            host.loseNextReply();
            note =
              'Next consequence reply will be lost; its original effect will reconcile.';
          };
          const selected = () =>
            world.carried().find((e) => e.id === inventory.value);
          useSelected = () => {
            const item = selected(),
              target = world.nearestTarget();
            note =
              item && target
                ? world.useItem(item.id, target.id).message
                : 'Select a carried item and approach a target.';
          };
          giveSelected = () => {
            const item = selected(),
              person = world.entities
                .filter((e) => e.kind === 'guide' && world.near(e))
                .sort(
                  (a, b) =>
                    Math.hypot(a.x - world.position.x, a.y - world.position.y) -
                    Math.hypot(b.x - world.position.x, b.y - world.position.y),
                )[0];
            note =
              item && person
                ? world.giveItem(item.id, 'player', person.id).message
                : 'Select a carried item and approach a character.';
          };
          // Publish/start is selected by session JSON. No stage, route, objective or consequence logic here.
          const boot = () => {
            if (!definition) return;
            void host.start(definition).then(
              () => {
                if (app === application && !application.disposed) {
                  ready = true;
                  error = '';
                }
              },
              (e) => {
                if (app === application && !application.disposed)
                  error = String(e);
              },
            );
          };
          retryBoot = boot;
          if (definition) boot();
          else ready = true;
        },
        fixedUpdate(dt) {
          player.update(
            dt,
            {
              x:
                Number(controls.fixed.down('right')) -
                Number(controls.fixed.down('left')),
              y:
                Number(controls.fixed.down('down')) -
                Number(controls.fixed.down('up')),
            },
            controls.fixed.down('run'),
          );
          world.observe(player.movement.position);
          const point = pointer.fixedPointer.world;
          if (point && pointer.fixedPointer.pressed) {
            const picked = pickTop(
              index
                .at(point)
                .filter((h) =>
                  world.entities.some((e) => e.id === h.value && e.visible),
                ),
              point,
              () => 0,
            );
            if (picked) {
              const entity = world.entities.find((e) => e.id === picked.value)!;
              if (entity.kind === 'guide') show();
              else
                note = inventory.value
                  ? world.useItem(inventory.value, picked.value).message
                  : world.interact(picked.value);
            }
          }
          if (controls.fixed.pressed('interact')) {
            const nearbyGuide = world.entities.some(
              (e) =>
                e.kind === 'guide' &&
                e.visible &&
                Math.hypot(e.x - world.position.x, e.y - world.position.y) <=
                  48,
            );
            if (nearbyGuide) show();
            else if (inventory.value) useSelected();
            else note = world.interact();
          }
          host.advance(dt);
          chat.refresh();
          return;
        },
        draw(ctx) {
          ctx.fillStyle = '#182c32';
          ctx.fillRect(0, 0, 768, 416);
          ctx.font = '12px monospace';
          for (const l of world.spec.locations) {
            ctx.fillStyle = '#2b4549';
            ctx.fillRect(
              l.bounds.minX,
              l.bounds.minY,
              l.bounds.maxX - l.bounds.minX,
              l.bounds.maxY - l.bounds.minY,
            );
            ctx.fillStyle = '#b4cace';
            ctx.fillText(l.label, l.bounds.minX, l.bounds.minY - 18);
          }
          for (const e of world.entities) {
            if (e.defeated) {
              ctx.fillStyle = '#607378';
              ctx.fillText('×', e.x - 4, e.y + 4);
              continue;
            }
            if (!e.visible || e.collected) continue;
            ctx.fillStyle =
              e.kind === 'enemy'
                ? '#e97868'
                : e.kind === 'guide'
                  ? '#85d6c3'
                  : e.kind === 'item'
                    ? e.id.startsWith('blue')
                      ? '#72b9ff'
                      : '#ff786e'
                    : e.kind === 'destination' || e.kind === 'prop'
                      ? e.states['burning'] || e.states['watered']
                        ? '#f2bf60'
                        : '#809b96'
                      : e.kind === 'building'
                        ? '#a88e72'
                        : e.kind === 'beacon'
                          ? e.lit
                            ? e.acceptsItemRef?.startsWith('blue')
                              ? '#72b9ff'
                              : '#ff786e'
                            : '#667c80'
                          : '#987859';
            if (e.kind === 'gate' || e.kind === 'building') {
              const bounds = e.bounds ?? {
                minX: e.x - 12,
                minY: e.y - 64,
                maxX: e.x + 12,
                maxY: e.y + 64,
              };
              if (!e.open)
                ctx.fillRect(
                  bounds.minX,
                  bounds.minY,
                  bounds.maxX - bounds.minX,
                  bounds.maxY - bounds.minY,
                );
              else {
                ctx.strokeStyle = '#85d6c3';
                ctx.strokeRect(
                  bounds.minX,
                  bounds.minY,
                  bounds.maxX - bounds.minX,
                  bounds.maxY - bounds.minY,
                );
              }
            } else {
              ctx.beginPath();
              ctx.arc(e.x, e.y, e.kind === 'beacon' ? 18 : 12, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = '#e1edef';
            ctx.fillText(
              e.label +
                (e.states['burning']
                  ? ' (burning)'
                  : e.states['fueled']
                    ? ' (fueled)'
                    : e.states['watered']
                      ? ' (watered)'
                      : ''),
              e.x - 30,
              e.y + 36,
            );
          }
        },
      }),
    );
    const controls = scene.own(
      input.scope(scene, {
        up: 'KeyW',
        left: 'KeyA',
        down: 'KeyS',
        right: 'KeyD',
        run: ['ShiftLeft', 'ShiftRight'],
        interact: 'KeyE',
      }),
    );
    reset = () => controls.reset();
    const view = application.view({
      target: '#encounter-world',
      scene,
      width: 768,
      height: 416,
      overlay() {
        const v = host.view,
          p = world.position;
        const missionStatus = !candidate
          ? 'Explore the village. Generate or load a quest to begin.'
          : v?.status === 'closed'
            ? 'Mission completed.'
            : 'Mission in progress.';
        output.textContent = `${ready ? missionStatus + '\n' : ''}${ready ? (v ? `${v.situationId} · ${v.status}` : 'No quest loaded') : error || 'Starting authored quest…'} · player ${p.x.toFixed(1)}, ${p.y.toFixed(1)}\n${v?.dialogue || ''}\n${v?.error || note || ''}\nCarrying ${
          world
            .carried()
            .map(
              (e) =>
                e.label +
                (e.contents
                  ? ' (' + e.contents + ')'
                  : e.usesRemaining !== null
                    ? ' (' + e.usesRemaining + ' matches)'
                    : ''),
            )
            .join(', ') || 'nothing'
        }\nHistory ${world.historyAvailable ? 'available' : 'unavailable'} · consequence executions ${host.executions} · event sequence ${world.sequence} · released sheets ${released}`;

        const stage = candidate?.situations.find(
          (s) => s.id === v?.situationId,
        );
        renderObjectives(
          !ready
            ? error || 'Starting quest…'
            : !candidate
              ? 'Generate or load a quest to begin.'
              : v?.status === 'closed'
                ? 'Mission completed.'
                : v?.error
                  ? v.error
                  : v?.choices.length
                    ? 'Talk to a nearby character to choose a response.'
                    : '',
          ready && v && v.status !== 'closed'
            ? (stage?.objectives ?? []).map((objective) => ({
                description: objective.description,
                satisfied:
                  v.objectives.find((o) => o.id === objective.id)?.satisfied ??
                  null,
              }))
            : [],
        );

        const options = world.carried().map((e) => ({
          id: e.id,
          label:
            e.label +
            (e.contents
              ? ' (' + e.contents + ')'
              : e.usesRemaining !== null
                ? ' (' + e.usesRemaining + ' matches)'
                : ''),
        }));
        const signature = JSON.stringify(options);
        if (inventory.dataset['signature'] !== signature) {
          const selected = inventory.value;
          inventory.replaceChildren(
            new Option('Empty hands — pick up / inspect', ''),
            ...options.map((e) => new Option(e.label, e.id)),
          );
          if (options.some((e) => e.id === selected))
            inventory.value = selected;
          inventory.dataset['signature'] = signature;
        }
        document.querySelector<HTMLButtonElement>('#retry')!.disabled =
          ready || !error;
      },
    });
    const pointer = controls.bind(view);
    const panel = new Panel({
      target: '#encounter-panel',
      title: 'Dialogue',
      view,
    });

    panel.close();
    show = () => {
      if (
        !world.entities.some(
          (e) =>
            e.kind === 'guide' &&
            e.visible &&
            Math.hypot(e.x - world.position.x, e.y - world.position.y) <= 48,
        )
      ) {
        note = 'Move close to a character to talk.';
        return;
      }
      reset();
      panel.show();
      panel.focus();
    };
    await application.start();
  } catch (e) {
    await app?.dispose();
    toggleHistory =
      loseReply =
      show =
      retryBoot =
      useSelected =
      giveSelected =
        () => {};
    output.textContent = `Preparation failed: ${String(e)}`;
    renderObjectives(`Preparation failed: ${String(e)}`);
  } finally {
    busy = false;
  }
}
let retryBoot = () => {};
function button(id: string, action: () => void) {
  document.querySelector(`#${id}`)!.addEventListener(
    'click',
    () => {
      if (busy) return;
      reset();
      action();
    },
    { signal: events.signal },
  );
}
button('fresh', () => {
  void start();
});
button('prior', () => {
  void start(true);
});
button('use-item', () => useSelected());
button('give-item', () => giveSelected());
button('history', () => toggleHistory());
button('lose', () => loseReply());
button('panel', () => show());
button('retry', () => retryBoot());
button('dispose', () => {
  reset();
  toggleHistory =
    loseReply =
    show =
    retryBoot =
    useSelected =
    giveSelected =
      () => {};
  void app?.dispose().then(() => {
    output.textContent = `Disposed · released sheets ${released}`;
    renderObjectives('Quest disposed.');
  });
});
window.addEventListener(
  'pagehide',
  () => {
    events.abort();
    reset();
    void app?.dispose();
  },
  { once: true },
);
void start();

const fileInput = document.querySelector<HTMLInputElement>('#candidate')!;
let loadingCandidate = false;
async function loadCandidate(value: unknown, name: string) {
  if (busy || loadingCandidate)
    throw new Error('World preparation is already running.');
  loadingCandidate = true;
  fileInput.disabled = true;
  try {
    if (
      !value ||
      typeof value !== 'object' ||
      !('id' in value) ||
      !('start' in value) ||
      !('situations' in value)
    )
      throw new Error(
        'Expected a published SituationDefinition object, not a draft or receipt.',
      );
    candidate = value as SituationDefinition;
    document.querySelector('#candidate-name')!.textContent = name;
    await start();
  } catch (e) {
    reset();
    await app?.dispose();
    candidate = undefined;
    output.textContent = `Candidate rejected: ${String(e)}`;
    renderObjectives(`Candidate rejected: ${String(e)}`);
  } finally {
    loadingCandidate = false;
    fileInput.disabled = false;
  }
}
generationPanel(loadCandidate);
fileInput.addEventListener(
  'change',
  () => {
    void (async () => {
      const file = fileInput.files?.[0];
      if (!file || busy || loadingCandidate) return;
      try {
        if (file.size > 262144) throw new Error('Candidate exceeds 256 KiB');
        const value: unknown = JSON.parse(await file.text());
        await loadCandidate(value, file.name);
      } catch (e) {
        reset();
        await app?.dispose();
        candidate = undefined;
        output.textContent = `Candidate rejected: ${String(e)}`;
        renderObjectives(`Candidate rejected: ${String(e)}`);
      } finally {
        loadingCandidate = false;
        fileInput.disabled = false;
      }
    })();
  },
  { signal: events.signal },
);
