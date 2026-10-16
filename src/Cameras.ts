import type { Point, Frame, Scene } from './types.js';
import type { View } from './View.js';

export interface CameraOptions {
  /** Logical screen pixels/second, independent of zoom. Default 320. */
  speed?: number;
  /** Velocity response per second; zero disables inertia. Default 12. */
  inertia?: number;
  minZoom?: number;
  maxZoom?: number;
  wheel?: boolean;
}
function finite(value: number, name: string) {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
}
/** Optional app service; each bound controller and wheel listener belongs to its view. */
export class Cameras {
  #controllers = new Map<View, CameraController>();
  #running = false;
  #scenes: ReadonlySet<Scene> | undefined;
  #disposed = false;
  get size() {
    return this.#controllers.size;
  }
  bind(view: View, options: CameraOptions = {}): CameraController {
    if (this.#disposed) throw new Error('Cameras disposed');
    if (view.disposed) throw new Error('View is disposed');
    if (this.#controllers.has(view))
      throw new Error('View already has a camera controller');
    const controller = new CameraController(
      view,
      options,
      () =>
        this.#running &&
        (!this.#scenes ||
          (view.scene !== null && this.#scenes.has(view.scene))),
      () => {
        this.#controllers.delete(view);
      },
    );
    this.#controllers.set(view, controller);
    return view.own(controller);
  }
  start(scenes?: ReadonlySet<Scene>): undefined {
    this.#scenes = scenes;
    this.#running = true;
  }
  beforeUpdate(_frame: Frame, scenes: ReadonlySet<Scene>): undefined {
    this.#scenes = scenes;
    for (const [view, controller] of this.#controllers)
      if (!view.scene || !scenes.has(view.scene)) controller.resetMotion();
  }
  stop(): undefined {
    this.#running = false;
    for (const controller of this.#controllers.values())
      controller.resetMotion();
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.stop();
    this.#disposed = true;
    for (const controller of [...this.#controllers.values()])
      controller.dispose();
  }
}
/** Caller updates once in the scene, before picking and demand calculation. No RAF or clock. */
export class CameraController {
  #vx = 0;
  #vy = 0;
  #disposed = false;
  #pending: { client: Point; delta: number } | null = null;
  readonly #speed: number;
  readonly #inertia: number;
  readonly #min: number;
  readonly #max: number;
  constructor(
    readonly view: View,
    options: CameraOptions,
    private readonly active: () => boolean,
    private readonly release: () => void,
  ) {
    this.#speed = finite(options.speed ?? 320, 'speed');
    this.#inertia = finite(options.inertia ?? 12, 'inertia');
    this.#min = finite(options.minZoom ?? 0.5, 'minZoom');
    this.#max = finite(options.maxZoom ?? 4, 'maxZoom');
    if (
      this.#speed < 0 ||
      this.#inertia < 0 ||
      this.#min <= 0 ||
      this.#max < this.#min
    )
      throw new RangeError('Invalid camera options');
    if (options.wheel !== false)
      view.canvas.addEventListener('wheel', this.#wheel, { passive: false });
  }
  #wheel = (event: WheelEvent) => {
    if (this.#disposed || !this.active()) return;
    if (!Number.isFinite(event.deltaY)) return;
    event.preventDefault();
    // Coalesce into one bounded request. DOM events never mutate the camera mid-frame.
    const unit =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.view.height : 1;
    this.#pending = {
      client: { x: event.clientX, y: event.clientY },
      delta: Math.max(
        -1000,
        Math.min(1000, (this.#pending?.delta ?? 0) + event.deltaY * unit),
      ),
    };
  };
  get disposed() {
    return this.#disposed;
  }
  resetMotion(): void {
    this.#vx = this.#vy = 0;
    this.#pending = null;
  }
  #live() {
    if (this.#disposed || this.view.disposed)
      throw new Error('Camera controller disposed');
  }
  zoomAt(zoom: number, screen: Point): void {
    this.#live();
    finite(zoom, 'zoom');
    finite(screen.x, 'anchor.x');
    finite(screen.y, 'anchor.y');
    if (zoom <= 0) throw new RangeError('Zoom must be positive');
    const before = this.view.screenToWorld(screen);
    this.view.camera.zoom = Math.max(this.#min, Math.min(this.#max, zoom));
    const after = this.view.screenToWorld(screen);
    this.view.camera.x += before.x - after.x;
    this.view.camera.y += before.y - after.y;
  }
  update(dt: number, direction: Point = { x: 0, y: 0 }): void {
    this.#live();
    finite(dt, 'dt');
    finite(direction.x, 'direction.x');
    finite(direction.y, 'direction.y');
    if (dt < 0) throw new RangeError('dt must be nonnegative');
    if (!this.active()) return;
    if (this.#pending) {
      const request = this.#pending;
      this.#pending = null;
      this.zoomAt(
        this.view.camera.zoom * Math.exp(-request.delta * 0.0015),
        this.view.clientToScreen(request.client),
      );
    }
    const length = Math.max(1, Math.hypot(direction.x, direction.y));
    const tx = (direction.x / length) * this.#speed,
      ty = (direction.y / length) * this.#speed;
    const decay = Math.exp(-this.#inertia * dt);
    const movement = (velocity: number, target: number) =>
      this.#inertia === 0
        ? target * dt
        : target * dt + ((velocity - target) * (1 - decay)) / this.#inertia;
    // Integrate in screen units; convert through the camera inverse's linear part.
    const origin = this.view.camera.screenToWorld({ x: 0, y: 0 });
    const moved = this.view.camera.screenToWorld({
      x: movement(this.#vx, tx),
      y: movement(this.#vy, ty),
    });
    this.view.camera.x += moved.x - origin.x;
    this.view.camera.y += moved.y - origin.y;
    this.#vx = this.#inertia === 0 ? tx : tx + (this.#vx - tx) * decay;
    this.#vy = this.#inertia === 0 ? ty : ty + (this.#vy - ty) * decay;
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.resetMotion();
    this.view.canvas.removeEventListener('wheel', this.#wheel);
    this.release();
  }
}
