import { defaultVideo, saveVideo, videoResolution } from './VideoSettings.js';
import type { VideoSettings, SurfaceDetail } from './VideoSettings.js';

export class VideoPanel {
  #scale: HTMLInputElement;
  #density: HTMLSelectElement;
  #detail: HTMLSelectElement;
  #fps: HTMLInputElement;
  #output: HTMLElement;
  #resolution: HTMLElement;
  constructor(
    root: HTMLElement,
    private current: () => VideoSettings,
    private apply: (settings: VideoSettings) => void,
    private status: HTMLElement,
    private viewport: () => {
      width: number;
      height: number;
      devicePixelRatio: number;
    },
    signal: AbortSignal,
  ) {
    const node = <T extends HTMLElement>(selector: string): T => {
      const element = root.querySelector<T>(selector);
      if (!element) throw new Error(`Missing video element ${selector}`);
      return element;
    };
    this.#scale = node('#render-scale');
    this.#density = node('#pixel-density');
    this.#detail = node('#surface-detail');
    this.#fps = node('#show-fps');
    this.#output = node('#render-scale-value');
    this.#resolution = node('#render-resolution');
    this.#scale.addEventListener('input', () => this.preview(), { signal });
    this.#density.addEventListener('change', () => this.preview(), { signal });
    window.addEventListener('resize', () => this.preview(), { signal });
    node<HTMLButtonElement>('#reset-video').addEventListener(
      'click',
      () => {
        this.render(defaultVideo());
        this.status.textContent =
          'Video defaults restored in this draft. Apply to save.';
      },
      { signal },
    );
    node<HTMLButtonElement>('#apply-video').addEventListener(
      'click',
      () => {
        try {
          const settings = saveVideo(localStorage, this.draft());
          this.apply(settings);
          this.status.textContent =
            'Video settings applied and saved in this browser.';
        } catch (error) {
          this.status.textContent =
            error instanceof Error ? error.message : String(error);
        }
      },
      { signal },
    );
  }
  open(): void {
    this.render(this.current());
  }
  private draft(): VideoSettings {
    return {
      surfaceDetail: this.#detail.value as SurfaceDetail,
      showFps: this.#fps.checked,
      renderScale: Number(this.#scale.value) / 100,
      pixelDensityLimit:
        this.#density.value === 'native' ? null : Number(this.#density.value),
    };
  }
  private render(settings: VideoSettings): void {
    this.#detail.value = settings.surfaceDetail;
    this.#fps.checked = settings.showFps;
    this.#scale.value = String(settings.renderScale * 100);
    this.#density.value =
      settings.pixelDensityLimit === null
        ? 'native'
        : String(settings.pixelDensityLimit);
    this.preview();
  }
  private preview(): void {
    const settings = this.draft();
    const { width, height, devicePixelRatio: deviceDensity } = this.viewport();
    const size = videoResolution(settings, width, height, deviceDensity);
    const fraction =
      ((Math.min(deviceDensity, settings.pixelDensityLimit ?? deviceDensity) *
        settings.renderScale) /
        deviceDensity) **
      2;
    this.#output.textContent = `${this.#scale.value}%`;
    this.#resolution.textContent = `Requested resolution: ${size.width} × ${size.height} · ${Math.round(fraction * 100)}% of native pixels. Device density: ${deviceDensity.toFixed(2)}×.`;
  }
}
