import { ResourceScope } from '../ResourceScope.js';
import type { Cleanup } from '../ResourceScope.js';
import type { Point, Scene } from '../types.js';

export interface ContextResource<T> {
  readonly value: T;
  dispose(): undefined;
}
export interface ContextLease<T> {
  /** Null while lost, after disposal, or when recreation failed. */
  readonly current: T | null;
  dispose(): undefined;
}
/** Optional DOM/context owner. Rocket's Presentation still owns rendering/time.
 * Immutable CPU assets belong outside manage(); only GPU generation resources go inside.
 */
export class WebGLSurface {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly scene: Scene;
  readonly #scope = new ResourceScope();
  readonly #events = new AbortController();
  readonly #bindings = new Set<{ create(): void; clear(): void }>();
  readonly #target: HTMLElement;
  readonly #error: (error: unknown) => void;
  #disposed = false;
  #lost = false;
  width = 1;
  height = 1;
  limited = false;
  #maxWidth = 1;
  #maxHeight = 1;
  constructor(options: {
    target: HTMLElement;
    scene: Scene;
    label?: string;
    attributes?: WebGLContextAttributes;
    onError?: (error: unknown) => void;
  }) {
    this.#target = options.target;
    this.scene = options.scene;
    this.#error =
      options.onError ??
      ((error) => {
        throw error;
      });
    const canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', options.label ?? 'WebGL viewport');
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      depth: true,
      ...options.attributes,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.canvas = canvas;
    this.gl = gl;
    this.#limits();
    options.target.append(canvas);
    canvas.addEventListener(
      'webglcontextlost',
      (event) => {
        event.preventDefault();
        this.#lost = true;
        const errors: unknown[] = [];
        for (const binding of [...this.#bindings])
          try {
            binding.clear();
          } catch (error) {
            errors.push(error);
          }
        if (errors.length)
          this.#error(new AggregateError(errors, 'Context retirement failed'));
      },
      { signal: this.#events.signal },
    );
    canvas.addEventListener(
      'webglcontextrestored',
      () => {
        this.#lost = false;
        this.#limits();
        for (const binding of [...this.#bindings]) {
          if (this.#disposed) break;
          try {
            binding.create();
          } catch (error) {
            this.#error(error);
          }
        }
      },
      { signal: this.#events.signal },
    );
  }
  get disposed() {
    return this.#disposed;
  }
  get lost() {
    return this.#lost || this.gl.isContextLost();
  }
  own<T extends Cleanup>(resource: T): T {
    return this.#scope.own(resource);
  }
  manage<T>(
    factory: (gl: WebGL2RenderingContext) => ContextResource<T>,
  ): ContextLease<T> {
    if (this.#disposed) throw new Error('Surface disposed');
    let resource: ContextResource<T> | null = null,
      disposed = false;
    const binding = {
      create: () => {
        if (!disposed && !this.lost) resource = factory(this.gl);
      },
      clear: () => {
        const previous = resource;
        resource = null;
        previous?.dispose();
      },
    };
    binding.create();
    this.#bindings.add(binding);
    return this.own({
      get current() {
        return resource?.value ?? null;
      },
      dispose: (): undefined => {
        if (disposed) return;
        disposed = true;
        this.#bindings.delete(binding);
        binding.clear();
      },
    });
  }
  /** Logical pointer coordinates; world/ray projection is deliberately caller-owned. */
  clientToWorld(point: Point): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((point.x - rect.left) * this.width) / rect.width,
      y: ((point.y - rect.top) * this.height) / rect.height,
    };
  }
  resize(scale = 1, aspect = 16 / 9): void {
    if (this.#disposed) throw new Error('Surface disposed');
    if (
      !Number.isFinite(scale) ||
      scale <= 0 ||
      !Number.isFinite(aspect) ||
      aspect <= 0
    )
      throw new Error('Invalid surface scale or aspect');
    if (this.lost) return;
    this.width = Math.max(1, this.#target.clientWidth);
    this.height = Math.max(1, Math.round(this.width / aspect));
    const ratio = (window.devicePixelRatio || 1) * scale;
    const w = Math.max(1, Math.round(this.width * ratio)),
      h = Math.max(1, Math.round(this.height * ratio));
    const fit = Math.min(1, this.#maxWidth / w, this.#maxHeight / h);
    this.limited = fit < 1;
    const width = Math.max(1, Math.floor(w * fit)),
      height = Math.max(1, Math.floor(h * fit));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
  }
  #limits() {
    const gl = this.gl;
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    const limit = Math.min(
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
      gl.getParameter(gl.MAX_TEXTURE_SIZE) as number,
    );
    this.#maxWidth = Math.min(viewport[0]!, limit);
    this.#maxHeight = Math.min(viewport[1]!, limit);
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#events.abort();
    try {
      this.#scope.dispose();
    } finally {
      this.canvas.remove();
      this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  }
}
