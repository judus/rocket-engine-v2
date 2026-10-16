import type { Node3D } from '../../src/3d/index.js';

/** Temporary asset fitting controls; offsets apply before the shared cockpit fit. */
export function hi3dDisplayTuning(
  root: Node3D,
  modelUrl: string,
  signal: AbortSignal,
): void {
  const panel = document.querySelector('#display-tuning');
  if (!panel) return;
  const ids = ['radar', 'flight', 'attitude', 'speed', 'position'];
  const controls = ids.flatMap((id) =>
    ['x', 'y'].map((axis) =>
      document.querySelector<HTMLInputElement>(`#display-${id}-${axis}`)!,
    ),
  );
  const storageKey = `rocket:display-tuning:${modelUrl}`;
  const status = document.querySelector('#display-tuning-status')!;
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(storageKey) ?? 'null',
    );
    if (Array.isArray(saved) && saved.length === controls.length)
      controls.forEach((control, i) => {
        const value: unknown = saved[i];
        if (
          typeof value === 'number' &&
          Number.isFinite(value) &&
          value >= Number(control.min) &&
          value <= Number(control.max)
        )
          control.value = String(value);
      });
  } catch {
    status.textContent = 'Saved offsets unavailable; controls still work.';
  }
  const apply = (save: boolean) => {
    const values = controls.map((control) => Number(control.value));
    root.children.forEach((node, i) => {
      node.transform = {
        ...node.transform,
        position: { x: values[i * 2]!, y: values[i * 2 + 1]!, z: 0 },
      };
    });
    controls.forEach((control, i) => {
      document.querySelector<HTMLOutputElement>(`#${control.id}-value`)!.value =
        values[i]!.toFixed(3);
    });
    document.querySelector('#display-tuning-values')!.textContent =
      JSON.stringify(
        {
          model: modelUrl,
          offsets: Object.fromEntries(
            ids.map((id, i) => [
              id,
              { x: values[i * 2], y: values[i * 2 + 1] },
            ]),
          ),
        },
        null,
        2,
      );
    if (save) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(values));
        status.textContent = 'Display offsets saved in this browser.';
      } catch {
        status.textContent =
          'Storage unavailable; retain the exact offsets below.';
      }
    }
  };
  controls.forEach((control) =>
    control.addEventListener('input', () => apply(true), { signal }),
  );
  document.querySelector('#display-tuning-reset')!.addEventListener(
    'click',
    () => {
      controls.forEach((control) => {
        control.value = control.defaultValue;
      });
      apply(true);
    },
    { signal },
  );
  apply(false);
}
