import { AnimationPlayer } from 'sprite-animation';
import type { Atlas, Completion } from 'sprite-animation';
import {
  drawSprite,
  getSpriteBounds,
  validateSpriteImage,
} from 'sprite-animation/canvas2d';
import type { SpriteImage } from 'sprite-animation/canvas2d';
import { Node2D } from '../Node2D.js';
import type { Assets, ImageLease } from '../Assets.js';
import type { Point } from '../types.js';
import type { Bounds2D, SpatialIndex } from '../SpatialIndex.js';
import { assertSynchronous, invokeSynchronous } from '../synchronous.js';
export interface SpriteOptions {
  /** scene = node update; manual = caller's fixed/update boundary. Never both. */
  readonly clock?: 'scene' | 'manual';
  readonly onComplete?: (completion: Completion) => undefined;
  readonly debugBounds?: boolean;
}
/** Optional Canvas binding. Node owns player; a supplied ready image is borrowed. */
export class Sprite2D {
  readonly node: Node2D;
  readonly player: AnimationPlayer;
  readonly flips = { flipX: false, flipY: false };
  #updates = 0;
  #draws = 0;
  #image: SpriteImage | undefined;
  #clock: 'scene' | 'manual';
  #complete: SpriteOptions['onComplete'];
  constructor(
    atlas: Atlas,
    image: SpriteImage,
    clip: string,
    options: SpriteOptions = {},
  ) {
    if (
      options.clock !== undefined &&
      options.clock !== 'scene' &&
      options.clock !== 'manual'
    )
      throw new Error('Invalid sprite update owner');
    if (
      options.debugBounds !== undefined &&
      typeof options.debugBounds !== 'boolean'
    )
      throw new TypeError('debugBounds must be boolean');
    const debugBounds = options.debugBounds === true;
    assertSynchronous(options.onComplete, 'sprite.onComplete');
    validateSpriteImage(atlas, image);
    this.#clock = options.clock ?? 'scene';
    this.#complete = options.onComplete;
    this.#image = image;
    this.player = new AnimationPlayer(atlas);
    try {
      this.player.play(clip);
    } catch (error) {
      this.player.dispose();
      throw error;
    }
    this.node = new Node2D({
      draw: (ctx) => {
        const frame = this.player.snapshot;
        if (!frame || !this.#image) return;
        this.#draws++;
        ctx.imageSmoothingEnabled = false;
        drawSprite(ctx, this.#image, frame, this.flips);
        if (debugBounds) {
          const b = getSpriteBounds(frame, this.flips);
          ctx.strokeStyle = '#f3c66b';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(b.x, b.y, b.width, b.height);
          ctx.fillStyle = '#86e7cf';
          ctx.fillRect(-1, -1, 2, 2);
        }
      },
    });
    this.node.attach({
      update: (dt) => {
        if (this.#clock === 'scene') this.#tick(dt);
      },
      dispose: () => {
        this.player.dispose();
        this.#image = undefined;
        this.#complete = undefined;
      },
    });
  }
  get updates() {
    return this.#updates;
  }
  get draws() {
    return this.#draws;
  }
  /** Only a manually clocked binding may be advanced explicitly. */
  advance(dt: number): undefined {
    if (this.#clock !== 'manual')
      throw new Error('Scene owns sprite advancement');
    if (!this.node.disposed) this.#tick(dt);
  }
  #tick(dt: number): undefined {
    this.#updates++;
    const completion = this.player.advance(dt);
    if (completion)
      invokeSynchronous(
        this.#complete,
        this,
        [completion],
        'sprite.onComplete',
      );
  }
  get localBounds() {
    const frame = this.player.snapshot;
    return this.node.disposed || !frame
      ? null
      : getSpriteBounds(frame, this.flips);
  }
  /** Axis-aligned visual envelope of all four transformed corners, not collision geometry. */
  get worldBounds(): Bounds2D | null {
    const b = this.localBounds;
    if (!b) return null;
    try {
      this.node.worldToLocal({ x: 0, y: 0 }); // Singular transforms must not remain pickable.
      const points = [
        { x: b.x, y: b.y },
        { x: b.x + b.width, y: b.y },
        { x: b.x, y: b.y + b.height },
        { x: b.x + b.width, y: b.y + b.height },
      ].map((p) => this.node.localToWorld(p));
      const result = {
        minX: Math.min(...points.map((p) => p.x)),
        minY: Math.min(...points.map((p) => p.y)),
        maxX: Math.max(...points.map((p) => p.x)),
        maxY: Math.max(...points.map((p) => p.y)),
      };
      if (
        !Object.values(result).every(Number.isFinite) ||
        result.minX >= result.maxX ||
        result.minY >= result.maxY
      )
        return null;
      return Object.freeze(result);
    } catch {
      return null;
    }
  }
  contains(point: Point): boolean {
    const b = this.localBounds;
    if (!b) return false;
    try {
      const p = this.node.worldToLocal(point);
      return (
        p.x >= b.x && p.y >= b.y && p.x < b.x + b.width && p.y < b.y + b.height
      );
    } catch {
      return false;
    }
  }
  dispose(): undefined {
    this.node.dispose();
  }
}
/** Acquire/validate with rollback. This binding owns exactly this acquired lease. */
export async function loadSprite(
  assets: Pick<Assets, 'acquireImage'>,
  url: string | URL,
  atlas: Atlas,
  clip: string,
  options: SpriteOptions & { readonly signal?: AbortSignal } = {},
): Promise<Sprite2D> {
  let lease: ImageLease | undefined, sprite: Sprite2D | undefined;
  try {
    lease = await assets.acquireImage(
      url,
      options.signal ? { signal: options.signal } : {},
    );
    options.signal?.throwIfAborted();
    sprite = new Sprite2D(atlas, lease.image, clip, options);
    options.signal?.throwIfAborted();
    const owned = lease;
    sprite.node.attach({
      dispose: () => {
        sprite!.player.dispose();
        return owned.dispose();
      },
    });
    return sprite;
  } catch (error) {
    sprite?.dispose();
    lease?.dispose();
    throw error;
  }
}
export interface SpriteMembership {
  /** Refresh after movement/playback/flips, before querying. Draw never modifies the index. */
  refresh(): undefined;
  dispose(): undefined;
}
/** Caller owns the index; sprite removal releases membership before image/player cleanup. */
export function bindSpriteIndex(
  sprite: Sprite2D,
  index: SpatialIndex<Sprite2D>,
  id: string,
): SpriteMembership {
  if (sprite.node.disposed || !sprite.worldBounds)
    throw new Error('Sprite must have live invertible bounds before indexing');
  index.insert(id, sprite.worldBounds, sprite);
  let present = true,
    disposed = false;
  const membership: SpriteMembership = {
    refresh() {
      if (disposed) return;
      const b = sprite.worldBounds;
      if (!b) {
        if (present) index.remove(id);
        present = false;
      } else if (present) index.update(id, b);
      else {
        index.insert(id, b, sprite);
        present = true;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (present) index.remove(id);
      present = false;
    },
  };
  sprite.node.attach({ dispose: () => membership.dispose() });
  return membership;
}
