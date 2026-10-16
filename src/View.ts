import { ResourceScope } from './ResourceScope.js';
import type { Cleanup } from './ResourceScope.js';
import type { Frame, Point, Scene, Matrix2D } from './types.js';
import { Camera2D, transformPoint, inversePoint } from './Camera2D.js';
import { assertSynchronous, invokeSynchronous } from './synchronous.js';

function positive(value: number, name: string) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be positive and finite`);
  }
  return value;
}

export interface ViewOptions {
  target: string | Element;
  scene: Scene;
  width?: number;
  height?: number;
  pixelRatio?: number;
  pixelSnap?: boolean;
  overlay?: (
    this: View,
    ctx: CanvasRenderingContext2D,
    frame: Frame,
  ) => undefined;
}

/** Application-owned Canvas 2D presentation of a shared scene. */
export class View {
  #resources = new ResourceScope();
  #context: CanvasRenderingContext2D | null;
  #disposed = false;
  #width: number;
  #height: number;
  #pixelRatio: number | undefined;
  #pixelSnap = false;
  #overlay: ViewOptions['overlay'];
  #scene: Scene | null;
  #canvas: HTMLCanvasElement;
  #camera: Camera2D;
  #onDispose: (() => void) | undefined;

  constructor(
    {
      target,
      scene,
      width = 600,
      height = 400,
      pixelRatio,
      pixelSnap = false,
      overlay,
    }: ViewOptions,
    onDispose?: () => void,
  ) {
    const container =
      typeof target === 'string' ? document.querySelector(target) : target;
    if (!container || typeof container.appendChild !== 'function') {
      throw new TypeError(
        'view target must be a container element or matching selector',
      );
    }
    assertSynchronous(overlay, 'overlay');
    this.#onDispose = onDispose;
    this.#width = positive(width, 'width');
    this.#height = positive(height, 'height');
    this.#pixelRatio =
      pixelRatio === undefined ? undefined : positive(pixelRatio, 'pixelRatio');
    this.pixelSnap = pixelSnap;
    this.#overlay = overlay;
    this.#scene = scene;
    this.#camera = new Camera2D();
    this.#canvas = container.ownerDocument.createElement('canvas');
    this.#context = this.canvas.getContext('2d');
    if (!this.#context) throw new Error('Canvas 2D is unavailable');
    this.#syncSize();
    container.appendChild(this.canvas);
  }

  get disposed() {
    return this.#disposed;
  }
  get scene() {
    return this.#scene;
  }
  get canvas() {
    return this.#canvas;
  }
  get camera() {
    return this.#camera;
  }
  get width() {
    return this.#width;
  }
  get height() {
    return this.#height;
  }
  /** Snap presentation translation only, in backing-canvas pixels. */
  get pixelSnap() {
    return this.#pixelSnap;
  }
  set pixelSnap(value: boolean) {
    if (typeof value !== 'boolean')
      throw new TypeError('pixelSnap must be a boolean');
    this.#pixelSnap = value;
  }

  own<T extends Cleanup>(resource: T): T {
    this.#assertLive();
    return this.#resources.own(resource);
  }

  resize(width: number, height: number) {
    this.#assertLive();
    positive(width, 'width');
    positive(height, 'height');
    this.#width = width;
    this.#height = height;
    this.#syncSize();
  }

  /** Browser client to logical canvas coordinates, including CSS scaling. */
  clientToScreen({ x, y }: Point): Point {
    this.#assertLive();
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height)
      throw new Error('Cannot pick a zero-sized canvas');
    return {
      x: ((x - rect.left) * this.#width) / rect.width,
      y: ((y - rect.top) * this.#height) / rect.height,
    };
  }
  clientToWorld(point: Point): Point {
    return this.screenToWorld(this.clientToScreen(point));
  }
  /** These conversions use the actual presentation, including pixel snapping. */
  screenToWorld(point: Point): Point {
    this.#assertLive();
    const ratio = this.#ratio();
    return inversePoint(this.#transform(ratio), {
      x: point.x * ratio,
      y: point.y * ratio,
    });
  }
  worldToScreen(point: Point): Point {
    this.#assertLive();
    const ratio = this.#ratio();
    const result = transformPoint(this.#transform(ratio), point);
    return { x: result.x / ratio, y: result.y / ratio };
  }
  /** Conservative world AABB of all four rendered viewport corners. */
  get worldBounds() {
    const corners = [
      { x: 0, y: 0 },
      { x: this.width, y: 0 },
      { x: 0, y: this.height },
      { x: this.width, y: this.height },
    ].map((point) => this.screenToWorld(point));
    return {
      minX: Math.min(...corners.map((p) => p.x)),
      minY: Math.min(...corners.map((p) => p.y)),
      maxX: Math.max(...corners.map((p) => p.x)),
      maxY: Math.max(...corners.map((p) => p.y)),
    };
  }

  render(frame: Frame) {
    if (this.#disposed) return;
    const ratio = this.#syncSize();
    const ctx = this.#context;
    const scene = this.#scene;
    if (!ctx || !scene) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    try {
      ctx.beginPath();
      ctx.setTransform(...this.#transform(ratio));
      invokeSynchronous(scene.draw, scene, [ctx, frame], 'scene.draw');
    } finally {
      ctx.restore();
    }
    if (this.#disposed) return;
    if (this.#overlay) {
      ctx.save();
      try {
        ctx.beginPath();
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        invokeSynchronous(this.#overlay, this, [ctx, frame], 'overlay');
      } finally {
        ctx.restore();
      }
    }
  }

  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    const errors: unknown[] = [];
    try {
      this.#resources.dispose();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.canvas.remove();
    } catch (error) {
      errors.push(error);
    } finally {
      this.canvas.width = 0;
      this.canvas.height = 0;
      this.#overlay = undefined;
      this.#context = null;
      this.#scene = null;
      this.#onDispose?.();
      this.#onDispose = undefined;
    }
    if (errors.length) throw new AggregateError(errors, 'View cleanup failed');
  }

  #assertLive() {
    if (this.#disposed) throw new Error('View is disposed');
  }

  #syncSize() {
    const ratio =
      this.#pixelRatio ??
      positive(globalThis.devicePixelRatio ?? 1, 'devicePixelRatio');
    const width = Math.max(1, Math.round(this.#width * ratio));
    const height = Math.max(1, Math.round(this.#height * ratio));
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    this.canvas.style.width = `${this.#width}px`;
    this.canvas.style.height = `${this.#height}px`;
    return ratio;
  }
  #ratio() {
    return (
      this.#pixelRatio ??
      positive(globalThis.devicePixelRatio ?? 1, 'devicePixelRatio')
    );
  }
  #transform(ratio: number): Matrix2D {
    const matrix = this.camera.matrixAt(ratio);
    if (this.#pixelSnap) {
      matrix[4] = Math.round(matrix[4]);
      matrix[5] = Math.round(matrix[5]);
    }
    return matrix;
  }
}
