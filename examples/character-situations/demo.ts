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
import { characterAtlas } from '../character-sprites/characters.js';
import { createSprite } from '../sprites/createSprite.js';
import { ControlledCharacter } from '../character-control/ControlledCharacter.js';
import { MeetingChat } from './MeetingChat.js';
const events = new AbortController();
const output = document.querySelector('output')!;
const guidePosition = { x: 432, y: 192 };
let app: Rocket | undefined,
  chat: MeetingChat | undefined,
  player: ControlledCharacter | undefined;
let showChat = () => {},
  reset = () => {},
  removeGuide = () => {};
let busy = false,
  released = 0;
async function start() {
  if (busy) return;
  busy = true;
  document
    .querySelectorAll<HTMLButtonElement>('main .toolbar button')
    .forEach((b) => {
      b.disabled = true;
    });
  output.textContent = 'Preparing authored guide flow…';
  try {
    reset();
    await app?.dispose();
    showChat = () => {};
    removeGuide = () => {};
    player = undefined;
    chat = undefined;
    const application = new Rocket({
      fixed: { step: 1 / 60 },
      onError: (e) => {
        output.textContent = String(e);
      },
    });
    app = application;
    const assets = application.use(Assets),
      input = application.use(Input);
    const index = new SpatialIndex<string>();
    const world = new GridTraversal(
      { minX: 0, minY: 0, columns: 18, rows: 12, tileSize: 32 },
      () => ({ status: 'passable', cost: 1 }),
      () => 0,
    );
    let guide: ReturnType<typeof createSprite> | undefined;
    let port: MeetingChat;
    let box: ChatBox | undefined;
    const scene = application.scene(
      new Scene2D({
        async prepare({ signal }) {
          this.own(index);
          const response = await fetch(
            new URL(
              '../../../examples/characters/situations/meeting.json',
              import.meta.url,
            ).href,
            { signal },
          );
          if (!response.ok)
            throw new Error('Authored guide definition unavailable');
          const definition: unknown = await response.json();
          // CFW publish performs mandatory structural AND semantic validation before use.
          port = new MeetingChat(definition as SituationDefinition);
          chat = port;
          this.own(() => {
            port.dispose();
            return;
          });
          box = new ChatBox(panel, port);
          for (const name of ['Female1', 'Male1']) {
            const lease = await assets.acquireImage(
              new URL(
                `../../../examples/character-sprites/${name}.png`,
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
            if (name === 'Female1') {
              player = new ControlledCharacter(
                world,
                { x: 336, y: 192 },
                lease.image,
              );
              this.root.add(player.node);
            } else {
              guide = createSprite(characterAtlas, lease.image, 'idle-front');
              guide.node.x = guidePosition.x;
              guide.node.y = guidePosition.y;
              guide.node.scaleX = guide.node.scaleY = 2;
              this.root.add(guide.node);
              index.insert(
                'guide',
                { minX: 400, minY: 110, maxX: 464, maxY: 206 },
                'guide',
              );
            }
          }
          removeGuide = () => {
            reset();
            index.remove('guide');
            guide?.node.dispose();
            port.dispose();
            panel.close();
            showChat = () => {};
            for (const id of ['talk', 'fail', 'hold', 'unhold', 'remove'])
              document.querySelector<HTMLButtonElement>(`#${id}`)!.disabled =
                true;
          };
        },
        fixedUpdate(dt) {
          if (!player) return;
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
          const p = player.movement.position;
          const interaction =
            !!guide &&
            !guide.node.disposed &&
            Math.hypot(p.x - guidePosition.x, p.y - guidePosition.y) <= 80;
          port.advance(dt, interaction);
          const point = pointer?.fixedPointer.world;
          if (
            point &&
            pointer?.fixedPointer.pressed &&
            pickTop(
              index.at(point),
              point,
              () => 0,
              () => guide?.contains(point) ?? false,
            )
          )
            showChat();
          return;
        },
        draw(ctx) {
          ctx.fillStyle = '#28493e';
          ctx.fillRect(0, 0, 576, 384);
          ctx.strokeStyle = '#476854';
          ctx.beginPath();
          ctx.arc(guidePosition.x, guidePosition.y, 80, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#f3f4d7';
          ctx.font = '13px monospace';
          ctx.fillText('GUIDE · interaction range', 345, 80);
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
      }),
    );
    reset = () => controls.reset();
    const view = application.view({
      target: '#situation-world',
      scene,
      width: 576,
      height: 384,
      overlay() {
        const p = player?.movement.position;
        output.textContent = `Player ${p?.x.toFixed(1)}, ${p?.y.toFixed(1)} · guide ${guide?.node.disposed ? 'removed' : 'present'}\n${port.read().status} · journal ${port.host.journalHeld ? 'held' : 'ready'}\nCFW authored choices · no AI · volatile host journal · released sheets ${released}`;
      },
    });
    const pointer = controls.bind(view);
    const panel = new Panel({
      target: '#situation-chat',
      title: 'Guide · authored CFW dialogue',
      view,
    });
    panel.close();
    showChat = () => {
      reset();
      panel.show();
      if (box) panel.focus(box.input);
    };
    await application.start();
  } catch (e) {
    await app?.dispose();
    showChat = () => {};
    output.textContent = `Preparation failed: ${String(e)}`;
  } finally {
    busy = false;
    document
      .querySelectorAll<HTMLButtonElement>('main .toolbar button')
      .forEach((b) => {
        b.disabled = !!app?.disposed && b.id !== 'recreate';
      });
  }
}
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
button('talk', () => showChat());
button('fail', () => chat?.host.failNextJournal());
button('hold', () => chat?.host.holdNextJournal());
button('unhold', () => chat?.host.releaseJournal());
button('remove', () => removeGuide());
button('dispose', () => {
  void app?.dispose().then(() => {
    showChat = () => {};
    removeGuide = () => {};
    output.textContent = `Disposed · released sheets ${released}`;
    document
      .querySelectorAll<HTMLButtonElement>('main .toolbar button')
      .forEach((b) => {
        b.disabled = b.id !== 'recreate';
      });
  });
});
button('recreate', () => {
  void start();
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
