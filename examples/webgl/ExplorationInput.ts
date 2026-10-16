import { Input } from '../../src/index.js';
import type { Rocket, Scene } from '../../src/index.js';
import type { WebGLSurface } from '../../src/webgl/index.js';
/** Demo navigation policy over the shared engine input service; no DOM listeners/clock. */
export function explorationInput(
  app: Rocket,
  scene: Scene,
  surface: WebGLSurface,
  look: (dx: number, dy: number) => void,
  reset: () => void,
) {
  const codes = [
    'KeyW',
    'KeyS',
    'KeyA',
    'KeyD',
    'KeyQ',
    'KeyE',
    'ShiftLeft',
    'ShiftRight',
    'ArrowLeft',
    'ArrowRight',
    'ArrowUp',
    'ArrowDown',
    'KeyR',
  ];
  const scope = surface.own(
    app
      .use(Input)
      .scope(scene, Object.fromEntries(codes.map((code) => [code, code]))),
  );
  const binding = scope.bind(surface);
  let previous: { x: number; y: number } | null = null;
  const key = (code: string) => Number(scope.down(code));
  key.update = () => {
    if (scope.pressed('KeyR')) reset();
    const pointer = binding.pointer;
    if (pointer.down && pointer.world && previous)
      look(
        (pointer.world.x - previous.x) * 0.004,
        (pointer.world.y - previous.y) * 0.004,
      );
    previous = pointer.down ? pointer.world : null;
  };
  return key;
}
