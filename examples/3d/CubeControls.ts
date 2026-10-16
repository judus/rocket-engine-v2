import type { Transform3D } from '../../src/3d/index.js';

/** Object controls shared by the wireframe and solid milestones. */
export function createCubeControls() {
  const defaults = {
    'cube-x': 0,
    'cube-y': 1.5,
    'cube-z': 0,
    'rotate-x': 0,
    'rotate-y': 25,
    'rotate-z': 0,
    'cube-scale': 1.5,
  };
  const fields = Object.entries(defaults).map(([id, value]) => {
    const input = document.querySelector<HTMLInputElement>(`#${id}`)!;
    input.value = String(value);
    return {
      id,
      input,
      output: document.querySelector<HTMLOutputElement>(`#${id}-value`)!,
    };
  });
  const animate = document.querySelector<HTMLInputElement>('#animate')!;
  animate.checked = false;
  let spin = 0;
  let transform: Transform3D;
  const read = () => {
    const values = Object.fromEntries(
      fields.map(({ id, input, output }) => {
        const value = Number(input.value);
        output.value = id.startsWith('rotate') ? `${value}°` : String(value);
        return [id, value];
      }),
    );
    const radians = Math.PI / 180;
    transform = {
      position: {
        x: values['cube-x']!,
        y: values['cube-y']!,
        z: values['cube-z']!,
      },
      rotation: {
        x: values['rotate-x']! * radians,
        y: values['rotate-y']! * radians,
        z: values['rotate-z']! * radians,
      },
      scale: {
        x: values['cube-scale']!,
        y: values['cube-scale']!,
        z: values['cube-scale']!,
      },
    };
  };
  read();
  return {
    update(dt: number): undefined {
      if (animate.checked)
        spin = (spin + (dt * 35 * Math.PI) / 180) % (Math.PI * 2);
    },
    pose(): Transform3D {
      return {
        ...transform,
        rotation: { ...transform.rotation, y: transform.rotation.y + spin },
      };
    },
    bind(signal: AbortSignal): undefined {
      for (const { input } of fields)
        input.addEventListener('input', read, { signal });
      document.querySelector('#reset-cube')!.addEventListener(
        'click',
        () => {
          for (const { id, input } of fields)
            input.value = String(defaults[id as keyof typeof defaults]);
          spin = 0;
          animate.checked = false;
          read();
        },
        { signal },
      );
    },
  };
}
