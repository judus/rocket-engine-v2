import { VideoTextureImage } from '../../src/3d/index.js';
/** One decoded call at a time; the cockpit owns its playback and lifetime. */
export class CrewCallVideo {
  readonly video: HTMLVideoElement;
  #active = false;
  #visible = false;
  #lastTime = -1;
  #generation = 0;
  #image: VideoTextureImage | null = null;
  get image(): VideoTextureImage | null {
    return this.#image;
  }
  constructor(
    private readonly base: URL,
    private readonly onError: (error: unknown) => void,
    video: HTMLVideoElement = document.createElement('video'),
  ) {
    this.video = video;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.addEventListener('error', this.failed);
  }
  private readonly failed = () => {
    if (this.#active)
      this.onError(
        new Error(`Crew call video failed: ${this.video.currentSrc}`),
      );
  };
  start(id: string): void {
    if (!['sera', 'ren', 'nadia', 'bram'].includes(id))
      throw new Error(`Unknown crew call: ${id}`);
    this.stop();
    this.#active = true;
    this.video.src = new URL(`${id}-512-24fps.mp4`, this.base).href;
    this.video.load();
    if (this.#visible) this.play();
  }
  private play(): void {
    const generation = ++this.#generation;
    void this.video.play().catch((error: unknown) => {
      if (generation === this.#generation && this.#active && this.#visible)
        this.onError(error);
    });
  }
  setVisible(visible: boolean): void {
    if (visible === this.#visible) return;
    this.#visible = visible;
    if (!this.#active) return;
    if (visible) this.play();
    else {
      this.#generation++;
      this.video.pause();
    }
  }
  changed(): boolean {
    if (!this.#active || !this.#visible || this.video.readyState < 2)
      return false;
    const frame = Math.floor(this.video.currentTime * 24);
    if (frame === this.#lastTime) return false;
    this.#lastTime = frame;
    if (this.#image) this.#image.update();
    else this.#image = new VideoTextureImage(this.video);
    return true;
  }
  stop(): void {
    this.#generation++;
    this.#active = false;
    this.#image = null;
    this.#lastTime = -1;
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }
  dispose(): void {
    this.stop();
    this.video.removeEventListener('error', this.failed);
  }
}
