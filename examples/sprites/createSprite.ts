import { AnimationPlayer } from 'sprite-animation';
import type { Atlas } from 'sprite-animation';
import { drawSprite, getSpriteBounds } from 'sprite-animation/canvas2d';
import type { SpriteImage } from 'sprite-animation/canvas2d';
import { Node2D } from '../../src/Node2D.js';
import type { Point } from '../../src/types.js';

/** Consumer factory: node owns playback, caller owns atlas and ready image. */
export function createSprite(atlas: Atlas, image: SpriteImage, clip: string) {
  const player = new AnimationPlayer(atlas);
  player.play(clip);
  let updates = 0,
    draws = 0;
  const flips = { flipX: false, flipY: false };
  const node = new Node2D({
    draw(ctx) {
      const frame = player.snapshot;
      if (!frame) return;
      draws++;
      ctx.imageSmoothingEnabled = false;
      drawSprite(ctx, image, frame, flips);
      const b = getSpriteBounds(frame, flips);
      ctx.strokeStyle = '#f3c66b';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      ctx.fillStyle = '#86e7cf';
      ctx.fillRect(-1, -1, 2, 2);
    },
  });
  node.attach({
    update(dt) {
      updates++;
      player.advance(dt);
      return;
    },
    dispose() {
      player.dispose();
      return;
    },
  });
  return {
    node,
    player,
    flips,
    get updates() {
      return updates;
    },
    get draws() {
      return draws;
    },
    contains(point: Point) {
      if (node.disposed || !player.snapshot) return false;
      try {
        const p = node.worldToLocal(point),
          b = getSpriteBounds(player.snapshot, flips);
        return (
          p.x >= b.x &&
          p.y >= b.y &&
          p.x < b.x + b.width &&
          p.y < b.y + b.height
        );
      } catch {
        return false;
      }
    },
  };
}
