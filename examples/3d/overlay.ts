import { runLineDemo } from './LineDemo.js';
import { gradeCockpit } from './CockpitGrade.js';
import { seatView } from './CockpitModel.js';

const status = document.querySelector<HTMLOutputElement>('#overlay-status')!;
const artwork = new Image();
artwork.src = new URL(
  '../../../examples/3d/assets/cockpit-2126-v14-relic.png',
  import.meta.url,
).href;
try {
  await artwork.decode();
  const cache = document.createElement('canvas');
  cache.width = artwork.naturalWidth;
  cache.height = artwork.naturalHeight;
  const cacheContext = cache.getContext('2d', { willReadFrequently: true })!;
  cacheContext.drawImage(artwork, 0, 0);
  const source = cacheContext.getImageData(0, 0, cache.width, cache.height);
  await runLineDemo(() => {
    const visible = document.querySelector<HTMLInputElement>('#show-overlay')!;
    visible.checked = true;
    const enabled = document.querySelector<HTMLInputElement>('#grade-enabled')!;
    const controls = ['darkness', 'shadow-blue', 'highlight-warm'].map((id) =>
      document.querySelector<HTMLInputElement>(`#grade-${id}`)!,
    );
    const defaults = [85, 50, 50];
    let revisions = 0;
    const rebuild = () => {
      const [darkness, shadowBlue, highlightWarm] = controls.map(
        (input) => Number(input.value) / 100,
      );
      controls.forEach((input) => {
        document.querySelector<HTMLOutputElement>(`#${input.id}-value`)!.value =
          `${input.value}%`;
      });
      const pixels = gradeCockpit(source.data, {
        darkness: darkness!,
        shadowBlue: shadowBlue!,
        highlightWarm: highlightWarm!,
      });
      cacheContext.putImageData(
        new ImageData(pixels, source.width, source.height),
        0,
        0,
      );
      revisions++;
    };
    const resetGrade = () => {
      enabled.checked = true;
      controls.forEach((input, i) => {
        input.value = String(defaults[i]);
      });
      rebuild();
    };
    resetGrade();
    return {
      bind(signal) {
        for (const input of controls)
          input.addEventListener('input', rebuild, { signal });
        document
          .querySelector('#reset-grade')!
          .addEventListener('click', resetGrade, { signal });
      },
      draw(_line, { ctx, width, height }) {
        // Screen-space artwork stays fixed while the camera moves the world.
        if (visible.checked)
          ctx.drawImage(enabled.checked ? cache : artwork, 0, 0, width, height);
        const text = visible.checked
          ? `v14-relic · ${enabled.checked ? 'graded' : 'original'} · grade builds ${revisions} · 1 cached image draw/frame`
          : 'Overlay hidden · 3D reference grid only';
        if (status.value !== text) status.value = text;
      },
    };
  }, seatView);
} catch (error) {
  status.value = `Unable to start cockpit overlay: ${String(error)}`;
}
