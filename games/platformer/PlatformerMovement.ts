import type { Node2D, Behavior } from '../../src/index.js';
import type { PlatformerBody } from './PlatformerPhysics.js';

export interface PlatformerMovementOptions {
  body: PlatformerBody;
  speed?: number;
  runSpeed?: number;
  jumpSpeed?: number;
}
/** Maps game intent to a body. It knows neither collision geometry nor the world. */
export class PlatformerMovement implements Behavior {
  readonly fixedOrder = -10;
  readonly requires: readonly Behavior[];
  readonly body: PlatformerBody;
  readonly speed: number;
  readonly runSpeed: number;
  readonly jumpSpeed: number;
  #node: Node2D | null = null;
  #retired = false;
  #axis = 0;
  #sprint = false;
  #jumpRequested = false;
  #facing = 1;
  constructor({
    body,
    speed = 180,
    runSpeed = 300,
    jumpSpeed = 600,
  }: PlatformerMovementOptions) {
    for (const [name, value] of Object.entries({ speed, runSpeed, jumpSpeed }))
      if (!Number.isFinite(value) || value <= 0)
        throw new RangeError(`${name} must be positive and finite`);
    this.body = body;
    this.requires = [body];
    this.speed = speed;
    this.runSpeed = runSpeed;
    this.jumpSpeed = jumpSpeed;
  }
  get facing() {
    return this.#facing;
  }
  onAttach(node: Node2D): undefined {
    if (this.#retired || this.#node)
      throw new Error('Movement already attached or retired');
    this.body.assertOwner(node);
    this.#node = node;
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
    if (this.body.grounded) this.#jumpRequested = true;
  }
  fixedUpdate(): undefined {
    this.#assertLive();
    this.body.setHorizontalVelocity(
      this.#axis * (this.#sprint ? this.runSpeed : this.speed),
    );
    if (this.#axis) this.#facing = Math.sign(this.#axis);
    if (this.#jumpRequested) this.body.jump(this.jumpSpeed);
    this.#jumpRequested = false;
  }
  dispose(): undefined {
    const node = this.#node;
    this.#retired = true;
    this.#node = null;
    if (node && !node.disposed && !this.body.solver.disposed)
      this.body.setHorizontalVelocity(0);
    this.#axis = 0;
    this.#jumpRequested = false;
  }
  #assertLive(): void {
    if (this.#retired || !this.#node || this.#node.disposed)
      throw new Error('Movement is detached or retired');
    this.body.assertOwner(this.#node);
  }
}
