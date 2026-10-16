export type FramePhase =
  | 'generation'
  | 'domain'
  | 'camera'
  | 'stream'
  | 'artwork'
  | 'visuals'
  | 'hud'
  | 'render';
type Costs = Record<FramePhase, number>;
const costs = (): Costs => ({
  generation: 0,
  domain: 0,
  camera: 0,
  stream: 0,
  artwork: 0,
  visuals: 0,
  hud: 0,
  render: 0,
});
export interface FrameSpike {
  readonly frame: number;
  readonly intervalMs: number;
  readonly thresholdMs: number;
  readonly workMs: number;
  readonly costs: Readonly<Costs>;
  readonly chunks: number;
  readonly builds: number;
}

/** A gap is associated with the preceding frame's work and intervening generators. */
export class FrameSpikes {
  #current = costs();
  #intervals: number[] = [];
  #rows: FrameSpike[] = [];
  #active = false;
  #frame = 0;
  #chunks = 0;
  #builds = 0;
  #disposed = false;
  #revision = 0;
  constructor(private readonly now: () => number = () => performance.now()) {}
  get rows(): readonly FrameSpike[] {
    return Object.freeze([...this.#rows]);
  }
  get revision() {
    return this.#revision;
  }
  begin(dt: number, maxFps: number | null) {
    if (this.#disposed) return;
    if (dt <= 0) {
      this.reset();
      this.#active = true;
      return;
    }
    const intervalMs = dt * 1000;
    const sorted = [...this.#intervals].sort((a, b) => a - b);
    const typical =
      maxFps === null
        ? (sorted[Math.floor(sorted.length / 2)] ?? intervalMs)
        : 1000 / maxFps;
    const thresholdMs = Math.max(12, typical * 1.5);
    const workMs = Object.values(this.#current).reduce(
      (sum, value) => sum + value,
      0,
    );
    if (this.#active && (intervalMs > thresholdMs || workMs > 8)) {
      this.#rows.push(
        Object.freeze({
          frame: this.#frame,
          intervalMs,
          thresholdMs,
          workMs,
          costs: Object.freeze({ ...this.#current }),
          chunks: this.#chunks,
          builds: this.#builds,
        }),
      );
      if (this.#rows.length > 12) this.#rows.shift();
      this.#revision++;
    }
    this.#intervals.push(intervalMs);
    if (this.#intervals.length > 32) this.#intervals.shift();
    this.#current = costs();
    this.#chunks = this.#builds = 0;
    this.#active = true;
    this.#frame++;
  }
  measure<T>(phase: FramePhase, run: () => T): T {
    const started = this.now();
    try {
      return run();
    } finally {
      if (!this.#disposed && this.#active) {
        this.#current[phase] += Math.max(0, this.now() - started);
        if (phase === 'generation') this.#chunks++;
      }
    }
  }
  built(count: number) {
    if (!this.#disposed) this.#builds += count;
  }
  reset() {
    this.#current = costs();
    this.#intervals = [];
    this.#chunks = this.#builds = 0;
    this.#active = false;
  }
  clear() {
    this.#rows = [];
    this.#revision++;
    this.reset();
  }
  dispose(): undefined {
    this.clear();
    this.#disposed = true;
  }
}
