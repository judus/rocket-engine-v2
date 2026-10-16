import type { Point } from '../../src/types.js';
import type { Bounds2D } from '../../src/SpatialIndex.js';
export interface EntitySpec extends Point {
  readonly id: string;
  readonly label: string;
  readonly kind:
    | 'enemy'
    | 'guide'
    | 'item'
    | 'gate'
    | 'beacon'
    | 'destination'
    | 'prop'
    | 'building';
  readonly group: string;
  readonly visible: boolean;
  readonly acceptsItemRef?: string;
  readonly acceptsItemRefs?: string[];
  readonly requiresItemRef?: string;
  readonly description?: string;
  readonly initialOwnerRef?: string;
  readonly initialUses?: number;
  readonly initialContents?: 'empty' | 'water';
  readonly initialStates?: Record<string, boolean>;
  readonly bounds?: { minX: number; minY: number; maxX: number; maxY: number };
}
export interface ItemUseRule {
  readonly itemRef: string;
  readonly targetRef: string;
  readonly requiresContents?: 'empty' | 'water';
  readonly requiresStates?: Record<string, boolean>;
  readonly setsStates?: Record<string, boolean>;
  readonly setsContents?: 'empty' | 'water';
  readonly consumesItem?: boolean;
  readonly usesMatch?: boolean;
}
export interface ItemOperation {
  readonly applied: boolean;
  readonly message: string;
}
export interface WorldSpec {
  readonly itemUses?: readonly ItemUseRule[];

  readonly spawn: Point;
  readonly locations: readonly {
    readonly id: string;
    readonly label: string;
    readonly bounds: Bounds2D;
  }[];
  readonly entities: readonly EntitySpec[];
}
export interface EntityState extends EntitySpec {
  visible: boolean;
  defeated: boolean;
  collected: boolean;
  open: boolean;
  lit: boolean;
  active: boolean;
  interacted: boolean;
  deliveredTo: string | null;
  ownerRef: string | null;
  quantity: number;
  contents: 'empty' | 'water' | null;
  usesRemaining: number | null;
  states: Record<string, boolean>;
}
export interface WorldEvent {
  readonly sequence: number;
  readonly kind:
    | 'location'
    | 'defeat'
    | 'pickup'
    | 'delivery'
    | 'interaction'
    | 'state'
    | 'use';
  readonly ref: string;
}
const inside = (p: Point, b: Bounds2D) =>
  p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
/** Ordinary game state and interactions. Contains no quest IDs, stages or transitions. */
export class EncounterWorld {
  readonly entities: EntityState[];
  readonly events: WorldEvent[] = [];
  readonly visited = new Set<string>();
  readonly inside = new Set<string>();
  position: Readonly<Point>;
  revision = 0;
  sequence = 0;
  historyAvailable = true;
  historyComplete = true;
  disposed = false;
  constructor(
    readonly spec: WorldSpec,
    priorItem = false,
  ) {
    if (
      new Set(spec.entities.map((e) => e.id)).size !== spec.entities.length ||
      new Set(spec.locations.map((l) => l.id)).size !== spec.locations.length
    )
      throw new Error('Duplicate world reference');
    this.position = { ...spec.spawn };
    this.entities = spec.entities.map((e) => ({
      ...e,
      defeated: false,
      collected: priorItem && e.kind === 'item',
      open: false,
      lit: false,
      active: false,
      interacted: false,
      deliveredTo: null,
      ownerRef:
        e.kind === 'item'
          ? priorItem
            ? 'player'
            : (e.initialOwnerRef ?? null)
          : null,
      quantity: e.kind === 'item' ? 1 : 0,
      contents: e.initialContents ?? null,
      usesRemaining: e.initialUses ?? null,
      states: { ...e.initialStates },
    }));
    for (const e of this.entities) {
      if (
        e.initialOwnerRef &&
        !this.entities.some(
          (h) => h.id === e.initialOwnerRef && h.kind === 'guide',
        )
      )
        throw new Error('Unknown initial item holder');
      if (
        e.initialUses !== undefined &&
        (!Number.isSafeInteger(e.initialUses) || e.initialUses < 0)
      )
        throw new Error('Invalid item uses');
      if (
        e.initialStates &&
        Object.keys(e.initialStates).some((k) =>
          ['near', 'visible', 'open', 'defeated', 'inspected'].includes(k),
        )
      )
        throw new Error('Intrinsic states must not duplicate entity fields');
    }
    for (const rule of spec.itemUses ?? []) {
      const item = this.entities.find((e) => e.id === rule.itemRef);
      const target = this.entities.find((e) => e.id === rule.targetRef);
      if (
        !item ||
        item.kind !== 'item' ||
        !target ||
        target.kind === 'item' ||
        Object.keys({ ...rule.requiresStates, ...rule.setsStates }).some(
          (k) => !Object.hasOwn(target.states, k),
        )
      )
        throw new Error('Invalid item interaction rule');
    }
    for (const e of this.entities)
      if (e.collected) {
        e.visible = false;
        this.event('pickup', e.id);
      }
  }
  live(): void {
    if (this.disposed) throw new Error('Encounter world disposed');
  }
  event(kind: WorldEvent['kind'], ref: string): void {
    this.sequence++;
    if (this.events.length < 512)
      this.events.push({ sequence: this.sequence, kind, ref });
    else this.historyComplete = false;
    this.revision++;
  }
  observe(position: Readonly<Point>): void {
    this.live();
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
      throw new Error('Invalid player pose');
    if (position.x !== this.position.x || position.y !== this.position.y)
      this.revision++;
    const beforeNear = this.spec.itemUses
      ? new Map(this.entities.map((e) => [e.id, this.near(e)]))
      : undefined;
    this.position = { ...position };
    if (beforeNear)
      for (const e of this.entities)
        if (!beforeNear.get(e.id) && this.near(e))
          this.event('state', e.id + '/near');
    for (const location of this.spec.locations) {
      const entered = inside(position, location.bounds);
      if (entered && !this.inside.has(location.id)) {
        this.inside.add(location.id);
        this.visited.add(location.id);
        this.event('location', location.id);
      }
      if (!entered) this.inside.delete(location.id);
    }
  }
  interact(id?: string): string {
    this.live();
    const candidates = this.entities
      .filter(
        (e) =>
          (!id || e.id === id) &&
          e.visible &&
          !e.defeated &&
          !e.collected &&
          (e.kind === 'enemy' ||
            e.kind === 'item' ||
            e.kind === 'beacon' ||
            e.kind === 'destination' ||
            e.kind === 'prop') &&
          (this.spec.itemUses
            ? this.near(e, 42)
            : Math.hypot(e.x - this.position.x, e.y - this.position.y) <= 42),
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - this.position.x, a.y - this.position.y) -
          Math.hypot(b.x - this.position.x, b.y - this.position.y),
      );
    const e = candidates[0];
    if (!e)
      return 'Move within 42 pixels of an enemy, item or interactive object.';
    if (this.spec.itemUses && e.kind !== 'beacon') {
      if (e.kind === 'item') {
        if (e.ownerRef !== null || e.quantity === 0)
          return 'This item is not on the ground.';
        e.ownerRef = 'player';
        e.collected = true;
        e.visible = false;
        this.event('pickup', e.id);
        return `${e.label} collected.`;
      }
      if (e.kind === 'destination' || e.kind === 'prop') {
        e.interacted = true;
        this.event('interaction', e.id);
        this.event('state', e.id + '/inspected');
        return `${e.label} inspected.`;
      }
    }
    if (e.kind === 'beacon' || e.kind === 'destination') {
      if (e.kind === 'destination') {
        e.interacted = true;
        this.event('interaction', e.id);
      }
      const item = this.entities.find(
        (i) =>
          (i.id === e.acceptsItemRef || e.acceptsItemRefs?.includes(i.id)) &&
          i.kind === 'item' &&
          i.collected &&
          !i.deliveredTo,
      );
      if (!item)
        return e.kind === 'beacon'
          ? `${e.label} needs its matching carried seal.`
          : `${e.label} inspected. It accepts carried items listed in its details.`;
      item.deliveredTo = e.id;
      this.event('delivery', `${item.id}@${e.id}`);
      return `${item.label} delivered to ${e.label}.`;
    }
    if (e.kind === 'prop') {
      e.interacted = true;
      this.event('interaction', e.id);
      return `${e.label} inspected.`;
    }
    if (e.kind === 'enemy') {
      if (
        e.requiresItemRef &&
        !this.entities.some(
          (i) =>
            i.id === e.requiresItemRef &&
            (this.spec.itemUses
              ? i.ownerRef === 'player' && i.quantity > 0
              : i.collected && !i.deliveredTo),
        )
      )
        return `A carried weapon is required to fight ${e.label}.`;
      e.defeated = true;
      if (this.spec.itemUses) this.event('state', e.id + '/defeated');
      e.visible = false;
      this.event('defeat', e.id);
      return `${e.label} defeated.`;
    }
    e.collected = true;
    e.visible = false;
    this.event('pickup', e.id);
    return `${e.label} collected.`;
  }
  near(e: EntityState, distance = 48): boolean {
    if (
      !e.visible ||
      e.defeated ||
      Math.hypot(e.x - this.position.x, e.y - this.position.y) > distance
    )
      return false;
    // The same blockers used for movement also obstruct interactions.
    return !this.blockers().some((blocker) => {
      if (blocker.id === e.id) return false;
      let low = 0,
        high = 1;
      for (const axis of ['x', 'y'] as const) {
        const start = this.position[axis],
          delta = e[axis] - start;
        const min = axis === 'x' ? blocker.bounds.minX : blocker.bounds.minY;
        const max = axis === 'x' ? blocker.bounds.maxX : blocker.bounds.maxY;
        if (delta === 0) {
          if (start < min || start > max) return false;
        } else {
          const a = (min - start) / delta,
            b = (max - start) / delta;
          low = Math.max(low, Math.min(a, b));
          high = Math.min(high, Math.max(a, b));
          if (low > high) return false;
        }
      }
      return true;
    });
  }
  supportedStates(e: EntityState): string[] {
    if (e.kind === 'item') return [];
    return [
      'near',
      'visible',
      ...(['prop', 'destination'].includes(e.kind) ? ['inspected'] : []),
      ...(e.kind === 'gate' ? ['open'] : []),
      ...(e.kind === 'enemy' ? ['defeated'] : []),
      ...Object.keys(e.states),
    ];
  }
  stateValue(e: EntityState, state: string): boolean {
    if (!this.supportedStates(e).includes(state))
      throw new Error('Unsupported entity state');
    if (state === 'near') return this.near(e);
    if (state === 'visible') return e.visible;
    if (state === 'inspected') return e.interacted;
    if (state === 'open') return e.open;
    if (state === 'defeated') return e.defeated;
    return e.states[state]!;
  }
  setState(e: EntityState, state: string, value: boolean): void {
    if (
      !this.supportedStates(e).includes(state) ||
      state === 'near' ||
      state === 'inspected'
    )
      throw new Error('Unsupported consequence state');
    const old = this.stateValue(e, state);
    if (state === 'open') e.open = value;
    else if (state === 'visible') e.visible = value;
    else if (state === 'defeated') e.defeated = value;
    else e.states[state] = value;
    if (old !== value) {
      this.revision++;
      if (value) this.event('state', e.id + '/' + state);
    }
  }
  carried(): EntityState[] {
    return this.entities.filter(
      (e) => e.kind === 'item' && e.ownerRef === 'player' && e.quantity > 0,
    );
  }
  giveItem(itemRef: string, fromRef: string, toRef: string): ItemOperation {
    this.live();
    const item = this.entities.find(
      (e) => e.id === itemRef && e.kind === 'item',
    );
    const person = this.entities.find(
      (e) =>
        e.id === (fromRef === 'player' ? toRef : fromRef) && e.kind === 'guide',
    );
    if (
      !item ||
      !person ||
      fromRef === toRef ||
      (fromRef !== 'player' && toRef !== 'player') ||
      item.ownerRef !== fromRef ||
      item.quantity === 0 ||
      !this.near(person)
    )
      return {
        applied: false,
        message:
          'Transfer requires the current holder, available item and a nearby character.',
      };
    item.ownerRef = toRef;
    item.collected = toRef === 'player';
    item.visible = false;
    item.deliveredTo = null;
    this.revision++;
    if (toRef === 'player') this.event('pickup', item.id);
    return {
      applied: true,
      message: `${item.label} given to ${toRef === 'player' ? 'you' : person.label}.`,
    };
  }
  useItem(itemRef: string, targetRef: string): ItemOperation {
    this.live();
    const item = this.entities.find(
      (e) => e.id === itemRef && e.kind === 'item',
    );
    const target = this.entities.find((e) => e.id === targetRef);
    const rule = this.spec.itemUses?.find(
      (r) => r.itemRef === itemRef && r.targetRef === targetRef,
    );
    if (
      !item ||
      !target ||
      !rule ||
      item.ownerRef !== 'player' ||
      item.quantity === 0 ||
      !this.near(target, 42) ||
      (rule.requiresContents !== undefined &&
        item.contents !== rule.requiresContents) ||
      (rule.usesMatch && (item.usesRemaining ?? 0) === 0) ||
      Object.entries(rule.requiresStates ?? {}).some(
        ([key, value]) => target.states[key] !== value,
      )
    )
      return {
        applied: false,
        message:
          'That use is not supported or its item, proximity or target-state requirements are not met.',
      };
    // All requirements are checked before the first write.
    if (rule.setsContents !== undefined) item.contents = rule.setsContents;
    if (rule.usesMatch) item.usesRemaining!--;
    if (rule.consumesItem) {
      item.ownerRef = null;
      item.quantity = 0;
      item.collected = true;
      item.deliveredTo = target.id;
      item.visible = false;
      this.event('delivery', item.id + '@' + target.id);
    }
    for (const [state, value] of Object.entries(rule.setsStates ?? {}))
      this.setState(target, state, value);
    this.event('use', item.id + '@' + target.id);
    return { applied: true, message: `${item.label} used on ${target.label}.` };
  }
  nearestTarget(): EntityState | undefined {
    return this.entities
      .filter(
        (e) => e.kind !== 'item' && e.kind !== 'guide' && this.near(e, 42),
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - this.position.x, a.y - this.position.y) -
          Math.hypot(b.x - this.position.x, b.y - this.position.y),
      )[0];
  }
  blockers(): { id: string; bounds: Bounds2D }[] {
    return this.entities
      .filter((e) => (e.kind === 'gate' && !e.open) || e.kind === 'building')
      .map((e) => ({
        id: e.id,
        bounds: e.bounds ?? {
          minX: e.x - 12,
          minY: e.y - 64,
          maxX: e.x + 12,
          maxY: e.y + 64,
        },
      }));
  }
  count(kind: WorldEvent['kind'], ref: string, after: number): number {
    return this.events.filter(
      (e) =>
        e.sequence > after &&
        e.kind === kind &&
        (e.ref === ref ||
          this.entities.some(
            (entity) => entity.id === e.ref && entity.group === ref,
          )),
    ).length;
  }
  dispose(): undefined {
    this.disposed = true;
    return;
  }
}
