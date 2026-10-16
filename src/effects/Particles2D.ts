export interface Particle2D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  size: number;
  endSize?: number;
  ax?: number;
  ay?: number;
  color?: string;
}
export interface ParticleSample2D {
  x: number;
  y: number;
  size: number;
  opacity: number;
  color: string;
}
export function nonnegative(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${name} must be finite and nonnegative`);
  return value;
}
export function capacity(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000_000)
    throw new RangeError('capacity must be an integer from 1 to 1000000');
  return value;
}
/** Dense bounded storage. Scene updates once; any number of views can read it. */
export class Particles2D {
  readonly capacity: number;
  #data: Float64Array;
  #colors: string[];
  #count = 0;
  #disposed = false;
  #spawned = 0;
  #dropped = 0;
  constructor(limit = 2048) {
    this.capacity = capacity(limit);
    this.#data = new Float64Array(limit * 10);
    this.#colors = new Array<string>(limit);
  }
  get count() {
    return this.#count;
  }
  get disposed() {
    return this.#disposed;
  }
  get spawned() {
    return this.#spawned;
  }
  get dropped() {
    return this.#dropped;
  }
  #live() {
    if (this.#disposed) throw new Error('Particles disposed');
  }
  /** Omitted attempts count as drops without allocating or iterating. */
  drop(count: number): void {
    this.#live();
    if (!Number.isSafeInteger(count) || count < 0)
      throw new RangeError('Invalid drop count');
    this.#dropped += count;
  }
  spawn(p: Particle2D, age = 0): boolean {
    this.#live();
    const ax = p.ax ?? 0,
      ay = p.ay ?? 0,
      end = p.endSize ?? 0;
    if (![p.x, p.y, p.vx, p.vy, ax, ay].every(Number.isFinite))
      throw new RangeError('Particle motion must be finite');
    nonnegative(p.size, 'size');
    nonnegative(end, 'endSize');
    nonnegative(age, 'age');
    if (!Number.isFinite(p.life) || p.life <= 0)
      throw new RangeError('life must be positive');
    // A scheduled birth may have already expired during a long step.
    if (age >= p.life) return false;
    if (this.#count === this.capacity) {
      this.#dropped++;
      return false;
    }
    const i = this.#count++ * 10;
    const d = this.#data;
    d[i] = p.x + p.vx * age + (ax * age * age) / 2;
    d[i + 1] = p.y + p.vy * age + (ay * age * age) / 2;
    d[i + 2] = p.vx + ax * age;
    d[i + 3] = p.vy + ay * age;
    d[i + 4] = ax;
    d[i + 5] = ay;
    d[i + 6] = age;
    d[i + 7] = p.life;
    d[i + 8] = p.size;
    d[i + 9] = end;
    this.#colors[i / 10] = p.color ?? '#8ce6c9';
    this.#spawned++;
    return true;
  }
  update(dt: number): undefined {
    this.#live();
    nonnegative(dt, 'dt');
    const d = this.#data;
    for (let n = 0; n < this.#count;) {
      const i = n * 10;
      if (d[i + 6]! + dt >= d[i + 7]!) {
        this.#count--;
        d.copyWithin(i, this.#count * 10, this.#count * 10 + 10);
        this.#colors[n] = this.#colors[this.#count]!;
        this.#colors[this.#count] = '';
        continue;
      }
      d[i] = d[i]! + d[i + 2]! * dt + (d[i + 4]! * dt * dt) / 2;
      d[i + 1] = d[i + 1]! + d[i + 3]! * dt + (d[i + 5]! * dt * dt) / 2;
      d[i + 2] = d[i + 2]! + d[i + 4]! * dt;
      d[i + 3] = d[i + 3]! + d[i + 5]! * dt;
      d[i + 6] = d[i + 6]! + dt;
      n++;
    }
  }
  /** Copies into caller storage: no live arrays or per-particle draw allocations. */
  sample(index: number, out: ParticleSample2D): boolean {
    if (
      this.#disposed ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.#count
    )
      return false;
    const i = index * 10,
      d = this.#data,
      t = d[i + 6]! / d[i + 7]!;
    out.x = d[i]!;
    out.y = d[i + 1]!;
    out.size = d[i + 8]! + (d[i + 9]! - d[i + 8]!) * t;
    out.opacity = 1 - t;
    out.color = this.#colors[index]!;
    return true;
  }
  clear(): void {
    this.#live();
    this.#count = 0;
    this.#colors.fill('');
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#count = 0;
    this.#data = new Float64Array();
    this.#colors = [];
  }
}
