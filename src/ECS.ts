/** Typed component identity. Equal names do not alias component types. */
export class Component<T> {
  declare readonly type: T;
  constructor(readonly name: string) {}
}

/** Identity is scoped to its owning World; ids are diagnostic only. */
export interface Entity {
  readonly id: number;
}

/** Data/query storage only. The host schedules systems on its existing clock. */
export class World {
  #nextId = 1;
  #entities = new Map<Entity, Map<object, unknown>>();
  create(): Entity {
    const entity = Object.freeze({ id: this.#nextId++ });
    this.#entities.set(entity, new Map());
    return entity;
  }
  set<T>(entity: Entity, component: Component<T>, value: T): void {
    const data = this.#entities.get(entity);
    if (!data) throw new Error('Entity does not belong to this world');
    data.set(component, value);
  }
  get<T>(entity: Entity, component: Component<T>): T | undefined {
    return this.#entities.get(entity)?.get(component) as T | undefined;
  }
  remove<T>(entity: Entity, component: Component<T>): boolean {
    return this.#entities.get(entity)?.delete(component) ?? false;
  }
  destroy(entity: Entity): boolean {
    return this.#entities.delete(entity);
  }
  /** Snapshot of identities matching every component; no cached query lifecycle. */
  query(...components: readonly Component<unknown>[]): Entity[] {
    return [...this.#entities]
      .filter(([, data]) =>
        components.every((component) => data.has(component)),
      )
      .map(([entity]) => entity);
  }
  clear(): void {
    this.#entities.clear();
  }
}
