import { Node2D } from '../../src/index.js';
import type { Behavior, FixedFrame } from '../../src/index.js';
import { Inventory } from '../shared/Inventory.js';
import { TopDownBody } from './TopDownPhysics.js';
import type { TopDownWorld } from './TopDownPhysics.js';
import { TopDownMovement } from './TopDownMovement.js';
import { PickupInteraction } from './Pickups.js';
import type { SupplyPickup } from './Pickups.js';

export interface ExplorerOptions {
  x: number;
  y: number;
  color: string;
  world: TopDownWorld;
  pickups: () => readonly SupplyPickup[];
  width?: number;
  height?: number;
  speed?: number;
  runSpeed?: number;
  capacity?: number;
}
export class Explorer extends Node2D {
  readonly body: TopDownBody;
  readonly movement: TopDownMovement;
  readonly inventory: Inventory;
  readonly interaction: PickupInteraction;
  constructor({
    x,
    y,
    color,
    world,
    pickups,
    width = 24,
    height = 24,
    speed = 180,
    runSpeed = 280,
    capacity = 6,
  }: ExplorerOptions) {
    super({
      x,
      y,
      draw(ctx): undefined {
        ctx.fillStyle = '#101d25';
        ctx.fillRect(-width / 2 - 3, -height / 2 + 6, width + 6, height);
        ctx.fillStyle = color;
        ctx.fillRect(-width / 2, -height / 2, width, height);
        ctx.strokeStyle = '#eef9f2';
        ctx.strokeRect(-width / 2, -height / 2, width, height);
        ctx.fillStyle = '#20343d';
        ctx.fillRect(-width / 4, -height / 4, width / 2, height / 3);
      },
    });
    try {
      this.body = this.attach(new TopDownBody({ world, width, height }));
      this.movement = this.attach(
        new TopDownMovement({ body: this.body, speed, runSpeed }),
      );
      this.inventory = this.attach(new Inventory({ capacity }));
      this.interaction = this.attach(
        new PickupInteraction({
          body: this.body,
          inventory: this.inventory,
          pickups,
          canReach: (from, to) => world.canReach(from, to),
        }),
      );
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
}

/** Deliberately game-owned patrol: supplied waypoints are clear of obstacles; no path planner. */
export class SupplyPatrol implements Behavior {
  readonly fixedOrder = -20;
  readonly requires: readonly Behavior[];
  readonly waypoints: readonly Readonly<{ x: number; y: number }>[];
  #index = 0;
  constructor(
    private movement: TopDownMovement,
    private interaction: PickupInteraction,
    waypoints: readonly { x: number; y: number }[],
  ) {
    if (
      !waypoints.length ||
      waypoints.some((p) => ![p.x, p.y].every(Number.isFinite))
    )
      throw new RangeError('Patrol requires finite waypoints');
    this.waypoints = Object.freeze(
      waypoints.map((p) => Object.freeze({ ...p })),
    );
    this.requires = [movement, interaction];
  }
  fixedUpdate(dt: number, _frame: FixedFrame, node: Node2D): undefined {
    let target = this.waypoints[this.#index]!;
    if (Math.hypot(target.x - node.x, target.y - node.y) < 6) {
      this.#index = (this.#index + 1) % this.waypoints.length;
      target = this.waypoints[this.#index]!;
    }
    const dx = target.x - node.x,
      dy = target.y - node.y,
      distance = Math.hypot(dx, dy);
    const divisor = Math.max(distance, this.movement.speed * dt);
    this.movement.move(dx / divisor, dy / divisor);
    this.interaction.request();
  }
}
