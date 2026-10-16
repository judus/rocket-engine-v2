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
import { EncounterWorld } from './World.js';
import type { WorldSpec } from './World.js';
import { QuestHost } from './QuestHost.js';
import { QuestChat } from './QuestChat.js';
const output = document.querySelector('output')!;
const detail = document.querySelector('#quest-json')!;
const events = new AbortController();
let app: Rocket | undefined,
  busy = false,
  released = 0;
let reset = () => {},
  toggleHistory = () => {},
  loseReply = () => {},
  show = () => {};
async function json(url: URL, signal: AbortSignal): Promise<unknown> {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`Cannot load ${url.pathname}`);
  return r.json();
}
async function start(prior = false) {
  if (busy) return;
  busy = true;
  try {
    reset();
    await app?.dispose();
    toggleHistory = loseReply = show = retryBoot = () => {};
    const application = new Rocket({
      fixed: { step: 1 / 60 },
      onError: (e) => {
        output.textContent = String(e);
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
    const scene = application.scene(
      new Scene2D({
        async prepare({ signal }) {
          this.own(index);
          const base = new URL(
            './examples/character-encounter/session.json',
            window.location.href,
          );
          const session = (await json(base, signal)) as {
            world: string;
            quest: string;
            startOn: string;
          };
          if (session.startOn !== 'world-ready')
            throw new Error('Unsupported declarative start trigger');
          const spec = (await json(
            new URL(session.world, base),
            signal,
          )) as WorldSpec;
          const definition = (await json(
            new URL(session.quest, base),
            signal,
          )) as SituationDefinition;
          detail.textContent = JSON.stringify(definition, null, 2);
          world = this.own(new EncounterWorld(spec, prior));
          host = this.own(new QuestHost(world));
          chat = new QuestChat(host);
          this.own(() => {
            chat.dispose();
            return;
          });
          new ChatBox(panel, chat);
          const lease = await assets.acquireImage(
            './examples/character-sprites/Female1.png',
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
          // Publish/start is selected by session JSON. No stage, route, objective or consequence logic here.
          const boot = () => {
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
          boot();
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
              else note = world.interact(picked.value);
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
                    : e.kind === 'beacon'
                      ? e.lit
                        ? e.acceptsItemRef?.startsWith('blue')
                          ? '#72b9ff'
                          : '#ff786e'
                        : '#667c80'
                      : '#987859';
            if (e.kind === 'gate') {
              if (!e.open) ctx.fillRect(e.x - 12, e.y - 64, 24, 128);
              else {
                ctx.strokeStyle = '#85d6c3';
                ctx.strokeRect(e.x - 12, e.y - 64, 24, 128);
              }
            } else {
              ctx.beginPath();
              ctx.arc(e.x, e.y, e.kind === 'beacon' ? 18 : 12, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = '#e1edef';
            ctx.fillText(e.label, e.x - 30, e.y + 36);
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
        output.textContent = `${ready ? (v ? `${v.situationId} · ${v.status}` : 'Starting') : error || 'Starting authored quest…'} · player ${p.x.toFixed(1)}, ${p.y.toFixed(1)}\n${v?.dialogue || ''}\n${v?.error || note || ''}\nCarrying ${
          world.entities
            .filter((e) => e.kind === 'item' && e.collected && !e.deliveredTo)
            .map((e) => e.label)
            .join(', ') || 'no seal'
        }\nHistory ${world.historyAvailable ? 'available' : 'unavailable'} · consequence executions ${host.executions} · event sequence ${world.sequence} · released sheets ${released}`;

        document.querySelector<HTMLButtonElement>('#retry')!.disabled =
          ready || !error;
      },
    });
    const pointer = controls.bind(view);
    const panel = new Panel({
      target: '#encounter-panel',
      title: 'Watchkeeper · choose your path',
      view,
    });

    panel.close();
    show = () => {
      reset();
      panel.show();
      panel.focus();
    };
    await application.start();
  } catch (e) {
    await app?.dispose();
    toggleHistory = loseReply = show = retryBoot = () => {};
    output.textContent = `Preparation failed: ${String(e)}`;
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
button('history', () => toggleHistory());
button('lose', () => loseReply());
button('panel', () => show());
button('retry', () => retryBoot());
button('dispose', () => {
  reset();
  toggleHistory = loseReply = show = retryBoot = () => {};
  void app?.dispose().then(() => {
    output.textContent = `Disposed · released sheets ${released}`;
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
