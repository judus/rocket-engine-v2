import type { Behavior, Node2D } from '../../src/index.js';
import type { TopDownBody } from './TopDownPhysics.js';

export class TopDownMovement implements Behavior {
  readonly fixedOrder = -10;
  readonly requires: readonly Behavior[];
  readonly body: TopDownBody;
  readonly speed: number;
  readonly runSpeed: number;
  #owner: Node2D | null = null;
  #retired = false;
  #x = 0;
  #y = 0;
  #run = false;
  constructor({
    body,
    speed = 180,
    runSpeed = 280,
  }: {
    body: TopDownBody;
    speed?: number;
    runSpeed?: number;
  }) {
    if (![speed, runSpeed].every((n) => Number.isFinite(n) && n > 0))
      throw new RangeError('Movement speeds must be positive and finite');
    this.body = body;
    this.speed = speed;
    this.runSpeed = runSpeed;
    this.requires = [body];
  }
  onAttach(node: Node2D): undefined {
    if (this.#owner || this.#retired)
      throw new Error('Movement already attached or retired');
    this.body.assertOwner(node);
    this.#owner = node;
  }
  move(x: number, y: number, run = false): void {
    this.#assertLive();
    if (![x, y].every((n) => Number.isFinite(n) && Math.abs(n) <= 1))
      throw new RangeError('Movement axes must be between -1 and 1');
    const length = Math.max(1, Math.hypot(x, y));
    this.#x = x / length;
    this.#y = y / length;
    this.#run = run;
  }
  fixedUpdate(): undefined {
    this.#assertLive();
    const speed = this.#run ? this.runSpeed : this.speed;
    this.body.setVelocity(this.#x * speed, this.#y * speed);
  }
  dispose(): undefined {
    const owner = this.#owner;
    this.#owner = null;
    this.#retired = true;
    if (owner && !owner.disposed) this.body.setVelocity(0, 0);
  }
  #assertLive(): void {
    if (this.#retired || !this.#owner || this.#owner.disposed)
      throw new Error('Movement is detached or retired');
    this.body.assertOwner(this.#owner);
  }
}
