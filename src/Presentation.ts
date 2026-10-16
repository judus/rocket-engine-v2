import type { Frame, Scene } from './types.js';
import { assertSynchronous, invokeSynchronous } from './synchronous.js';

export interface PresentationOptions {
  readonly scene: Scene;
  readonly render: (frame: Frame) => undefined;
  readonly dispose?: () => undefined;
}
/** App-owned backend-neutral render slot. No canvas, context or clock of its own. */
export class Presentation {
  #options: PresentationOptions | null;
  #onDispose: (() => void) | undefined;
  constructor(options: PresentationOptions, onDispose?: () => void) {
    assertSynchronous(options.render, 'presentation.render');
    if (typeof options.render !== 'function')
      throw new TypeError('presentation.render is required');
    assertSynchronous(options.dispose, 'presentation.dispose');
    this.#options = { ...options };
    this.#onDispose = onDispose;
  }
  get scene(): Scene | null {
    return this.#options?.scene ?? null;
  }
  get disposed(): boolean {
    return this.#options === null;
  }
  render(frame: Frame): undefined {
    if (this.#options)
      invokeSynchronous(
        this.#options.render,
        undefined,
        [frame],
        'presentation.render',
      );
  }
  dispose(): undefined {
    const options = this.#options;
    if (!options) return;
    this.#options = null;
    try {
      invokeSynchronous(options.dispose, undefined, [], 'presentation.dispose');
    } finally {
      this.#onDispose?.();
      this.#onDispose = undefined;
    }
  }
}
