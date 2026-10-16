import { AnimationPlayer } from 'sprite-animation';
import { drawSprite } from 'sprite-animation/canvas2d';
import type { SpriteImage } from 'sprite-animation/canvas2d';
import { Node2D } from '../../src/Node2D.js';
import { DirectMovement } from '../../src/navigation/index.js';
import type { TraversalWorld } from '../../src/navigation/index.js';
import type { Point } from '../../src/types.js';
import { characterAtlas } from '../character-sprites/characters.js';
import type { Direction } from '../character-sprites/characters.js';

export const walkSpeed = 80;
export const runSpeed = walkSpeed * 1.7;
/** Scene fixed update is the sole owner of movement and animation advancement. */
export class ControlledCharacter {
  readonly movement: DirectMovement;
  readonly player = new AnimationPlayer(characterAtlas);
  readonly node: Node2D;
  facing: Direction = 'front';
  state: 'idle' | 'walking' | 'running' | 'blocked' | 'unknown' = 'idle';
  #clip = 'idle-front';
  constructor(
    world: TraversalWorld,
    position: Readonly<Point>,
    image: SpriteImage,
  ) {
    this.movement = new DirectMovement(world, position, {
      radius: 8,
      clearance: 1,
      capabilities: ['walk'],
    });
    this.player.play(this.#clip);
    this.node = new Node2D({
      x: position.x,
      y: position.y,
      draw: (ctx) => {
        const snapshot = this.player.snapshot;
        if (snapshot) {
          ctx.imageSmoothingEnabled = false;
          ctx.save();
          ctx.scale(2, 2);
          drawSprite(ctx, image, snapshot, { flipX: this.facing === 'right' });
          ctx.restore();
        }
        ctx.strokeStyle = '#8df4ce';
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.stroke();
      },
    });
    this.node.attach({
      dispose: () => {
        this.movement.dispose();
        this.player.dispose();
        return;
      },
    });
  }
  update(dt: number, direction: Readonly<Point>, running: boolean): undefined {
    if (this.node.disposed) return;
    const before = this.movement.position;
    const result = this.movement.update(
      dt,
      direction,
      running ? runSpeed : walkSpeed,
    );
    const position = this.movement.position;
    if (result === 'moved') {
      const dx = position.x - before.x,
        dy = position.y - before.y;
      this.facing =
        Math.abs(dx) > Math.abs(dy)
          ? dx < 0
            ? 'left'
            : 'right'
          : dy < 0
            ? 'back'
            : 'front';
    }
    this.state =
      result === 'moved' ? (running ? 'running' : 'walking') : result;
    const side =
      this.facing === 'left' || this.facing === 'right' ? 'side' : this.facing;
    const clip = `${result === 'moved' ? 'walk' : 'idle'}-${side}`;
    if (clip !== this.#clip) {
      this.player.play(clip);
      this.#clip = clip;
    }
    this.player.setRate(result === 'moved' && running ? 1.5 : 1);
    this.player.advance(dt);
    this.node.x = position.x;
    this.node.y = position.y;
    return;
  }
  dispose(): undefined {
    this.node.dispose();
    return;
  }
}
