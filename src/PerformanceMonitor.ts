import type { PerformanceStats } from './types.js';
/** Rolling half-second averages of application frame cadence and CPU work. */
export class PerformanceMonitor {
  #seconds = 0;
  #frames = 0;
  #updateMs = 0;
  #renderMs = 0;
  #maxFrameMs = 0;
  #minFrameMs = Infinity;
  #squaredFrameMs = 0;
  #stats: PerformanceStats = Object.freeze({
    fps: null,
    frameMs: null,
    maxFrameMs: null,
    minFrameMs: null,
    frameJitterMs: null,
    updateMs: null,
    renderMs: null,
  });

  constructor() {
    this.reset();
  }

  get stats() {
    return this.#stats;
  }

  reset() {
    this.#seconds = this.#frames = this.#updateMs = this.#renderMs = 0;
    this.#maxFrameMs = this.#squaredFrameMs = 0;
    this.#minFrameMs = Infinity;
    this.#stats = Object.freeze({
      fps: null,
      frameMs: null,
      maxFrameMs: null,
      minFrameMs: null,
      frameJitterMs: null,
      updateMs: null,
      renderMs: null,
    });
  }

  record(dt: number, updateMs: number, renderMs: number) {
    // The first frame after starting/resuming has no cadence interval to measure.
    if (dt <= 0) return;
    this.#seconds += dt;
    this.#frames++;
    const frameMs = dt * 1000;
    this.#maxFrameMs = Math.max(this.#maxFrameMs, frameMs);
    this.#minFrameMs = Math.min(this.#minFrameMs, frameMs);
    this.#squaredFrameMs += frameMs * frameMs;
    this.#updateMs += updateMs;
    this.#renderMs += renderMs;
    if (this.#seconds < 0.5 - 1e-9) return;
    this.#stats = Object.freeze({
      fps: this.#frames / this.#seconds,
      frameMs: (this.#seconds * 1000) / this.#frames,
      maxFrameMs: this.#maxFrameMs,
      minFrameMs: this.#minFrameMs,
      frameJitterMs: Math.sqrt(
        Math.max(
          0,
          this.#squaredFrameMs / this.#frames -
            ((this.#seconds * 1000) / this.#frames) ** 2,
        ),
      ),
      updateMs: this.#updateMs / this.#frames,
      renderMs: this.#renderMs / this.#frames,
    });
    this.#seconds = this.#frames = this.#updateMs = this.#renderMs = 0;
    this.#maxFrameMs = this.#squaredFrameMs = 0;
    this.#minFrameMs = Infinity;
  }
}
