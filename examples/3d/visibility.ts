import { runLineDemo } from './LineDemo.js';
import { createVisibilityModel } from './VisibilityModel.js';
import {
  CanvasRenderer3D,
  SoftwareDepthRenderer3D,
  collectFaces,
} from '../../src/3d/index.js';

await runLineDemo(
  () => {
    const root = createVisibilityModel();
    const painter = new CanvasRenderer3D();
    const depth = new SoftwareDepthRenderer3D();
    const painterCanvas = document.createElement('canvas');
    const depthCanvas = document.createElement('canvas');
    const painterCtx = painterCanvas.getContext('2d')!;
    const depthCtx = depthCanvas.getContext('2d')!;
    const mode = document.querySelector<HTMLSelectElement>('#visibility-mode')!;
    const resolution =
      document.querySelector<HTMLSelectElement>('#raster-width')!;
    const reverse = document.querySelector<HTMLInputElement>('#reverse-order')!;
    const preview = document.querySelector<HTMLInputElement>('#depth-preview')!;
    const animate =
      document.querySelector<HTMLInputElement>('#animate-panels')!;
    const yaw = document.querySelector<HTMLInputElement>('#panels-yaw')!;
    const yawValue =
      document.querySelector<HTMLOutputElement>('#panels-yaw-value')!;
    const readout =
      document.querySelector<HTMLOutputElement>('#visibility-status')!;
    const painterMs = document.querySelector<HTMLElement>('#painter-ms')!;
    const depthMs = document.querySelector<HTMLElement>('#depth-ms')!;
    const rasterInfo = document.querySelector<HTMLElement>('#raster-info')!;
    const sampleInfo = document.querySelector<HTMLElement>('#samples-info')!;
    mode.value = 'compare';
    resolution.value = '320';
    yaw.value = '0';
    reverse.checked = preview.checked = animate.checked = false;
    let phase = 0,
      windowSeconds = 0,
      frames = 0,
      painterTotal = 0,
      depthTotal = 0;
    let image: ImageData | undefined;
    let previewPixels: Uint8ClampedArray<ArrayBuffer> | undefined;
    const resetTimings = () => {
      frames = painterTotal = depthTotal = windowSeconds = 0;
      painterMs.textContent = depthMs.textContent = 'Warming up…';
    };
    resetTimings();
    return {
      referenceGrid: false,
      canvasLabel:
        'Intersecting panels: painter rendering and per-pixel depth comparison. WASD moves; drag or arrow keys look around.',
      update(dt) {
        windowSeconds += dt;
        if (animate.checked) phase += dt;
        const angle =
          (Number(yaw.value) * Math.PI) / 180 + Math.sin(phase) * 0.35;
        root.transform = {
          ...root.transform,
          rotation: { x: 0, y: angle, z: 0 },
        };
        yawValue.value = `${((angle * 180) / Math.PI).toFixed(0)}°`;
      },
      bind(signal) {
        for (const field of [mode, resolution, reverse, preview])
          field.addEventListener('change', resetTimings, { signal });
      },
      draw(_line, { ctx, camera, width, height }) {
        const compare = mode.value === 'compare';
        const showPainter = mode.value !== 'depth';
        const showDepth = mode.value !== 'painter';
        const gap = compare ? 16 : 0;
        const panelWidth = (width - gap) / (compare ? 2 : 1);
        const rasterWidth = Number(resolution.value);
        const rasterHeight = Math.max(
          1,
          Math.round((rasterWidth * height) / panelWidth),
        );
        if (
          painterCanvas.width !== rasterWidth ||
          painterCanvas.height !== rasterHeight
        ) {
          painterCanvas.width = depthCanvas.width = rasterWidth;
          painterCanvas.height = depthCanvas.height = rasterHeight;
          image = undefined;
          previewPixels = undefined;
        }
        const faces = collectFaces(root);
        if (reverse.checked) faces.reverse();
        frames++;
        if (showPainter) {
          const start = performance.now();
          painterCtx.clearRect(0, 0, rasterWidth, rasterHeight);
          painter.drawFaces(
            painterCtx,
            faces,
            camera,
            rasterWidth,
            rasterHeight,
          );
          ctx.drawImage(painterCanvas, 0, 0, panelWidth, height);
          painterTotal += performance.now() - start;
        }
        ctx.save();
        try {
          ctx.imageSmoothingEnabled = false;
          if (showDepth) {
            const start = performance.now();
            const stats = depth.drawFaces(
              faces,
              camera,
              rasterWidth,
              rasterHeight,
            );
            if (!image)
              image = new ImageData(depth.pixels, rasterWidth, rasterHeight);
            if (preview.checked) {
              previewPixels ??= new Uint8ClampedArray(depth.pixels.length);
              for (let y = 0; y < rasterHeight; y++) {
                for (let x = 0; x < rasterWidth; x++) {
                  const z = depth.depthAt(x, y),
                    offset = (y * rasterWidth + x) * 4;
                  // Display camera Z on a fixed 2..12 unit range; this is not GPU depth encoding.
                  const gray = Math.round(
                    255 * Math.max(0, Math.min(1, (12 - z) / 10)),
                  );
                  previewPixels[offset] =
                    previewPixels[offset + 1] =
                    previewPixels[offset + 2] =
                      gray;
                  previewPixels[offset + 3] = Number.isFinite(z) ? 255 : 0;
                }
              }
              depthCtx.putImageData(
                new ImageData(previewPixels, rasterWidth, rasterHeight),
                0,
                0,
              );
            } else depthCtx.putImageData(image, 0, 0);
            ctx.drawImage(
              depthCanvas,
              compare ? panelWidth + gap : 0,
              0,
              panelWidth,
              height,
            );
            depthTotal += performance.now() - start;
            sampleInfo.textContent = `${stats.testedSamples.toLocaleString()} covered samples · ${stats.depthPasses.toLocaleString()} depth writes · ${(stats.bufferBytes / 1048576).toFixed(2)} MiB color + depth`;
          } else sampleInfo.textContent = 'Depth renderer disabled';
          ctx.fillStyle = '#d9e5f0';
          ctx.font = '14px system-ui';
          if (showPainter) ctx.fillText('Painter · one depth per face', 14, 25);
          if (showDepth)
            ctx.fillText(
              preview.checked
                ? 'Depth map · near is bright'
                : 'Depth buffer · one depth per pixel',
              compare ? panelWidth + gap + 14 : 14,
              25,
            );
          if (compare) {
            ctx.fillStyle = '#24364a';
            ctx.fillRect(panelWidth, 0, gap, height);
          }
        } finally {
          ctx.restore();
        }
        rasterInfo.textContent = `${rasterWidth} × ${rasterHeight} raster pixels per active renderer`;
        readout.value = `Same camera and geometry · ${faces.length} opaque faces · ${reverse.checked ? 'reversed' : 'original'} submission order · yaw ${yawValue.value}`;
        if (windowSeconds >= 0.5) {
          painterMs.textContent = showPainter
            ? `${(painterTotal / frames).toFixed(2)} ms`
            : 'Disabled';
          depthMs.textContent = showDepth
            ? `${(depthTotal / frames).toFixed(2)} ms`
            : 'Disabled';
          frames = painterTotal = depthTotal = windowSeconds = 0;
        }
      },
      dispose() {
        // Retire cached bitmap surfaces; typed arrays are scene-local ordinary memory.
        painterCanvas.width =
          painterCanvas.height =
          depthCanvas.width =
          depthCanvas.height =
            0;
        image = undefined;
        previewPixels = undefined;
      },
    };
  },
  { x: 0, y: 0, z: -7, yaw: 0, pitch: 0, verticalFov: Math.PI / 3 },
);
