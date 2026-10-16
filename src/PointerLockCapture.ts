import type { Point } from './types.js';
export type CaptureState =
  'released' | 'requesting' | 'captured' | 'error' | 'unavailable';

/** Explicit browser mouse capture; no simulation, actions, UI or clock ownership.
 * Request from a user gesture. Browser pointerlockchange is authoritative.
 */
export class PointerLockCapture {
  #state: CaptureState = 'released';
  #wanted = false;
  #disposed = false;
  #pending = false;
  #error = '';
  #x = 0;
  #y = 0;
  #cleanups: (() => void)[] = [];
  readonly #document: Document;
  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly changed: () => void = () => {},
  ) {
    this.#document = canvas.ownerDocument;
    const listen = (
      target: EventTarget,
      type: string,
      callback: EventListener,
    ) => {
      target.addEventListener(type, callback);
      this.#cleanups.push(() => target.removeEventListener(type, callback));
    };
    listen(this.#document, 'pointerlockchange', () => {
      if (this.#document.pointerLockElement === canvas) {
        if (!this.#wanted || this.#disposed) {
          this.release();
          return;
        }
        canvas.focus({ preventScroll: true });
        this.#set('captured');
      } else {
        this.#wanted = false;
        this.#set('released');
      }
    });
    listen(this.#document, 'pointerlockerror', () => {
      if (this.#wanted) {
        this.#wanted = false;
        this.#error = 'The browser refused mouse capture';
        this.#set('error');
      }
    });
    listen(this.#document, 'mousemove', (raw) => {
      if (!this.active) return;
      const event = raw as MouseEvent;
      if (![event.movementX, event.movementY].every(Number.isFinite)) return;
      this.#x += event.movementX;
      this.#y += event.movementY;
    });
    listen(this.#document, 'keydown', (raw) => {
      if ((raw as KeyboardEvent).code === 'Escape' && this.active)
        this.release();
    });
    listen(this.#document, 'visibilitychange', () => {
      if (this.#document.hidden) this.release();
    });
    if (this.#document.defaultView)
      listen(this.#document.defaultView, 'blur', () => this.release());
    listen(canvas, 'webglcontextlost', () => this.release());
    if (!canvas.requestPointerLock) this.#state = 'unavailable';
  }
  get reason(): string {
    return this.#error;
  }
  get state(): CaptureState {
    return this.#state;
  }
  get active(): boolean {
    return (
      !this.#disposed &&
      this.#state === 'captured' &&
      this.#document.pointerLockElement === this.canvas
    );
  }
  #set(state: CaptureState): void {
    this.#x = this.#y = 0;
    if (this.#state === state) return;
    this.#state = state;
    this.changed();
  }
  async request(): Promise<void> {
    if (this.#disposed || this.#pending || this.active) return;
    if (!this.canvas.requestPointerLock) {
      this.#set('unavailable');
      return;
    }
    this.#wanted = true;
    this.#error = '';
    this.#pending = true;
    this.#set('requesting');
    this.canvas.focus({ preventScroll: true });
    try {
      await this.canvas.requestPointerLock();
      // A granted request can arrive after release/disposal. Never recapture silently.
      if (
        (!this.#wanted || this.#disposed) &&
        this.#document.pointerLockElement === this.canvas
      )
        this.#document.exitPointerLock();
    } catch (error) {
      if (this.#wanted && !this.#disposed) {
        this.#error = String(error);
        this.#wanted = false;
        this.#set('error');
      }
    } finally {
      this.#pending = false;
    }
  }
  consumeMovement(): Point {
    const result = { x: this.#x, y: this.#y };
    this.#x = this.#y = 0;
    return result;
  }
  release(): void {
    this.#wanted = false;
    if (this.#document.pointerLockElement === this.canvas)
      this.#document.exitPointerLock();
    this.#set(
      typeof this.canvas.requestPointerLock === 'function'
        ? 'released'
        : 'unavailable',
    );
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    this.release();
    for (const cleanup of this.#cleanups.reverse()) cleanup();
    this.#cleanups = [];
  }
}
