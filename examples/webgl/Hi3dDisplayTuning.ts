import type { Node3D } from '../../src/3d/index.js';

/** Temporary asset fitting controls; offsets apply before the shared cockpit fit. */
export function hi3dDisplayTuning(
  root: Node3D,
  modelUrl: string,
  signal: AbortSignal,
  kind: 'display' | 'lamp' = 'display',
): void {
  const panel = document.querySelector(`#${kind}-tuning`);
  if (!panel) return;
  const ids =
    kind === 'display'
      ? ['radar', 'flight', 'attitude', 'speed', 'position']
      : [
          'overhead-left',
          'overhead-right',
          'center-console',
          'right-console',
          'r1',
          'r2',
        ];
  const bases = root.children.map((node) => ({ ...node.transform.position }));
  const controls = ids.flatMap((id) =>
    ['x', 'y'].map((axis) =>
      document.querySelector<HTMLInputElement>(`#${kind}-${id}-${axis}`)!,
    ),
  );
  const storageKey = `rocket:${kind}-tuning:${modelUrl}`;
  const status = document.querySelector(`#${kind}-tuning-status`)!;
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
        position: {
          x: bases[i]!.x + values[i * 2]!,
          y: bases[i]!.y + values[i * 2 + 1]!,
          z: bases[i]!.z,
        },
      };
    });
    controls.forEach((control, i) => {
      document.querySelector<HTMLOutputElement>(`#${control.id}-value`)!.value =
        values[i]!.toFixed(3);
    });
    document.querySelector(`#${kind}-tuning-values`)!.textContent =
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
        status.textContent = `${kind === 'lamp' ? 'Lamp' : 'Display'} offsets saved in this browser.`;
      } catch {
        status.textContent =
          'Storage unavailable; retain the exact offsets below.';
      }
    }
  };
  controls.forEach((control) =>
    control.addEventListener('input', () => apply(true), { signal }),
  );
  document.querySelector(`#${kind}-tuning-reset`)!.addEventListener(
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

/** Independent round-lens sizing; uses the same lifecycle as the fitting sliders. */
export function hi3dLampSizeTuning(
  modelUrl: string,
  signal: AbortSignal,
  setSize: (index: number, size: number) => void,
): void {
  const ids = ['r1', 'r2'];
  const controls = ids.map((id) =>
    document.querySelector<HTMLInputElement>(`#lamp-${id}-size`)!,
  );
  const key = `rocket:lamp-sizes:${modelUrl}`;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
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
    /* Sizing remains usable without storage. */
  }
  const apply = (save: boolean) => {
    const values = controls.map((control) => Number(control.value));
    values.forEach((value, i) => {
      setSize(i + 4, value);
      document.querySelector<HTMLOutputElement>(
        `#lamp-${ids[i]}-size-value`,
      )!.value = `${(value * 100).toFixed(1)}%`;
    });
    document.querySelector('#lamp-size-values')!.textContent = JSON.stringify(
      {
        model: modelUrl,
        sizes: Object.fromEntries(ids.map((id, i) => [id, values[i]])),
      },
      null,
      2,
    );
    if (save) {
      try {
        localStorage.setItem(key, JSON.stringify(values));
      } catch {
        /* Exact sizes remain available in the readout. */
      }
    }
  };
  controls.forEach((control) =>
    control.addEventListener('input', () => apply(true), { signal }),
  );
  document.querySelector('#lamp-size-reset')!.addEventListener(
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
