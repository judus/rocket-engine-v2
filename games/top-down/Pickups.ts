import { Node2D } from '../../src/index.js';
import type { Behavior } from '../../src/index.js';
import { Inventory, validateStack } from '../shared/Inventory.js';
import type { TopDownBody } from './TopDownPhysics.js';

export class SupplyPickup extends Node2D {
  readonly item: string;
  readonly quantity: number;
  constructor({
    x,
    y,
    item = 'cell',
    quantity = 1,
  }: {
    x: number;
    y: number;
    item?: string;
    quantity?: number;
  }) {
    validateStack(item, quantity);
    if (![x, y].every(Number.isFinite))
      throw new RangeError('Pickup position must be finite');
    super({
      x,
      y,
      draw(ctx): undefined {
        ctx.fillStyle = '#182c26';
        ctx.fillRect(-13, -10, 26, 24);
        ctx.fillStyle = '#c4e4a2';
        ctx.fillRect(-10, -12, 20, 22);
        ctx.fillStyle = '#52775b';
        ctx.fillRect(-4, -9, 8, 16);
        ctx.strokeStyle = '#efffd4';
        ctx.strokeRect(-10, -12, 20, 22);
      },
    });
    this.item = item;
    this.quantity = quantity;
  }
}

/** Game rule: explicit interaction collects the nearest reachable item, all or nothing. */
export class PickupInteraction implements Behavior {
  readonly fixedOrder = 10;
  readonly requires: readonly Behavior[];
  readonly radius: number;
  #owner: Node2D | null = null;
  #retired = false;
  #requested = false;
  #result: 'idle' | 'collected' | 'full' | 'nothing' = 'idle';
  constructor(
    private options: {
      body: TopDownBody;
      inventory: Inventory;
      pickups: () => readonly SupplyPickup[];
      radius?: number;
      canReach: (from: Node2D, to: SupplyPickup) => boolean;
    },
  ) {
    this.radius = options.radius ?? 64;
    if (!Number.isFinite(this.radius) || this.radius <= 0)
      throw new RangeError('Interaction radius must be positive and finite');
    this.requires = [options.body, options.inventory];
  }
  get result() {
    return this.#result;
  }
  onAttach(node: Node2D): undefined {
    if (this.#owner || this.#retired)
      throw new Error('Interaction already attached or retired');
    this.options.body.assertOwner(node);
    this.options.inventory.assertOwner(node);
    this.#owner = node;
  }
  request(): void {
    this.#assertLive();
    this.#requested = true;
  }
  fixedUpdate(): undefined {
    this.#assertLive();
    if (!this.#requested) return;
    this.#requested = false;
    const owner = this.#owner!;
    let nearest: SupplyPickup | undefined,
      distance = this.radius;
    for (const pickup of this.options.pickups()) {
      if (pickup.disposed || !owner.parent || pickup.parent !== owner.parent)
        continue;
      const next = Math.hypot(pickup.x - owner.x, pickup.y - owner.y);
      if (
        next <= distance &&
        (!nearest || next < distance) &&
        this.options.canReach(owner, pickup)
      ) {
        nearest = pickup;
        distance = next;
      }
    }
    if (!nearest) {
      this.#result = 'nothing';
      return;
    }
    if (!this.options.inventory.add(nearest.item, nearest.quantity)) {
      this.#result = 'full';
      return;
    }
    nearest.dispose();
    this.#result = 'collected';
  }
  dispose(): undefined {
    this.#retired = true;
    this.#owner = null;
    this.#requested = false;
  }
  #assertLive(): void {
    if (this.#retired || !this.#owner || this.#owner.disposed)
      throw new Error('Interaction is detached or retired');
    this.options.body.assertOwner(this.#owner);
    this.options.inventory.assertOwner(this.#owner);
  }
}
