/**
 * Append every item of `items` to `target`. `target.push(...items)` passes each item as an
 * argument, and engines limit the arguments of a call (V8 throws a RangeError from about 125,000),
 * so a list as long as a document allows (an `enum`, an `anyOf`, `examples`) must not be spread.
 */
export function appendAll<T>(target: T[], items: Iterable<T>): void {
  for (const item of items) {
    target.push(item);
  }
}
