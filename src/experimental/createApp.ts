import { Rocket } from '../Rocket.js';
import type { RocketOptions } from '../Rocket.js';
import { Input } from '../Input.js';
import type { InputTarget } from '../Input.js';
import type { View } from '../View.js';
import { Stage2D } from './Stage2D.js';
import type { StageOptions } from './Stage2D.js';
import { SceneNavigator } from './SceneNavigator.js';

export interface StageRoute {
  create: () => Stage2D;
  retain?: boolean;
}
export interface AppOptions extends Omit<StageOptions, 'fixed'> {
  target?: string | HTMLElement;
  width?: number;
  height?: number;
  autoStart?: boolean;
  runtime?: RocketOptions;
}
/** Single-canvas facade. Navigation and direct drawing share one activation contract. */
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
  const initial = new Stage2D({ ...hooks, fixed: runtime.fixed !== undefined });
  const engine = new Rocket(runtime);
  let view: View;
  let inputService: Input | undefined;
  let paused = false;
  let requested: Promise<void> | null = null;
  const navigator = new SceneNavigator({
    fixed: runtime.fixed !== undefined,
    onChange(current): undefined {
      if (current instanceof Stage2D) view.camera = current.camera;
      engine.refreshScenes();
    },
    onDispose(): undefined {
      try {
        initial.dispose();
      } finally {
        ownedTarget?.remove();
      }
    },
  });
  navigator.add('default', { retain: true, create: () => initial });
  try {
    if (ownedTarget) document.body.appendChild(ownedTarget);
    engine.scene(navigator);
    view = engine.view({
      target: target ?? ownedTarget!,
      width,
      height,
      scene: navigator,
      overlay(ctx, frame): undefined {
        const scene = navigator.scene;
        if (scene instanceof Stage2D) scene.drawScreen(ctx, frame);
      },
    });
    view.camera = initial.camera;
    // Configure lazily-used input before automatic startup. Route factories may create scopes later.
    inputService = engine.use(Input);
    const select = (id: string) => {
      requested = navigator.run(id);
      return requested;
    };
    const ready = autoStart
      ? Promise.resolve().then(async () => {
          if (paused) return;
          await (requested ?? select('default'));
          if (!paused) await engine.start();
        })
      : Promise.resolve();
    void ready.catch(
      runtime.onError ?? ((error: unknown) => console.error(error)),
    );
    return {
      engine,
      view,
      navigator,
      ready,
      get stage(): Stage2D {
        return navigator.scene instanceof Stage2D ? navigator.scene : initial;
      },
      get current() {
        return navigator.current;
      },
      addScene(id: string, route: StageRoute) {
        navigator.add(id, route);
      },
      async run(id: string) {
        await select(id);
        if (!paused) await engine.start();
      },
      async previous() {
        requested = navigator.previous();
        await requested;
        if (!paused) await engine.start();
      },
      input<A extends string>(
        scene: Stage2D,
        bindings: Record<A, string | readonly string[]>,
      ) {
        const scope = scene.world.own(inputService!.scope(scene, bindings));
        // The view presents the navigator, but this binding belongs to the scene's lifetime.
        const target: InputTarget = {
          canvas: view.canvas,
          scene,
          get disposed() {
            return view.disposed || scene.disposed;
          },
          clientToWorld: (point) => view.clientToWorld(point),
          own: (resource) => scene.world.own(resource),
        };
        scope.bind(target);
        return scope;
      },
      pause() {
        paused = true;
        engine.stop();
      },
      async resume() {
        paused = false;
        if (!navigator.scene) await select('default');
        await engine.start();
      },
      dispose() {
        paused = true;
        return engine.dispose();
      },
    };
  } catch (error) {
    initial.dispose();
    ownedTarget?.remove();
    void engine.dispose();
    throw error;
  }
}
