/**
 * Exhaustiveness guard for `switch` over a closed union: the call compiles only when every variant
 * is handled. Reaching it at run time means a value outside the union, which is a bug, so it
 * throws.
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected variant: ${JSON.stringify(value)}`);
}
