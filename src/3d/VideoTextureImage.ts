/** Browser video frame source for WebGL. The caller owns loading, playback and
 * publication; this object owns no clock, callbacks, decoder or GPU resources.
 * UV (0,0) addresses the top-left. Fixed dimensions, opaque sRGB, no mipmaps.
 */
export class VideoTextureImage {
  readonly width: number;
  readonly height: number;
  readonly colorSpace = 'srgb' as const;
  #revision = 0;
  constructor(readonly source: HTMLVideoElement) {
    this.width = source.videoWidth;
    this.height = source.videoHeight;
    this.validate();
    Object.freeze(this);
  }
  /** Seeking/loop boundaries may temporarily have no decoded frame. */
  get ready(): boolean {
    return this.source.readyState >= 2;
  }
  get revision(): number {
    return this.#revision;
  }
  validate(): void {
    if (
      this.source.readyState < 2 ||
      !Number.isSafeInteger(this.width) ||
      !Number.isSafeInteger(this.height) ||
      this.width < 1 ||
      this.height < 1 ||
      this.width * this.height > 16777216 ||
      this.source.videoWidth !== this.width ||
      this.source.videoHeight !== this.height
    )
      throw new Error(
        'Video texture requires a decoded frame with fixed valid dimensions',
      );
  }
  /** Publish a newly available frame, once at the host's chosen update boundary. */
  update(): void {
    this.validate();
    if (this.#revision === Number.MAX_SAFE_INTEGER)
      throw new Error('Texture revision exhausted');
    this.#revision++;
  }
}
