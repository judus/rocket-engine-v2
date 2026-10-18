import { Node2D } from '../../src/index.js';
import type { Behavior, FixedFrame } from '../../src/index.js';
import { PlatformerBody } from './PlatformerPhysics.js';
import type { PlatformerSolver } from './PlatformerPhysics.js';
import { PlatformerMovement } from './PlatformerMovement.js';
import type { PlatformerMovementOptions } from './PlatformerMovement.js';

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

export interface RunnerOptions {
  x: number;
  y?: number;
  color: string;
  solver: PlatformerSolver;
  width?: number;
  height?: number;
  movement?: Omit<PlatformerMovementOptions, 'body'>;
}
export class Runner extends Node2D {
  readonly body: PlatformerBody;
  readonly movement: PlatformerMovement;
  readonly travel: TravelLog;
  constructor({
    x,
    y = 480,
    color,
    solver,
    width = 24,
    height = 32,
    movement = {},
  }: RunnerOptions) {
    super({
      x,
      y,
      draw(ctx): undefined {
        ctx.fillStyle = color;
        ctx.fillRect(-width / 2, -height, width, height);
        ctx.fillStyle = '#10212c';
        ctx.fillRect(-width / 4, -height * 0.75, width / 6, height / 6);
        ctx.fillRect(width / 8, -height * 0.75, width / 6, height / 6);
      },
    });
    try {
      this.body = this.attach(new PlatformerBody({ width, height, solver }));
      this.movement = this.attach(
        new PlatformerMovement({ ...movement, body: this.body }),
      );
      this.travel = this.attach(new TravelLog(this.movement));
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
}

export class Patrol implements Behavior {
  readonly fixedOrder = -20;
  readonly requires: readonly Behavior[];
  #direction = 1;
  constructor(private movement: PlatformerMovement) {
    this.requires = [movement];
  }
  fixedUpdate(_dt: number, _frame: FixedFrame, node: Node2D): undefined {
    if (node.x > 760) this.#direction = -1;
    if (node.x < 100) this.#direction = 1;
    this.movement.move(this.#direction);
    if (this.movement.body.grounded && node.x > 235 && node.x < 700)
      this.movement.jump();
  }
}
