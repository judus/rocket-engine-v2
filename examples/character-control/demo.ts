import { Rocket, Scene2D, Assets, Input } from '../../src/index.js';
import type { ImageLease } from '../../src/Assets.js';
import type { View } from '../../src/View.js';
import { GridTraversal } from '../../src/navigation/index.js';
import { Panel, ChatBox } from '../../src/ui/index.js';
import { ScriptedChat } from '../ui/ScriptedChat.js';
import { characterNames } from '../character-sprites/characters.js';
import { ControlledCharacter } from './ControlledCharacter.js';

const output = document.querySelector('output')!;
const choice = document.querySelector<HTMLSelectElement>('#character')!;
characterNames.forEach((name, index) => {
  const option = document.createElement('option');
  option.value = String(index);
  option.textContent = name;
  choice.append(option);
});
const listeners = new AbortController();
const domain = { minX: 0, minY: 0, columns: 18, rows: 12, tileSize: 32 };
const walls = [
  { id: 'wall', bounds: { minX: 288, minY: 64, maxX: 320, maxY: 256 } },
];
let unknown = true,
  revision = 0,
  paused = false,
  busy = false,
  released = 0;
let app: Rocket | undefined,
  actor: ControlledCharacter | undefined,
  second: View | undefined;
let openChat = () => {};
let resetInput = () => {};
let switchCharacter = () => {};
const world = new GridTraversal(
  domain,
  (x, y) =>
    unknown && x >= 14 && y >= 3 && y <= 8
      ? { status: 'unknown' }
      : { status: 'passable', cost: 1 },
  () => revision,
  () => walls,
);
function button(id: string, action: () => void) {
  document
    .querySelector(`#${id}`)!
    .addEventListener('click', action, { signal: listeners.signal });
}
async function start() {
  if (busy) return;
  busy = true;
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    'main .toolbar button',
  );
  buttons.forEach((b) => {
    b.disabled = true;
  });
  output.textContent = 'Loading original character sheets…';
  try {
    await app?.dispose();
    actor = undefined;
    paused = false;
    unknown = true;
    revision++;
    openChat = () => {};
    document.querySelector('#unknown')!.textContent =
      'Mark purple terrain known';
    document.querySelector('#pause')!.textContent = 'Pause';
    const application = new Rocket({
      fixed: { step: 1 / 60 },
      onError: (error) => {
        output.textContent = String(error);
      },
    });
    app = application;
    const assets = application.use(Assets),
      input = application.use(Input);
    const images: ImageLease[] = [];
    const scene = application.scene(
      new Scene2D({
        async prepare({ signal }) {
          for (const name of characterNames) {
            const lease = await assets.acquireImage(
              `./examples/character-sprites/${name}.png`,
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
            images.push(lease);
          }
          switchCharacter = () => {
            const position =
              actor && !actor.node.disposed
                ? actor.movement.position
                : { x: 128, y: 176 };
            resetInput();
            actor?.dispose();
            actor = new ControlledCharacter(
              world,
              position,
              images[Number(choice.value)]!.image,
            );
            this.root.add(actor.node);
          };
          switchCharacter();
        },
        fixedUpdate(dt) {
          if (paused || !actor || actor.node.disposed) {
            controls.reset();
            return;
          }
          actor.update(
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
          return;
        },
        draw(ctx) {
          for (let y = 0; y < 12; y++)
            for (let x = 0; x < 18; x++) {
              ctx.fillStyle =
                unknown && x >= 14 && y >= 3 && y <= 8
                  ? '#4e4360'
                  : (x + y) % 2
                    ? '#24443a'
                    : '#28493e';
              ctx.fillRect(x * 32, y * 32, 32, 32);
            }
          ctx.fillStyle = '#8b7760';
          ctx.fillRect(288, 64, 32, 192);
          ctx.font = '12px monospace';
          ctx.fillStyle = '#eff9ec';
          ctx.fillText('WALL', 280, 50);
          ctx.fillText(unknown ? 'UNKNOWN' : 'KNOWN', 446, 85);
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
    resetInput = () => controls.reset();
    const overlay = (): undefined => {
      const p = actor?.movement.position;
      output.textContent = `${characterNames[Number(choice.value)]} · ${actor?.node.disposed ? 'removed' : paused ? 'paused' : actor?.state}\nPosition ${p?.x.toFixed(1)}, ${p?.y.toFixed(1)} · ${actor?.player.snapshot?.clip ?? '—'}\nWalk 80 px/s · run 136 px/s · run playback 1.5× · released leases ${released}`;
    };
    const first = application.view({
      target: '#control-world',
      scene,
      width: 576,
      height: 384,
      overlay,
    });
    second = application.view({
      target: '#control-second',
      scene,
      width: 576,
      height: 384,
    });
    controls.bind(first);
    controls.bind(second);
    const provider = scene.own(new ScriptedChat());
    const panel = new Panel({
      target: '#control-chat',
      title: 'Scripted chat · keyboard focus proof',
      view: first,
    });
    const box = new ChatBox(panel, provider);
    panel.close();
    openChat = () => {
      resetInput();
      panel.show();
      panel.focus(box.input);
    };
    await application.start();
  } catch (error) {
    await app?.dispose();
    openChat = () => {};
    output.textContent = `Preparation failed: ${String(error)}`;
  } finally {
    busy = false;
    buttons.forEach((b) => {
      b.disabled = !!app?.disposed && b.id !== 'recreate';
    });
    choice.disabled = !!app?.disposed;
  }
}
choice.addEventListener(
  'change',
  () => {
    if (!busy && app && !app.disposed) switchCharacter();
  },
  { signal: listeners.signal },
);
button('pause', () => {
  resetInput();
  paused = !paused;
  if (actor && !actor.node.disposed) actor.update(0, { x: 0, y: 0 }, false);
  document.querySelector('#pause')!.textContent = paused ? 'Resume' : 'Pause';
});
button('unknown', () => {
  resetInput();
  unknown = !unknown;
  revision++;
  document.querySelector('#unknown')!.textContent = unknown
    ? 'Mark purple terrain known'
    : 'Mark terrain unknown';
});
button('open-chat', () => openChat());
button('close-second', () => {
  resetInput();
  second?.dispose();
});
button('remove', () => {
  resetInput();
  actor?.dispose();
});
button('dispose', () => {
  resetInput();
  void app?.dispose().then(() => {
    openChat = () => {};
    document
      .querySelectorAll<HTMLButtonElement>('main .toolbar button')
      .forEach((b) => {
        b.disabled = b.id !== 'recreate';
      });
    choice.disabled = true;
    output.textContent = `Disposed · actor ${actor?.player.status} · released ${released} image leases`;
  });
});
button('recreate', () => {
  void start();
});
window.addEventListener(
  'pagehide',
  () => {
    listeners.abort();
    void app?.dispose();
  },
  { once: true },
);
await start();
