interface TimerExtension {
  readonly TIME_ELAPSED_EXT: number;
  readonly GPU_DISJOINT_EXT: number;
}

export interface GpuTimingStats {
  readonly status:
    'unsupported' | 'pending' | 'ready' | 'disjoint' | 'lost' | 'disposed';
  readonly averageMs: number | null;
  readonly maxMs: number | null;
  readonly samples: number;
  readonly pending: number;
}

/** Optional, asynchronous GPU elapsed-time queries. Owns no clock or render loop.
 * Call poll before begin on later frames. Exclusively owns TIME_ELAPSED queries.
 * A bounded queue skips measurements when the GPU falls behind; it never waits.
 */
export class WebGLGpuTimer {
  readonly #gl: WebGL2RenderingContext;
  readonly #extension: TimerExtension | null;
  #active: WebGLQuery | null = null;
  #pending: WebGLQuery[] = [];
  #samples: number[] = [];
  #status: GpuTimingStats['status'];

  constructor(gl: WebGL2RenderingContext) {
    this.#gl = gl;
    this.#extension = gl.getExtension(
      'EXT_disjoint_timer_query_webgl2',
    ) as TimerExtension | null;
    this.#status = this.#extension ? 'pending' : 'unsupported';
  }

  get stats(): GpuTimingStats {
    return Object.freeze({
      status: this.#status,
      averageMs: this.#samples.length
        ? this.#samples.reduce((a, b) => a + b, 0) / this.#samples.length
        : null,
      maxMs: this.#samples.length ? Math.max(...this.#samples) : null,
      samples: this.#samples.length,
      pending: this.#pending.length,
    });
  }

  poll(): void {
    if (this.#status === 'disposed' || !this.#extension) return;
    const gl = this.#gl;
    if (gl.isContextLost()) {
      this.#clear();
      this.#status = 'lost';
      return;
    }
    if (gl.getParameter(this.#extension.GPU_DISJOINT_EXT)) {
      this.#clear();
      this.#status = 'disjoint';
      return;
    }
    while (this.#pending.length) {
      const query = this.#pending[0]!;
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) break;
      const ns: unknown = gl.getQueryParameter(query, gl.QUERY_RESULT);
      gl.deleteQuery(query);
      this.#pending.shift();
      if (typeof ns === 'number' && Number.isFinite(ns) && ns >= 0) {
        this.#samples.push(ns / 1e6);
        if (this.#samples.length > 32) this.#samples.shift();
        this.#status = 'ready';
      }
    }
  }

  begin(): boolean {
    if (
      !this.#extension ||
      this.#status === 'disposed' ||
      this.#status === 'lost' ||
      this.#active ||
      this.#pending.length >= 4 ||
      this.#gl.isContextLost()
    )
      return false;
    const query = this.#gl.createQuery();
    if (!query) return false;
    this.#gl.beginQuery(this.#extension.TIME_ELAPSED_EXT, query);
    this.#active = query;
    return true;
  }

  end(): void {
    if (!this.#active || !this.#extension) return;
    if (!this.#gl.isContextLost())
      this.#gl.endQuery(this.#extension.TIME_ELAPSED_EXT);
    this.#pending.push(this.#active);
    this.#active = null;
  }

  dispose(): void {
    if (this.#status === 'disposed') return;
    this.#clear();
    this.#status = 'disposed';
  }

  #clear(): void {
    if (this.#active) {
      if (!this.#gl.isContextLost() && this.#extension)
        this.#gl.endQuery(this.#extension.TIME_ELAPSED_EXT);
      this.#gl.deleteQuery(this.#active);
      this.#active = null;
    }
    for (const query of this.#pending) this.#gl.deleteQuery(query);
    this.#pending = [];
    this.#samples = [];
  }
}
