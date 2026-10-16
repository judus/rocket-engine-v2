/** Frame hooks cannot suspend execution across views or frames. */
export function assertSynchronous(
  callback: unknown,
  name: string,
): asserts callback is ((...args: never[]) => unknown) | undefined {
  if (callback !== undefined && typeof callback !== 'function') {
    throw new TypeError(`${name} must be a function`);
  }
  if (callback?.constructor?.name === 'AsyncFunction') {
    throw new TypeError(`${name} must be synchronous`);
  }
}

export function invokeSynchronous(
  callback: unknown,
  receiver: unknown,
  args: unknown[],
  name: string,
): undefined {
  if (!callback) return;
  assertSynchronous(callback, name);
  const result: unknown = Reflect.apply(callback, receiver, args);
  if (
    result &&
    (typeof result === 'object' || typeof result === 'function') &&
    'then' in result &&
    typeof result.then === 'function'
  ) {
    // Observe rejected promises while surfacing the synchronous-contract error.
    Promise.resolve(result).catch(() => {});
    throw new TypeError(`${name} must be synchronous; it returned a Promise`);
  }
}
