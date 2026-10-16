import { Rocket, Scene2D, Assets, Input, Node2D } from '../../src/index.js';
import { AnimationPlayer } from 'sprite-animation';
import { drawSprite } from 'sprite-animation/canvas2d';
import { characterAtlas } from '../character-sprites/characters.js';
import { WorkDemo } from './WorkDemo.js';
import type { WorkCheckpoint } from './WorkDemo.js';
const output = document.querySelector('output')!;
const selection = document.querySelector<HTMLSelectElement>('#worker')!;
const listeners = new AbortController();
let app: Rocket | undefined,
  model: WorkDemo | undefined,
  saved: WorkCheckpoint | undefined;
let reset = () => {};
let busy = false,
  released = 0;
async function start(checkpoint?: WorkCheckpoint) {
  if (busy) return;
  busy = true;
  document
    .querySelectorAll<HTMLButtonElement>('main button')
    .forEach((b) => (b.disabled = true));
  try {
    reset();
    await app?.dispose();
    const game = new WorkDemo(checkpoint);
    model = game;
    const application = new Rocket({
      fixed: { step: 1 / 60 },
      onError: (e) => {
        output.textContent = String(e);
      },
    });
    app = application;
    const assets = application.use(Assets),
      input = application.use(Input);
    const visuals = new Map<
      string,
      { node: Node2D; player: AnimationPlayer; facing: string; clip: string }
    >();
    const scene = application.scene(
      new Scene2D({
        async prepare({ signal }) {
          this.own(game);
          for (const [id, movement] of game.workers) {
            const lease = await assets.acquireImage(
              `./examples/character-sprites/${id === 'A' ? 'Female1' : 'Male1'}.png`,
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
            const player = new AnimationPlayer(characterAtlas);
            player.play('idle-front');
            const node = new Node2D({
              x: movement.position.x,
              y: movement.position.y,
              draw(ctx) {
                if (player.snapshot) {
                  ctx.save();
                  ctx.scale(2, 2);
                  ctx.imageSmoothingEnabled = false;
                  drawSprite(ctx, lease.image, player.snapshot, {
                    flipX: visual.facing === 'right',
                  });
                  ctx.restore();
                }
                ctx.strokeStyle =
                  selection.value === id ? '#ffdc85' : '#8df4ce';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(0, 0, 12, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = '#ffffff';
                ctx.fillText(id, -4, 20);
              },
            });
            const visual = {
              node,
              player,
              facing: 'front',
              clip: 'idle-front',
            };
            node.attach({
              dispose: () => {
                player.dispose();
                return;
              },
            });
            visuals.set(id, visual);
            this.root.add(node);
          }
        },
        fixedUpdate(dt) {
          const before = new Map(
            [...game.workers].map(([id, m]) => [id, m.position]),
          );
          game.update(
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
          for (const [id, v] of visuals) {
            const p = game.workers.get(id)?.position;
            if (!p) {
              v.node.dispose();
              continue;
            }
            const old = before.get(id)!;
            const dx = p.x - old.x,
              dy = p.y - old.y,
              moving = dx !== 0 || dy !== 0;
            if (moving)
              v.facing =
                Math.abs(dx) > Math.abs(dy)
                  ? dx < 0
                    ? 'left'
                    : 'right'
                  : dy < 0
                    ? 'back'
                    : 'front';
            const clip = `${moving ? 'walk' : 'idle'}-${['left', 'right'].includes(v.facing) ? 'side' : v.facing}`;
            if (clip !== v.clip) {
              v.player.play(clip);
              v.clip = clip;
            }
            v.player.setRate(
              moving && game.controlled === id && controls.fixed.down('run')
                ? 1.5
                : 1,
            );
            v.player.advance(dt);
            v.node.x = p.x;
            v.node.y = p.y;
          }
          return;
        },
        draw(ctx) {
          ctx.fillStyle = '#28493e';
          ctx.fillRect(0, 0, 576, 384);
          ctx.font = '14px monospace';
          for (const s of game.slots) {
            ctx.fillStyle = '#665a40';
            ctx.fillRect(s.position.x - 32, s.position.y - 32, 64, 64);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(
              s.id === 'A' ? 'SMELTER' : 'PRESS',
              s.position.x - 30,
              s.position.y - 45,
            );
          }
          if (game.gate) {
            ctx.fillStyle = '#8b7760';
            ctx.fillRect(288, 0, 32, 384);
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
      }),
    );
    reset = () => controls.reset();
    const view = application.view({
      target: '#work-world',
      scene,
      width: 576,
      height: 384,
      overlay() {
        const staffing = game.staffing.snapshot(),
          factory = game.factory.read();
        document.querySelector<HTMLButtonElement>('#takeover')!.disabled =
          !game.workers.has(selection.value) ||
          game.controlled === selection.value;
        document.querySelector<HTMLButtonElement>('#remove')!.disabled =
          !game.workers.has(selection.value);
        document.querySelector<HTMLButtonElement>('#release')!.disabled =
          !game.controlled;
        document.querySelector<HTMLButtonElement>('#restore')!.disabled =
          !saved;
        output.textContent = `Selected ${selection.value} · controlled ${game.controlled ?? 'none'} · gate ${game.gate ? 'closed' : 'open'}\n${staffing.workers.map((w) => `${w.id}: ${game.controlled === w.id ? 'manual' : w.present ? 'working' : w.status} · ${w.position.x.toFixed(1)}, ${w.position.y.toFixed(1)}`).join('\n')}\nReservations ${staffing.reservations.map((r) => `${r.worker}→${r.slot}`).join(', ') || 'none'}\n${factory.facilities
          .slice(1)
          .map(
            (f, i) =>
              `${i === 0 ? 'Smelter' : 'Press'}: ${f.jobs[0]!.state} · progress ${Math.round(f.jobs[0]!.progress * 100)}% · batches ${f.jobs[0]!.batchesCompleted}`,
          )
          .join(
            '\n',
          )}\nWorkshop parts completed ${factory.completed} · inventory ${JSON.stringify(factory.stock.quantities)} · released sheets ${released}`;
      },
    });
    controls.bind(view);
    const picking = new AbortController();
    scene.own(() => {
      picking.abort();
      return;
    });
    view.canvas.addEventListener(
      'pointerdown',
      (e) => {
        const rect = view.canvas.getBoundingClientRect(),
          x = ((e.clientX - rect.left) * 576) / rect.width,
          y = ((e.clientY - rect.top) * 384) / rect.height;
        for (const [id, m] of game.workers)
          if (
            Math.abs(x - m.position.x) < 32 &&
            y > m.position.y - 82 &&
            y < m.position.y + 14
          ) {
            selection.value = id;
            break;
          }
      },
      { signal: picking.signal },
    );
    await application.start();
  } catch (e) {
    await app?.dispose();
    output.textContent = String(e);
  } finally {
    busy = false;
    document
      .querySelectorAll<HTMLButtonElement>('main button')
      .forEach(
        (b) =>
          (b.disabled =
            !!app?.disposed && !['recreate', 'restore'].includes(b.id)),
      );
    selection.disabled = !!app?.disposed;
  }
}
function button(id: string, action: () => void) {
  document.querySelector(`#${id}`)!.addEventListener(
    'click',
    () => {
      if (busy) return;
      reset();
      try {
        action();
      } catch (e) {
        output.textContent = String(e);
      }
    },
    { signal: listeners.signal },
  );
}
button('takeover', () => model?.takeover(selection.value));
button('release', () => model?.release());
button('gate', () => model?.toggleGate());
button('remove', () => model?.remove(selection.value));
button('save', () => {
  saved = model?.save();
  document.querySelector('#checkpoint')!.textContent =
    'Checkpoint saved. Restore resumes work from these positions.';
});
button('restore', () => {
  if (saved) void start(saved);
});
button('recreate', () => {
  void start();
});
button('dispose', () => {
  void app?.dispose().then(() => {
    output.textContent = `Disposed · released sheets ${released}`;
    selection.disabled = true;
    document.querySelectorAll<HTMLButtonElement>('main button').forEach((b) => {
      b.disabled =
        !['recreate', 'restore'].includes(b.id) ||
        (b.id === 'restore' && !saved);
    });
  });
});
window.addEventListener(
  'pagehide',
  () => {
    listeners.abort();
    reset();
    void app?.dispose();
  },
  { once: true },
);
void start();
