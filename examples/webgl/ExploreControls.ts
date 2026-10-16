/** Demo-only DOM adapter for a WebGL canvas (Input currently binds Canvas views).
 * No clock: movement advances only from the host Rocket scene update.
 */
export function exploreControls(
  canvas: HTMLCanvasElement,
  signal: AbortSignal,
  look: (dx: number, dy: number) => void,
  reset: () => void,
) {
  const keys = new Set<string>();
  const accepted = new Set([
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
  ]);
  let pointer: number | null = null,
    x = 0,
    y = 0;
  canvas.tabIndex = 0;
  canvas.style.touchAction = 'none';
  const clear = () => {
    keys.clear();
    if (pointer !== null && canvas.hasPointerCapture(pointer))
      canvas.releasePointerCapture(pointer);
    pointer = null;
  };
  canvas.addEventListener(
    'keydown',
    (e) => {
      if (
        !accepted.has(e.code) ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey ||
        e.isComposing
      )
        return;
      e.preventDefault();
      keys.add(e.code);
      if (e.code === 'KeyR' && !e.repeat) reset();
    },
    { signal },
  );
  canvas.addEventListener(
    'keyup',
    (e) => {
      if (accepted.has(e.code)) {
        e.preventDefault();
        keys.delete(e.code);
      }
    },
    { signal },
  );
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0 || pointer !== null) return;
      canvas.focus({ preventScroll: true });
      pointer = e.pointerId;
      x = e.clientX;
      y = e.clientY;
      canvas.setPointerCapture(pointer);
    },
    { signal },
  );
  canvas.addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerId !== pointer) return;
      look((e.clientX - x) * 0.004, (e.clientY - y) * 0.004);
      x = e.clientX;
      y = e.clientY;
    },
    { signal },
  );
  canvas.addEventListener('pointerup', clear, { signal });
  canvas.addEventListener('pointercancel', clear, { signal });
  canvas.addEventListener('lostpointercapture', clear, { signal });
  canvas.addEventListener('blur', clear, { signal });
  window.addEventListener('blur', clear, { signal });
  document.addEventListener('visibilitychange', clear, { signal });
  signal.addEventListener('abort', clear, { once: true });
  return (code: string) => Number(keys.has(code));
}
