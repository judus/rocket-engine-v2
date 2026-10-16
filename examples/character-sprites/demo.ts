import { Rocket, Scene2D, Assets, Input } from '../../src/index.js';
import type { View } from '../../src/View.js';
import {
  characterNames,
  prepareCharacters,
  setCharacterClip,
} from './characters.js';
import type { CharacterSprite, Direction } from './characters.js';

const output = document.querySelector('output')!;
const selection = document.querySelector<HTMLSelectElement>('#character')!;
const activity = document.querySelector<HTMLSelectElement>('#activity')!;
const direction = document.querySelector<HTMLSelectElement>('#direction')!;
const listeners = new AbortController();
let app: Rocket | undefined, detail: View | undefined;
let characters: CharacterSprite[] = [];
let selected = 0,
  busy = false,
  released = 0;
let lifecycle = '';
function apply() {
  const entry = characters[selected];
  if (entry)
    setCharacterClip(
      entry.sprite,
      activity.value === 'walk' ? 'walk' : 'idle',
      direction.value as Direction,
    );
}
function select(index: number) {
  selected = index;
  selection.value = String(index);
  const sprite = characters[index]?.sprite;
  const clip = sprite?.player.snapshot?.clip;
  activity.value = clip?.startsWith('walk') ? 'walk' : 'idle';
  direction.value = clip?.endsWith('side')
    ? sprite?.flips.flipX
      ? 'right'
      : 'left'
    : clip?.endsWith('back')
      ? 'back'
      : 'front';
}
async function start(fail = false) {
  if (busy) return;
  busy = true;
  const buttons = document.querySelectorAll<HTMLButtonElement>(
    'main .toolbar button',
  );
  buttons.forEach((button) => {
    button.disabled = true;
  });
  output.textContent = 'Preparing character sheets…';
  try {
    await app?.dispose();
    characters = [];
    selection.replaceChildren();
    lifecycle = '';
    const application = new Rocket({
      onError: (error) => {
        output.textContent = String(error);
      },
    });
    app = application;
    const assets = application.use(Assets),
      input = application.use(Input);
    const scene = application.scene(
      new Scene2D({
        async prepare({ signal }) {
          characters = await prepareCharacters(
            this,
            assets,
            signal,
            () => {
              released++;
            },
            fail,
          );
          characters.forEach((entry, i) => {
            const option = document.createElement('option');
            option.value = String(i);
            option.textContent = entry.name;
            selection.append(option);
          });
          select(0);
        },
        update() {
          for (const binding of controls.views)
            if (binding.pointer.pressed && binding.pointer.world) {
              const i = characters.findIndex((entry) =>
                entry.sprite.contains(binding.pointer.world!),
              );
              if (i >= 0) select(i);
            }
        },
        draw(ctx) {
          ctx.fillStyle = '#10232a';
          ctx.fillRect(-1000, -1000, 3000, 3000);
          for (const [i, name] of characterNames.entries()) {
            const x = 30 + (i % 3) * 205,
              y = 30 + Math.floor(i / 3) * 185;
            ctx.fillStyle =
              Math.floor(selected / 2) === i ? '#24453e' : '#192f35';
            ctx.fillRect(x, y, 190, 160);
            ctx.fillStyle = '#dbebe3';
            ctx.font = '14px monospace';
            ctx.fillText(name, x + 12, y + 22);
            for (let twin = 0; twin < 2; twin++) {
              const entry = characters[i * 2 + twin];
              ctx.fillStyle = selected === i * 2 + twin ? '#9ef5b2' : '#91aaa9';
              ctx.fillText(
                `${twin ? 'B' : 'A'} · ${entry?.sprite.player.snapshot?.clip.startsWith('walk') ? 'walk' : 'idle'}${selected === i * 2 + twin ? ' ●' : ''}`,
                x + (twin ? 105 : 12),
                y + 145,
              );
              if (entry && selected === i * 2 + twin) {
                ctx.strokeStyle = '#9ef5b2';
                ctx.lineWidth = 2;
                ctx.strokeRect(
                  entry.sprite.node.x - 35,
                  entry.sprite.node.y - 86,
                  70,
                  102,
                );
              }
            }
          }
        },
      }),
    );
    const controls = scene.own(input.scope(scene, {}));
    const overlay = (): undefined => {
      const entry = characters[selected];
      output.textContent = `Selected: ${entry?.name ?? '—'} · ${entry?.sprite.player.snapshot?.clip ?? '—'} · ${entry?.sprite.player.status ?? '—'}\n12 independent players / 6 shared image leases · released ${released}\n${lifecycle}`;
    };
    const first = application.view({
      target: '#character-world',
      scene,
      width: 660,
      height: 400,
      overlay,
    });
    detail = application.view({
      target: '#character-detail',
      scene,
      width: 660,
      height: 400,
    });
    controls.bind(first);
    controls.bind(detail);
    await application.start();
  } catch (error) {
    await app?.dispose();
    characters = [];
    output.textContent = `Preparation failed; scene and image leases released. Released leases: ${released}. ${String(error)}`;
  } finally {
    busy = false;
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}
selection.addEventListener('change', () => select(Number(selection.value)), {
  signal: listeners.signal,
});
activity.addEventListener('change', apply, { signal: listeners.signal });
direction.addEventListener('change', apply, { signal: listeners.signal });
function button(id: string, action: () => void) {
  document
    .querySelector(`#${id}`)!
    .addEventListener('click', action, { signal: listeners.signal });
}
button('pause', () => {
  const p = characters[selected]?.sprite.player;
  if (!p || p.status === 'disposed') return;
  if (p.status === 'paused') p.resume();
  else p.pause();
});
button('close-detail', () => {
  detail?.dispose();
  lifecycle =
    'Detail closed; all scene players keep their single update owner.';
});
button('dispose', () => {
  if (!busy)
    void app?.dispose().then(() => {
      output.textContent = `Disposed: ${characters.filter((c) => c.sprite.player.status === 'disposed').length}/12 players · released ${released} image leases`;
    });
});
button('recreate', () => {
  void start();
});
button('fail', () => {
  void start(true);
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
