import { assertSynchronous, invokeSynchronous } from './synchronous.js';

export type Cleanup = (() => undefined) | { dispose(): undefined };

/** Synchronous owned resources; reverse cleanup, once, even after failures. */
export class ResourceScope {
  #resources = new Set<Cleanup>();
  #disposed = false;
  own<T extends Cleanup>(resource: T): T {
    if (this.#disposed) throw new Error('Resource scope is disposed');
    if (
      typeof resource !== 'function' &&
      (!resource || typeof resource.dispose !== 'function')
    ) {
      throw new TypeError('Resource must be a cleanup function or disposable');
    }
    assertSynchronous(
      typeof resource === 'function' ? resource : resource.dispose,
      'resource.dispose',
    );
    this.#resources.add(resource);
    return resource;
  }
  dispose(): undefined {
    if (this.#disposed) return;
    this.#disposed = true;
    const errors: unknown[] = [];
    for (const resource of [...this.#resources].reverse()) {
      try {
        invokeSynchronous(
          typeof resource === 'function' ? resource : resource.dispose,
          resource,
          [],
          'resource.dispose',
        );
      } catch (error) {
        errors.push(error);
      }
    }
    this.#resources.clear();
    if (errors.length)
      throw new AggregateError(errors, 'Resource cleanup failed');
  }
}
