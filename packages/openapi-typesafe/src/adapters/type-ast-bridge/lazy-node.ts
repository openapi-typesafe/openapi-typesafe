/**
 * A TypeScript node that is created on first use (for the deprecated `QUESTION_TOKEN` export):
 * the package must import without TypeScript installed (ADR-004, decision 4). Every property read,
 * write and check goes to the node, so the TypeScript factory and printer see a normal node.
 */
export function lazyNode<T extends object>(create: () => T): T {
  let node: T | undefined;
  const target = (): T => {
    node ??= create();
    return node;
  };
  return new Proxy({} as T, {
    get: (_, key) => Reflect.get(target(), key),
    set: (_, key, value) => Reflect.set(target(), key, value),
    has: (_, key) => Reflect.has(target(), key),
    ownKeys: () => Reflect.ownKeys(target()),
    getOwnPropertyDescriptor: (_, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(target(), key);
      // A proxy may report a property only as configurable when its own (empty) target lacks it.
      return descriptor === undefined ? undefined : { ...descriptor, configurable: true };
    },
    getPrototypeOf: () => Reflect.getPrototypeOf(target()),
  });
}
