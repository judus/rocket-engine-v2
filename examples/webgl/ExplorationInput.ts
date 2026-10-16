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
  pointerLock = false,
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
  const binding = scope.bind(surface, { pointerLock });
  let previous: { x: number; y: number } | null = null;
  const key = (code: string) => Number(scope.down(code));
  key.capture = binding.capture;
  key.connected = () => binding.capture?.active ?? true;
  key.update = () => {
    if (binding.capture) {
      const movement = binding.capture.consumeMovement();
      if (binding.capture.active) look(movement.x * 0.004, movement.y * 0.004);
    }
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
