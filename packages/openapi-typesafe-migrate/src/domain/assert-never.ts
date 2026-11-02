/** Compile-time proof that a switch over a closed union handled every variant. */
export function assertNever(value: never): never {
  throw new Error(`Unexpected variant: ${JSON.stringify(value)}`);
}
