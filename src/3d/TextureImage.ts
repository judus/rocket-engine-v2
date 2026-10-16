/** Shared storage limits; validation precedes any revision or pixel mutation. */
function validatePixels(
  width: number,
  height: number,
  pixels: Uint8Array,
): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width * height > 16777216 ||
    pixels.length !== width * height * 4
  )
    throw new Error('Invalid texture dimensions or RGBA8 byte count');
  for (let i = 3; i < pixels.length; i += 4)
    if (pixels[i] !== 255)
      throw new Error('Only opaque textures are supported');
}

/** Immutable opaque RGBA8 image with explicit transfer function. Row zero is the top row; UV (0,0) is top-left. */
export class TextureImage {
  readonly #pixels: Uint8Array;
  readonly colorSpace: 'srgb' | 'linear';
  constructor(
    readonly width: number,
    readonly height: number,
    pixels: Uint8Array,
    options: { readonly colorSpace?: 'srgb' | 'linear' } = {},
  ) {
    this.colorSpace = options.colorSpace ?? 'srgb';
    if (!['srgb', 'linear'].includes(this.colorSpace))
      throw new Error('Invalid texture color space');
    validatePixels(width, height, pixels);
    this.#pixels = new Uint8Array(pixels);
    Object.freeze(this);
  }
  copyPixels(): Uint8Array {
    return new Uint8Array(this.#pixels);
  }
}
/** Fixed-size opaque RGBA8 source. Caller publishes complete pixel revisions;
 * renderers independently upload the latest revision on the next visible use.
 * No DOM, GPU resources, renderer registration or clock ownership.
 */
export class DynamicTextureImage {
  #pixels: Uint8Array;
  #revision = 0;
  readonly colorSpace: 'srgb' | 'linear';
  constructor(
    readonly width: number,
    readonly height: number,
    pixels: Uint8Array,
    options: { readonly colorSpace?: 'srgb' | 'linear' } = {},
  ) {
    this.colorSpace = options.colorSpace ?? 'srgb';
    if (!['srgb', 'linear'].includes(this.colorSpace))
      throw new Error('Invalid texture color space');
    validatePixels(width, height, pixels);
    this.#pixels = new Uint8Array(pixels);
    Object.freeze(this);
  }
  get revision(): number {
    return this.#revision;
  }
  /** Atomically publish a snapshot. Intermediate unseen revisions may coalesce. */
  update(pixels: Uint8Array): void {
    validatePixels(this.width, this.height, pixels);
    if (this.#revision === Number.MAX_SAFE_INTEGER)
      throw new Error('Texture revision exhausted');
    const next = new Uint8Array(pixels);
    this.#pixels = next;
    this.#revision++;
  }
  copyPixels(): Uint8Array {
    return new Uint8Array(this.#pixels);
  }
}
export type TextureSource3D = TextureImage | DynamicTextureImage;

export type TextureWrap = 'repeat' | 'clamp' | 'mirror';
export type TextureFilter = 'nearest' | 'linear' | 'trilinear';
export interface TextureBinding3D {
  readonly image: TextureSource3D;
  readonly wrapS?: TextureWrap;
  readonly wrapT?: TextureWrap;
  readonly filter?: TextureFilter;
}
export function textureBinding(
  binding: TextureBinding3D,
): Readonly<Required<TextureBinding3D>> {
  const {
    image,
    wrapS = 'repeat',
    wrapT = 'repeat',
    filter = 'trilinear',
  } = binding;
  if (
    (!(image instanceof TextureImage) &&
      !(image instanceof DynamicTextureImage)) ||
    !['repeat', 'clamp', 'mirror'].includes(wrapS) ||
    !['repeat', 'clamp', 'mirror'].includes(wrapT) ||
    !['nearest', 'linear', 'trilinear'].includes(filter)
  )
    throw new Error('Invalid texture binding');
  return Object.freeze({ image, wrapS, wrapT, filter });
}
