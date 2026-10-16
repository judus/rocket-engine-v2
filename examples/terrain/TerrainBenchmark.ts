import { chunkSize } from '../streaming/ChunkStream.js';
import type { TileBounds, TileState } from '../streaming/ChunkStream.js';
/** Fixed camera stops in tile coordinates; wall time, not clamped simulation dt. */
export const benchmarkStops = [
  { x: -64, y: -48 },
  { x: 96, y: -48 },
  { x: 192, y: 64 },
  { x: 64, y: 144 },
  { x: -96, y: 64 },
  { x: -64, y: -48 },
] as const;
export const stopMs = 2000,
  settleMs = 15000;
export function demandedChunks(bounds: readonly TileBounds[]) {
  const cells = new Map<string, { x: number; y: number }>();
  for (const b of bounds)
    for (
      let y = Math.floor(b.minY / chunkSize);
      y < Math.ceil(b.maxY / chunkSize);
      y++
    )
      for (
        let x = Math.floor(b.minX / chunkSize);
        x < Math.ceil(b.maxX / chunkSize);
        x++
      )
        cells.set(`${x},${y}`, { x, y });
  return [...cells.values()];
}
/** Bounded metrics: fixed histogram + one camera stop's pending chunks, no frame history. */
export class TerrainBenchmark {
  #start: number | null = null;
  #last: number | null = null;
  #stop = -1;
  #stopStart = 0;
  #frames = 0;
  #sum = 0;
  #max = 0;
  #over16 = 0;
  #over33 = 0;
  #over50 = 0;
  #histogram = new Uint32Array(501);
  #pending = new Map<string, { x: number; y: number }>();
  #requested = 0;
  #ready = 0;
  #latency = 0;
  #maxLatency = 0;
  #missed = 0;
  #stops: {
    stop: number;
    requested: number;
    ready: number;
    allReadyMs: number | null;
  }[] = [];
  #state: 'running' | 'complete' | 'invalid' = 'running';
  #reason = '';
  #ended = 0;
  get active() {
    return this.#state === 'running';
  }
  get stop() {
    return this.#stop;
  }
  /** Return new stop index only when camera demand must change. */
  advance(now: number): number | null {
    if (!this.active) return null;
    if (this.#start === null) this.#start = now;
    if (this.#last !== null) {
      const gap = now - this.#last;
      if (!Number.isFinite(gap) || gap < 0) {
        this.invalidate('Clock changed');
        return null;
      }
      this.#frames++;
      this.#sum += gap;
      this.#max = Math.max(this.#max, gap);
      if (gap > 1000 / 60) this.#over16++;
      if (gap > 1000 / 30) this.#over33++;
      if (gap > 50) this.#over50++;
      this.#histogram[Math.min(500, Math.ceil(gap))]!++;
    }
    this.#last = now;
    const next = Math.min(
      benchmarkStops.length - 1,
      Math.floor((now - this.#start) / stopMs),
    );
    if (next > this.#stop + 1) {
      this.invalidate('A frame skipped an entire camera stop');
      return null;
    }
    if (next === this.#stop) return null;
    this.#missed += this.#pending.size;
    this.#pending.clear();
    this.#stop = next;
    this.#stopStart = now;
    this.#stops.push({ stop: next, requested: 0, ready: 0, allReadyMs: null });
    return next;
  }
  demand(bounds: readonly TileBounds[]) {
    const cells = demandedChunks(bounds);
    if (cells.length > 240) {
      this.invalidate('Demand exceeds the shared chunk bound');
      return;
    }
    const stop = this.#stops.at(-1);
    if (!stop) return;
    stop.requested = cells.length;
    this.#requested += cells.length;
    for (const c of cells) this.#pending.set(`${c.x},${c.y}`, c);
  }
  observe(now: number, read: (cell: { x: number; y: number }) => TileState) {
    if (!this.active || this.#start === null) return;
    const stop = this.#stops.at(-1);
    if (!stop) return;
    for (const [key, c] of this.#pending) {
      const state = read({ x: c.x * chunkSize, y: c.y * chunkSize });
      if (state.state === 'failed') {
        this.invalidate('A demanded chunk failed');
        return;
      }
      if (state.state !== 'ready') continue;
      const ms = now - this.#stopStart;
      this.#ready++;
      stop.ready++;
      this.#latency += ms;
      this.#maxLatency = Math.max(this.#maxLatency, ms);
      this.#pending.delete(key);
    }
    if (!this.#pending.size && stop.allReadyMs === null)
      stop.allReadyMs = now - this.#stopStart;
    const elapsed = now - this.#start;
    if (elapsed >= benchmarkStops.length * stopMs && !this.#pending.size) {
      this.#state = 'complete';
      this.#ended = now;
    } else if (elapsed >= benchmarkStops.length * stopMs + settleMs)
      this.invalidate('Final stop readiness timed out');
  }
  invalidate(reason: string) {
    if (!this.active) return;
    this.#state = 'invalid';
    this.#reason = reason;
    this.#ended = this.#last ?? 0;
  }
  get result() {
    let count = 0,
      p95 = 0;
    for (let i = 0; i < this.#histogram.length; i++) {
      count += this.#histogram[i] ?? 0;
      if (count >= Math.ceil(this.#frames * 0.95)) {
        p95 = i;
        break;
      }
    }
    return {
      state: this.#state,
      reason: this.#reason,
      stop: this.#stop + 1,
      elapsedMs:
        this.#start === null
          ? 0
          : (this.active ? (this.#last ?? this.#start) : this.#ended) -
            this.#start,
      frames: this.#frames,
      meanFrameMs: this.#frames ? this.#sum / this.#frames : 0,
      maxFrameMs: this.#max,
      p95FrameMsUpper: p95 === 500 ? null : p95,
      p95Over499ms: p95 === 500,
      over16ms: this.#over16,
      over33ms: this.#over33,
      over50ms: this.#over50,
      requested: this.#requested,
      ready: this.#ready,
      unfinishedAtStop: this.#missed,
      pending: this.#pending.size,
      meanReadyMs: this.#ready ? this.#latency / this.#ready : 0,
      maxReadyMs: this.#maxLatency,
      stops: this.#stops.map((s) => ({ ...s })),
    };
  }
}
