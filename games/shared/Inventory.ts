import type { Behavior, Node2D } from '../../src/index.js';

export function validateStack(item: string, quantity: number): void {
  if (typeof item !== 'string' || !item.trim())
    throw new TypeError('Item ID must be nonempty');
  if (!Number.isSafeInteger(quantity) || quantity <= 0)
    throw new RangeError('Item quantity must be a positive safe integer');
}

/** Small game-example capability: capacity counts item units, independent of movement or physics. */
export class Inventory implements Behavior {
  readonly capacity: number;
  #items = new Map<string, number>();
  #used = 0;
  #owner: Node2D | null = null;
  #retired = false;
  constructor({ capacity }: { capacity: number }) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0)
      throw new RangeError(
        'Inventory capacity must be a positive safe integer',
      );
    this.capacity = capacity;
  }
  get used() {
    return this.#used;
  }
  get entries(): readonly Readonly<{ item: string; quantity: number }>[] {
    return Object.freeze(
      [...this.#items].map(([item, quantity]) =>
        Object.freeze({ item, quantity }),
      ),
    );
  }
  count(item: string): number {
    validateStack(item, 1);
    return this.#items.get(item) ?? 0;
  }
  onAttach(node: Node2D): undefined {
    if (this.#owner || this.#retired)
      throw new Error('Inventory already attached or retired');
    this.#owner = node;
  }
  assertOwner(node: Node2D): void {
    this.#assertLive();
    if (this.#owner !== node) throw new Error('Inventory owner mismatch');
  }
  add(item: string, quantity = 1): boolean {
    this.#assertLive();
    validateStack(item, quantity);
    if (quantity > this.capacity - this.#used) return false;
    this.#items.set(item, (this.#items.get(item) ?? 0) + quantity);
    this.#used += quantity;
    return true;
  }
  remove(item: string, quantity = 1): boolean {
    this.#assertLive();
    validateStack(item, quantity);
    const available = this.#items.get(item) ?? 0;
    if (quantity > available) return false;
    if (quantity === available) this.#items.delete(item);
    else this.#items.set(item, available - quantity);
    this.#used -= quantity;
    return true;
  }
  dispose(): undefined {
    this.#retired = true;
    this.#owner = null;
  }
  #assertLive(): void {
    if (this.#retired || !this.#owner || this.#owner.disposed)
      throw new Error('Inventory is detached or retired');
  }
}
