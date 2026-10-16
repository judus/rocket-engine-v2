import { Rocket } from '../../src/index.js';
import {
  AnimationPlayer,
  createLayerSet,
  sampleLayers,
} from 'sprite-animation';
import { drawSprite } from 'sprite-animation/canvas2d';
import { appearance, timeline, weaponAtlas } from './fixture.js';
import { runProof } from './proof.js';
function element(id: string): HTMLElement {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing ${id}`);
  return value;
}
function context(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  return ctx;
}
function sheet(
  kind: 'body' | 'shirt' | 'weapon',
  color: string,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = kind === 'weapon' ? 48 : 64;
  canvas.height = kind === 'weapon' ? 40 : 32;
  const c = context(canvas);
  for (let i = 0; i < 2; i++) {
    const x = i * (kind === 'weapon' ? 24 : 32),
      bob = i;
    if (kind === 'body') {
      c.fillStyle = '#151d22';
      c.fillRect(x + 9, 23 - bob, 6, 8 + bob);
      c.fillRect(x + 18, 24 - bob, 6, 7 + bob);
      c.fillStyle = '#dbab7c';
      c.fillRect(x + 8, 12 - bob, 18, 13);
      c.fillRect(x + 11, 3 - bob, 12, 10);
      c.fillStyle = '#372f32';
      c.fillRect(x + 10, 1, 14, 5);
      c.fillRect(x + 11, 5, 3, 3);
      c.fillStyle = '#20252c';
      c.fillRect(x + 19, 7 - bob, 2, 2);
    } else if (kind === 'shirt') {
      c.fillStyle = color;
      c.fillRect(x + 9, 13 - bob, 16, 11);
      c.fillRect(x + 6, 14 - bob, 4, 7);
      c.fillRect(x + 24, 14 - bob, 4, 7);
      c.fillStyle = '#edcf88';
      c.fillRect(x + 16, 13 - bob, 2, 11);
    } else {
      c.fillStyle = '#8d6039';
      c.fillRect(x + 16, 5, 3, 31);
      c.fillStyle = '#d2dfd4';
      c.fillRect(x + 11, 4, 12, 10);
      c.fillStyle = '#809b9b';
      c.fillRect(x + 11, 11, 12, 3);
    }
  }
  return canvas;
}
const canvas = element('stage') as HTMLCanvasElement,
  ctx = context(canvas);
let player: AnimationPlayer | null = null,
  images: Record<string, HTMLCanvasElement> | null = null;
let app: Rocket | null = null,
  green = false,
  hidden = false,
  completions = 0;
let creates = 0,
  destroys = 0;
let scope: AbortController | null = null;
const visibleSet = appearance(),
  hiddenSet = createLayerSet({
    timeline,
    layers: visibleSet.layers.filter((layer) => layer.id !== 'weapon'),
  });
function render(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, 800, 320);
  const snapshot = player?.snapshot ?? null,
    composition = sampleLayers(hidden ? hiddenSet : visibleSet, snapshot);
  if (composition && images) {
    for (let view = 0; view < 2; view++) {
      ctx.save();
      ctx.translate(view === 0 ? 235 : 565, 245);
      ctx.scale(5, 5);
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#152721';
      ctx.beginPath();
      ctx.ellipse(0, 1, 19, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      const mirror =
        (element('flip') as HTMLInputElement).checked !== (view === 1);
      for (const layer of composition.layers) {
        const image = images[layer.id];
        if (!image) throw new Error('Missing image');
        drawSprite(ctx, image, layer.frame, { flipX: mirror });
      }
      ctx.restore();
    }
  }
  element('status').textContent =
    `${snapshot?.status ?? 'destroyed'} · step ${snapshot ? String(snapshot.frameIndex + 1) : '—'} · phase ${snapshot?.phase.toFixed(3) ?? '—'}s · completions ${String(completions)}\nweapon: ${!snapshot ? '—' : hidden ? 'hidden on all steps' : snapshot.frameIndex === 0 ? 'behind body (step 1)' : 'in front of body (step 2)'}\nback → front: ${composition?.layers.map((layer) => layer.id).join(' → ') ?? '—'}\nactive clocks ${app === null ? '0' : '1'} · active control scopes ${scope ? '1' : '0'} · created ${String(creates)} / destroyed ${String(destroys)}`;
}
function destroy(): void {
  void app?.dispose();
  app = null;
  scope?.abort();
  scope = null;
  if (player) {
    player.dispose();
    destroys++;
  }
  player = null;
  if (images) {
    for (const image of Object.values(images)) {
      image.width = 0;
      image.height = 0;
    }
  }
  images = null;
  render();
}
function create(): void {
  destroy();
  creates++;
  completions = 0;
  hidden = false;
  green = false;
  (element('weapon-visible') as HTMLInputElement).checked = true;
  element('pause').textContent = 'Pause';
  images = {
    body: sheet('body', ''),
    shirt: sheet('shirt', '#b55246'),
    weapon: sheet('weapon', ''),
  };
  player = new AnimationPlayer(timeline);
  player.play('walk');
  player.setRate(Number((element('rate') as HTMLSelectElement).value));
  scope = new AbortController();
  const signal = scope.signal;
  function on(id: string, event: string, run: () => void): void {
    element(id).addEventListener(
      event,
      () => {
        run();
        render();
      },
      { signal },
    );
  }
  on('pause', 'click', () => {
    if (player?.status === 'paused') {
      player.resume();
      element('pause').textContent = 'Pause';
    } else {
      player?.pause();
      element('pause').textContent = 'Resume';
    }
  });
  on('once', 'click', () => {
    player?.play('walk', { mode: 'once' });
    element('pause').textContent = 'Pause';
  });
  on('loop', 'click', () => {
    player?.play('walk');
    element('pause').textContent = 'Pause';
  });
  on('shirt', 'click', () => {
    green = !green;
    if (images) {
      const old = images.shirt;
      images.shirt = sheet('shirt', green ? '#769450' : '#b55246');
      if (old) {
        old.width = 0;
        old.height = 0;
      }
    }
  });
  on('weapon-visible', 'change', () => {
    hidden = !(element('weapon-visible') as HTMLInputElement).checked;
  });
  on('rate', 'change', () =>
    player?.setRate(Number((element('rate') as HTMLSelectElement).value)),
  );
  on('flip', 'change', () => {});
  app = new Rocket();
  const scene = app.scene({
    update(dt) {
      if (player?.advance(dt)) completions++;
    },
  });
  app.presentation({
    scene,
    render() {
      render();
    },
  });
  void app.start();
  render();
}
const pageScope = new AbortController();
element('destroy').addEventListener('click', destroy, {
  signal: pageScope.signal,
});
element('recreate').addEventListener('click', create, {
  signal: pageScope.signal,
});
element('verify').addEventListener(
  'click',
  () => {
    try {
      element('proof').textContent = JSON.stringify(runProof(), null, 2);
    } catch (error) {
      element('proof').textContent = `FAIL: ${String(error)}`;
      throw error;
    }
  },
  { signal: pageScope.signal },
);
window.addEventListener(
  'pagehide',
  () => {
    destroy();
    pageScope.abort();
  },
  { once: true },
);
// Keep geometry in the demo's module graph to make the differing sheet dimensions explicit.
if (weaponAtlas.width !== 48) throw new Error('Unexpected fixture');
create();
