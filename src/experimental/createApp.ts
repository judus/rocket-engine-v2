import { Rocket } from '../Rocket.js';
import type { RocketOptions } from '../Rocket.js';
import { Stage2D } from './Stage2D.js';
import type { StageOptions } from './Stage2D.js';

export interface AppOptions extends StageOptions {
  target?: string | HTMLElement;
  width?: number;
  height?: number;
  autoStart?: boolean;
  runtime?: RocketOptions;
}
/** Experimental implicit Scene2D + View convenience; underlying objects stay public. */
export function createApp({
  target,
  width = 800,
  height = 450,
  autoStart = true,
  runtime = {},
  ...hooks
}: AppOptions = {}) {
  const ownedTarget =
    target === undefined ? document.createElement('div') : null;
  const stage = new Stage2D(hooks);
  const engine = new Rocket(runtime);
  try {
    if (ownedTarget) document.body.appendChild(ownedTarget);
    const scene = engine.scene({
      prepare: (context: { signal: AbortSignal }) => stage.prepare(context),
      update(dt, frame): undefined {
        stage.update(dt, frame);
      },
      draw(ctx, frame): undefined {
        stage.drawWorld(ctx, frame, view.camera);
      },
      dispose(): undefined {
        try {
          stage.dispose();
        } finally {
          ownedTarget?.remove();
        }
      },
    });
    const view = engine.view({
      target: target ?? ownedTarget!,
      width,
      height,
      scene,
      overlay(ctx, frame): undefined {
        stage.drawScreen(ctx, frame);
      },
    });
    let paused = false;
    const ready = autoStart
      ? Promise.resolve().then(() => (paused ? undefined : engine.start()))
      : Promise.resolve();
    // Mark handled for callback-only use; awaiting ready still observes its rejection.
    void ready.catch(
      runtime.onError ?? ((error: unknown) => console.error(error)),
    );
    return {
      engine,
      stage,
      view,
      ready,
      pause: () => {
        paused = true;
        engine.stop();
      },
      resume: () => {
        paused = false;
        return engine.start();
      },
      dispose: () => {
        paused = true;
        return engine.dispose();
      },
    };
  } catch (error) {
    stage.dispose();
    ownedTarget?.remove();
    void engine.dispose();
    throw error;
  }
}
