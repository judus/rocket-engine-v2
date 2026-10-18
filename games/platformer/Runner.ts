import { Node2D, position2DWriter } from '../../src/index.js';
import type { Behavior, FixedFrame } from '../../src/index.js';
import {
  PlatformerDemo,
  platformerBlocks,
} from '../../examples/input/PlatformerDemo.js';

/** Game capability: deliberately reuses the input demo's small static-platform solver. */
export class PlatformerMovement implements Behavior {
  readonly writes = [position2DWriter];
  readonly fixedOrder = 0;
  #simulation = new PlatformerDemo();
  #node: Node2D | null = null;
  #retired = false;
  #axis = 0;
  #sprint = false;
  #steps = 0;
  get grounded() {
    return this.#simulation.grounded;
  }
  get steps() {
    return this.#steps;
  }
  get facing() {
    return this.#simulation.facing;
  }
  onAttach(node: Node2D): undefined {
    if (this.#retired || this.#node)
      throw new Error('Movement already attached or retired');
    if (![node.x, node.y].every(Number.isFinite))
      throw new RangeError('Spawn must be finite');
    this.#node = node;
    this.#simulation.x = node.x;
    this.#simulation.y = node.y;
    this.#simulation.grounded = platformerBlocks.some(
      (block) =>
        node.y === block.y &&
        node.x + 12 > block.x &&
        node.x - 12 < block.x + block.width,
    );
  }
  move(axis: number, sprint = false): void {
    this.#assertLive();
    if (!Number.isFinite(axis) || Math.abs(axis) > 1)
      throw new RangeError('Movement axis must be between -1 and 1');
    this.#axis = axis;
    this.#sprint = sprint;
  }
  jump(): void {
    this.#assertLive();
    this.#simulation.requestJump();
  }
  fixedUpdate(dt: number, _frame: FixedFrame, node: Node2D): undefined {
    this.#assertLive();
    if (node !== this.#node) throw new Error('Movement owner mismatch');
    this.#simulation.step(dt, this.#axis, this.#sprint);
    node.x = this.#simulation.x;
    node.y = this.#simulation.y;
    this.#steps++;
  }
  dispose(): undefined {
    this.#retired = true;
    this.#axis = 0;
    this.#node = null;
  }
  #assertLive(): void {
    if (this.#retired || !this.#node || this.#node.disposed)
      throw new Error('Movement is detached or retired');
  }
}

/** An independent, game-owned observer runs after every entity's movement. */
export class TravelLog implements Behavior {
  readonly fixedOrder = 10;
  readonly requires: readonly Behavior[];
  #lastX = 0;
  #distance = 0;
  constructor(movement: PlatformerMovement) {
    this.requires = [movement];
  }
  get distance() {
    return this.#distance;
  }
  onAttach(node: Node2D): undefined {
    this.#lastX = node.x;
  }
  fixedUpdate(_dt: number, _frame: FixedFrame, node: Node2D): undefined {
    this.#distance += Math.abs(node.x - this.#lastX);
    this.#lastX = node.x;
  }
}

export class Runner extends Node2D {
  readonly movement = this.attach(new PlatformerMovement());
  readonly travel = this.attach(new TravelLog(this.movement));
  constructor(x: number, color: string) {
    super({
      x,
      y: 480,
      draw(ctx): undefined {
        ctx.fillStyle = color;
        ctx.fillRect(-12, -32, 24, 32);
        ctx.fillStyle = '#10212c';
        ctx.fillRect(-6, -24, 4, 5);
        ctx.fillRect(3, -24, 4, 5);
      },
    });
  }
}

export class Patrol implements Behavior {
  readonly fixedOrder = -10;
  readonly requires: readonly Behavior[];
  #direction = 1;
  constructor(private movement: PlatformerMovement) {
    this.requires = [movement];
  }
  fixedUpdate(_dt: number, _frame: FixedFrame, node: Node2D): undefined {
    if (node.x > 760) this.#direction = -1;
    if (node.x < 100) this.#direction = 1;
    this.movement.move(this.#direction);
    if (this.movement.grounded && node.x > 235 && node.x < 700)
      this.movement.jump();
  }
}
