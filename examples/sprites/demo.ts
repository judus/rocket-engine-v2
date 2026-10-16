import { Rocket, Scene2D, Node2D, Assets, Input } from '../../src/index.js';
import type { View } from '../../src/View.js';
import { atlas } from './atlas.js';
import { createAtlas } from 'sprite-animation';
import {
  Sprite2D,
  loadSprite,
  bindSpriteIndex,
} from '../../src/sprites/index.js';
import type { SpriteMembership } from '../../src/sprites/index.js';
import { SpatialIndex } from '../../src/SpatialIndex.js';
const output = document.querySelector('output')!;
let app: Rocket | undefined;
let second: View | undefined;
let sprites: Sprite2D[] = [];
let selected = 0,
  busy = false,
  released = 0;
let lifecycle = '';
const listeners = new AbortController();
function button(id: string, action: () => void) {
  document
    .querySelector(`#${id}`)!
    .addEventListener('click', action, { signal: listeners.signal });
}
async function start(badImage = false) {
  if (busy) return;
  busy = true;
  try {
    await app?.dispose();
    sprites = [];
    selected = 0;
    lifecycle = '';
    const application = new Rocket({
      performance: true,
      onError: (e) => {
        output.textContent = `Sprite runtime error: ${String(e)}`;
      },
    });
    app = application;
    const assets = application.use(Assets),
      input = application.use(Input);
    let ticks = 0,
      completions = 0;
    const index = new SpatialIndex<Sprite2D>();
    let memberships: SpriteMembership[] = [];
    const acquisition = {
      acquireImage: async (
        url: string | URL,
        options: { signal?: AbortSignal } = {},
      ) => {
        const lease = await assets.acquireImage(url, options);
        let closed = false;
        return {
          image: lease.image,
          dispose(): undefined {
            if (closed) return;
            closed = true;
            lease.dispose();
            released++;
          },
        };
      },
    };
    const wrongAtlas = createAtlas({
      width: 1,
      height: 1,
      frames: {
        tiny: {
          source: { x: 0, y: 0, width: 1, height: 1 },
          pivot: { x: 0, y: 0 },
        },
      },
      clips: { tiny: [{ frame: 'tiny', duration: 1 }] },
    });
    const scene = application.scene(
      new Scene2D({
        async prepare({ signal }) {
          this.own(index);
          const parent = this.root.add(
            new Node2D({
              x: 190,
              y: 190,
              rotation: 0.25,
              scaleX: 3,
              scaleY: 2.2,
            }),
          );
          const a = await loadSprite(
            acquisition,
            './examples/sprites/atlas.png',
            badImage ? wrongAtlas : atlas,
            badImage ? 'tiny' : 'walk',
            {
              signal,
              debugBounds: true,
              onComplete: () => {
                completions++;
              },
            },
          );
          this.own(a);
          a.node.rotation = -0.1;
          parent.add(a.node);
          const b = await loadSprite(
            acquisition,
            './examples/sprites/atlas.png',
            atlas,
            'blink',
            {
              signal,
              debugBounds: true,
              onComplete: () => {
                completions++;
              },
            },
          );
          this.own(b);
          b.node.x = 390;
          b.node.y = 200;
          b.node.scaleX = b.node.scaleY = 3;
          b.player.setRate(0.6);
          this.root.add(b.node);
          sprites = [a, b];
          memberships = sprites.map((sprite, i) =>
            bindSpriteIndex(sprite, index, 'sprite-' + i),
          );
        },
        update() {
          ticks++;
          for (const membership of memberships) membership.refresh();
          for (const binding of controls.views)
            if (binding.pointer.pressed && binding.pointer.world) {
              const hit = index.pick(
                binding.pointer.world,
                (a, b) => sprites.indexOf(a) - sprites.indexOf(b),
                (sprite, p) => sprite.contains(p),
              );
              const found = hit ? sprites.indexOf(hit.value) : -1;
              if (found >= 0) selected = found;
            }
        },
        draw(ctx) {
          ctx.fillStyle = '#101b2b';
          ctx.fillRect(-1000, -1000, 3000, 3000);
        },
      }),
    );
    const controls = scene.own(input.scope(scene, {}));
    const overlay = (ctx: CanvasRenderingContext2D): undefined => {
      ctx.font = '14px monospace';
      ctx.fillStyle = '#dbe7f4';
      ctx.fillText(
        `Selected ${selected ? 'B' : 'A'} · ${ticks} scene updates · ${application.performance?.fps?.toFixed(0) ?? '…'} FPS`,
        15,
        25,
      );
      output.textContent = `Selected ${selected ? 'B' : 'A'}\n${sprites.map((s, i) => `${i ? 'B' : 'A'}: ${s.player.status}, updates ${s.updates}, draws ${s.draws}, phase ${s.player.snapshot?.phase.toFixed(3) ?? '—'}`).join('\n')}\nOne cached image, two binding-owned leases · released leases ${released} · completions ${completions} · indexed sprites ${index.size}\n${lifecycle}`;
    };
    const first = application.view({
      target: '#sprites-world',
      scene,
      width: 640,
      height: 320,
      overlay,
    });
    second = application.view({
      target: '#sprites-detail',
      scene,
      width: 640,
      height: 320,
      overlay,
    });
    second.camera.zoom = 1.4;
    second.camera.x = 75;
    second.camera.y = 60;
    controls.bind(first);
    controls.bind(second);
    await application.start();
  } catch (e) {
    await app?.dispose();
    output.textContent = `Preparation failed: ${String(e)} · released leases ${released}`;
  } finally {
    busy = false;
  }
}
button('sprite-pause', () => {
  const p = sprites[selected]?.player;
  if (p && p.status !== 'disposed') {
    if (p.status === 'paused') p.resume();
    else p.pause();
  }
});
button('sprite-flip', () => {
  const s = sprites[selected];
  if (s) s.flips.flipX = !s.flips.flipX;
});
button('sprite-once', () => {
  const p = sprites[selected]?.player;
  if (p && p.status !== 'disposed') p.play('walk', { mode: 'once' });
});
button('sprite-loop', () => {
  const p = sprites[selected]?.player;
  if (p && p.status !== 'disposed') p.play('walk');
});
button('sprite-remove', () => sprites[selected]?.node.dispose());
button('sprite-close', () => {
  second?.dispose();
  lifecycle = 'Detail closed: scene players and image remain alive.';
});
button('sprite-dispose', () => {
  void app?.dispose().then(() => {
    output.textContent = `Disposed: ${sprites.map((s) => s.player.status).join(' / ')} · released leases ${released}`;
  });
});
button('sprite-bad-image', () => {
  void start(true);
});
button('sprite-recreate', () => {
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
