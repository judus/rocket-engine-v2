import { Camera2D } from '../Camera2D.js';
import { assertSynchronous } from '../synchronous.js';
import { Node2D } from '../Node2D.js';
import type { NodeOptions } from '../Node2D.js';
import { Scene2D } from '../Scene2D.js';
import type { Frame, FixedFrame, Scene } from '../types.js';

export interface StageOptions {
  fixed?: boolean;
  fixedUpdate?: (dt: number, frame: FixedFrame) => undefined;
  prepare?: (context: { signal: AbortSignal }) => void | Promise<void>;
  update?: (dt: number, frame: Frame) => undefined;
  render?: (ctx: CanvasRenderingContext2D, frame: Frame) => undefined;
}
export interface LayerOptions {
  space?: 'world' | 'screen';
  parallax?: number;
  sort?: 'y' | ((a: Node2D, b: Node2D) => number);
}
export interface EntityOptions extends NodeOptions {
  id?: string;
  tags?: readonly string[];
  layer?: string;
  update?: (this: Node2D, dt: number, frame: Frame) => undefined;
}
interface Layer {
  node: Node2D;
  space: 'world' | 'screen';
  sort: LayerOptions['sort'];
}
class ParallaxNode extends Node2D {
  constructor(
    private factor: number,
    private camera: () => Camera2D | null,
  ) {
    super();
  }
  override draw(ctx: CanvasRenderingContext2D, frame: Frame): undefined {
    ctx.save();
    try {
      const camera = this.camera();
      if (camera)
        ctx.translate(
          camera.x * (1 - this.factor),
          camera.y * (1 - this.factor),
        );
      super.draw(ctx, frame);
    } finally {
      ctx.restore();
    }
  }
}

/** Experimental vocabulary over two existing Scene2D trees; no alternate transform model. */
export class Stage2D implements Scene {
  readonly camera = new Camera2D();
  readonly world: Scene2D;
  readonly screen = new Scene2D();
  readonly fixedUpdate?: (dt: number, frame: FixedFrame) => undefined;
  #layers = new Map<string, Layer>();
  #entities = new Map<Node2D, { id?: string; tags: readonly string[] }>();
  #camera: Camera2D | null = null;
  #disposed = false;
  constructor(options: StageOptions = {}) {
    this.world = new Scene2D({
      ...options,
      fixedBehaviors: options.fixed ?? options.fixedUpdate !== undefined,
      ...(options.render ? { draw: options.render } : {}),
    });
    this.addLayer('world');
    if (options.fixed || options.fixedUpdate) {
      this.fixedUpdate = (dt, frame): undefined => {
        // Gameplay fixed work belongs to the world tree; screen is presentation only.
        this.world.fixedUpdate!(dt, frame);
      };
    }
  }
  get disposed() {
    return this.#disposed;
  }
  addLayer(
    name: string,
    { space = 'world', parallax = 1, sort }: LayerOptions = {},
  ): Node2D {
    this.#assertLive();
    if (!name || this.#layers.has(name))
      throw new Error(`Duplicate/empty layer: ${name}`);
    if (!Number.isFinite(parallax))
      throw new RangeError('parallax must be finite');
    if (space === 'screen' && parallax !== 1)
      throw new Error('Parallax applies only to world layers');
    const node =
      space === 'world'
        ? new ParallaxNode(parallax, () => this.#camera)
        : new Node2D();
    (space === 'world' ? this.world : this.screen).root.add(node);
    this.#layers.set(name, { node, space, sort });
    return node;
  }
  layer(name: string): Node2D {
    const layer = this.#layers.get(name);
    if (!layer) throw new Error(`Unknown layer: ${name}`);
    return layer.node;
  }
  add({
    id,
    tags = [],
    layer = 'world',
    update,
    ...options
  }: EntityOptions = {}): Node2D {
    return this.entity(
      () => {
        const node = new Node2D(options);
        if (update)
          node.attach({
            update(dt, frame): undefined {
              return update.call(node, dt, frame);
            },
          });
        return node;
      },
      { ...(id === undefined ? {} : { id }), tags, layer },
    );
  }
  /** Adopt a concrete typed entity through the same layer, identity and lifetime path. */
  entity<T extends Node2D>(
    create: () => T,
    {
      id,
      tags = [],
      layer = 'world',
    }: Pick<EntityOptions, 'id' | 'tags' | 'layer'> = {},
  ): T {
    this.#assertLive();
    if (id !== undefined && (!id || this.find(id)))
      throw new Error(`Duplicate/empty entity ID: ${id}`);
    const parent = this.layer(layer);
    assertSynchronous(create, 'entity factory');
    const node = create();
    if (!(node instanceof Node2D) || node.disposed || node.parent)
      throw new Error('Entity factory must return a live, unparented Node2D');
    parent.add(node);
    node.attach({
      dispose: (): undefined => {
        this.#entities.delete(node);
      },
    });
    this.#entities.set(node, {
      ...(id === undefined ? {} : { id }),
      tags: Object.freeze([...new Set(tags)]),
    });
    return node;
  }
  find(id: string): Node2D | undefined {
    return this.query().find((node) => this.#entities.get(node)?.id === id);
  }
  query({ tag }: { tag?: string } = {}): Node2D[] {
    const result: Node2D[] = [];
    for (const [node, metadata] of this.#entities) {
      let root = node;
      while (root.parent) root = root.parent;
      if (root !== this.world.root && root !== this.screen.root) continue;
      if (tag === undefined || metadata.tags.includes(tag)) result.push(node);
    }
    return result;
  }
  prepare(context: { signal: AbortSignal }) {
    return this.world.prepare(context);
  }
  update(dt: number, frame: Frame): undefined {
    this.world.update(dt, frame);
    this.screen.update(dt, frame);
    for (const { node, sort } of this.#layers.values()) {
      if (!sort || node.disposed) continue;
      const before = node.children;
      const compare = sort === 'y' ? (a: Node2D, b: Node2D) => a.y - b.y : sort;
      const after = [...before].sort(compare);
      if (after.some((child, index) => child !== before[index])) {
        for (const child of after) {
          child.detach();
          node.add(child);
        }
      }
    }
  }
  activeChildren(): readonly Scene[] {
    return this.#disposed ? [] : [this.world, this.screen];
  }
  draw(ctx: CanvasRenderingContext2D, frame: Frame): undefined {
    this.drawWorld(ctx, frame, this.camera);
  }
  drawWorld(
    ctx: CanvasRenderingContext2D,
    frame: Frame,
    camera: Camera2D,
  ): undefined {
    this.#camera = camera;
    try {
      this.world.draw(ctx, frame);
    } finally {
      this.#camera = null;
    }
  }
  drawScreen(ctx: CanvasRenderingContext2D, frame: Frame): undefined {
    this.screen.draw(ctx, frame);
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    const errors: unknown[] = [];
    for (const scene of [this.screen, this.world]) {
      try {
        scene.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    this.#entities.clear();
    this.#layers.clear();
    if (errors.length) throw new AggregateError(errors, 'Stage cleanup failed');
  }
  #assertLive() {
    if (this.#disposed) throw new Error('Stage is disposed');
  }
}
