import { AnimationPlayer, sampleLayers } from 'sprite-animation';
import { drawSprite, validateSpriteImage } from 'sprite-animation/canvas2d';
import { appearance, timeline, weaponAtlas } from './fixture.js';
/** Deterministic native Canvas pixel checks, including caller-owned bitmap cleanup. */
export function runProof(): {
  status: string;
  assertions: number;
  cycles: number;
  releasedCanvasSources: number;
} {
  let assertions = 0,
    releasedCanvasSources = 0;
  function check(ok: boolean, message: string): void {
    assertions++;
    if (!ok) throw new Error(message);
  }
  for (let cycle = 0; cycle < 10; cycle++) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const found = canvas.getContext('2d');
    if (!found) throw new Error('Canvas missing');
    const ctx: CanvasRenderingContext2D = found;
    const images: Record<string, HTMLCanvasElement> = {};
    const player = new AnimationPlayer(timeline);
    try {
      for (const [id, atlas, color] of [
        ['body', timeline, '#ff0000'],
        ['shirt', timeline, '#00ff00'],
        ['weapon', weaponAtlas, '#0000ff'],
      ] as const) {
        const image = document.createElement('canvas');
        image.width = atlas.width;
        image.height = atlas.height;
        const c = image.getContext('2d');
        if (!c) throw new Error('Canvas missing');
        c.fillStyle = color;
        c.fillRect(0, 0, image.width, image.height);
        validateSpriteImage(atlas, image);
        images[id] = image;
      }
      player.play('walk', { mode: 'once' });
      function draw(hidden = false, flipX = false): Uint8ClampedArray {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, 64, 64);
        ctx.translate(32, 40);
        const before = player.snapshot,
          composition = sampleLayers(appearance(hidden), before);
        for (const layer of composition?.layers ?? []) {
          const image = images[layer.id];
          if (!image) throw new Error('Missing image');
          drawSprite(ctx, image, layer.frame, { flipX });
        }
        check(
          player.snapshot?.phase === before?.phase &&
            player.snapshot?.generation === before?.generation,
          'Draw advanced master',
        );
        const transform = ctx.getTransform();
        check(
          transform.a === 1 &&
            transform.d === 1 &&
            transform.e === 32 &&
            transform.f === 40,
          'Context transform leaked',
        );
        return ctx.getImageData(32, 20, 1, 1).data;
      }
      check(draw()[1] === 255, 'Shirt must cover weapon at step 1');
      player.advance(0.25);
      check(draw()[2] === 255, 'Weapon must cover shirt at step 2');
      check(draw(true)[1] === 255, 'Hidden weapon must expose shirt');
      check(
        draw(false, true)[2] === 255,
        'Flipped layers must preserve ordering',
      );
      player.pause();
      const before = player.snapshot;
      draw(true);
      check(
        player.snapshot?.phase === before?.phase && player.status === 'paused',
        'Appearance changed paused timeline',
      );
      player.resume();
      check(
        player.advance(100)?.generation === player.generation,
        'Master once completion missing',
      );
      draw();
      draw();
      check(player.advance(100) === null, 'Duplicate completion');
    } finally {
      player.dispose();
      check(
        sampleLayers(appearance(), player.snapshot) === null,
        'Disposed composition retained',
      );
      for (const image of Object.values(images)) {
        image.width = 0;
        image.height = 0;
        releasedCanvasSources++;
      }
      check(
        Object.values(images).every(
          (image) => image.width === 0 && image.height === 0,
        ),
        'Owned canvases retained backing storage',
      );
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  return { status: 'PASS', assertions, cycles: 10, releasedCanvasSources };
}
