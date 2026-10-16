import type { ActionKind } from './ActionContext.js';

/** One device/control's contribution to named actions; no synthetic DOM events. */
export class ActionSource {
  #values = new Map<string, number>();
  #pressed = new Set<string>();
  #disposed = false;
  constructor(
    readonly kind: (name: string) => ActionKind,
    readonly enabled: () => boolean,
    readonly retired: () => void,
    readonly onReset: () => void = () => {},
  ) {}
  set(name: string, value: number): void {
    if (this.#disposed) throw new Error('Action source is disposed');
    const kind = this.kind(name);
    if (
      !Number.isFinite(value) ||
      Math.abs(value) > 1 ||
      (kind !== 'axis' && value !== 0 && value !== 1)
    )
      throw new Error(
        'Action source requires a normalized axis or binary button',
      );
    if (!this.enabled()) return;
    if (kind !== 'axis' && value && !this.value(name)) this.#pressed.add(name);
    this.#values.set(name, value);
  }
  value(name: string): number {
    return this.#values.get(name) ?? 0;
  }
  pressed(name: string): boolean {
    return this.#pressed.has(name);
  }
  /** Engine frame hook: retain short press edges until dispatch. */
  finishFrame(): void {
    this.#pressed.clear();
  }
  release(): void {
    this.#values.clear();
    this.onReset();
  }
  clear(): void {
    this.#values.clear();
    this.#pressed.clear();
    this.onReset();
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    try {
      this.clear();
    } finally {
      this.retired();
    }
  }
}
