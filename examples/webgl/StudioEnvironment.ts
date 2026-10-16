import { bakeEnvironment } from '../../src/3d/index.js';
import type { EnvironmentMap } from '../../src/3d/index.js';

/** Shared example-owned virtual studio; reusable renderer knows nothing about its panels. */
export function studioEnvironment(): EnvironmentMap {
  return bakeEnvironment(
    (d) => {
      const sky = Math.max(d.y, 0),
        ground = Math.max(-d.y, 0);
      let r = 0.025 + sky * 0.12 + ground * 0.035,
        g = 0.035 + sky * 0.19 + ground * 0.025,
        b = 0.055 + sky * 0.32 + ground * 0.015;
      const soft = (x: number, width: number) =>
        Math.max(0, Math.min(1, (width - Math.abs(x)) / 0.035));
      const warm =
        soft(d.x - 0.52, 0.2) * soft(d.y - 0.3, 0.38) * soft(d.z + 0.78, 0.3);
      const cool =
        soft(d.x + 0.65, 0.22) * soft(d.y - 0.12, 0.5) * soft(d.z + 0.65, 0.38);
      const ceiling =
        soft(d.x, 0.5) * soft(d.z, 0.65) * Math.max(0, (d.y - 0.75) / 0.25);
      r += warm * 0.85 + cool * 0.12 + ceiling * 0.55;
      g += warm * 0.52 + cool * 0.55 + ceiling * 0.55;
      b += warm * 0.2 + cool * 0.85 + ceiling * 0.55;
      return [Math.min(1, r), Math.min(1, g), Math.min(1, b)];
    },
    { size: 64, samples: 128, diffuseSize: 12, lutSize: 64 },
  );
}

export function previewEnvironment(
  environment: EnvironmentMap,
  host: HTMLElement,
): void {
  const names = ['+X', '−X', '+Y', '−Y', '+Z', '−Z'];
  environment.specular[0]!.forEach((face, i) => {
    const frame = document.createElement('figure'),
      caption = document.createElement('figcaption'),
      canvas = document.createElement('canvas');
    canvas.width = face.width;
    canvas.height = face.height;
    canvas.style.width = '96px';
    canvas.style.height = '96px';
    const pixels = face.copyPixels();
    for (let n = 0; n < pixels.length; n++)
      if (n % 4 !== 3) {
        const v = pixels[n]! / 255;
        pixels[n] = Math.round(
          255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055),
        );
      }
    canvas
      .getContext('2d')!
      .putImageData(
        new ImageData(new Uint8ClampedArray(pixels), face.width, face.height),
        0,
        0,
      );
    caption.textContent = names[i]!;
    frame.append(canvas, caption);
    host.append(frame);
  });
}
