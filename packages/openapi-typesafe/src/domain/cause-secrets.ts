import { redactUrlSecrets } from "./url-secrets.js";

/**
 * The `cause` of a typed error is shown wherever the error is: `console.error(error)` and
 * `util.inspect` print the whole chain, and error trackers send it. A lower-level error names the
 * URL it failed on (fetch refuses `https://user:token@host/…` and quotes it), so the chain must
 * hide the same secrets as the message (url-secrets.ts).
 */

/** A string with its URL secrets hidden; any other value as it is. */
function redactedValue(value: unknown): unknown {
  return typeof value === "string" ? redactUrlSecrets(value) : value;
}

/**
 * A copy of `error` of the same class, its own properties (`message`, `stack`, `code`, `input`, a
 * nested `cause`) with URL secrets hidden, or `error` itself when none of them holds one. Each
 * property is read through its getter (V8 keeps `stack` behind one) and copied as a value.
 */
function redactedError(error: Error, seen: ReadonlySet<Error>): Error {
  const inner = new Set([...seen, error]);
  // A real error with the class of `error`, so `util.inspect` and `util.types.isNativeError`
  // treat it as one.
  const copy = Object.setPrototypeOf(new Error(), Object.getPrototypeOf(error)) as Error;
  let isChanged = false;
  for (const key of Reflect.ownKeys(error)) {
    const value: unknown = Reflect.get(error, key);
    const shown = key === "cause" ? redactedCauseIn(value, inner) : redactedValue(value);
    isChanged ||= shown !== value;
    const enumerable = Object.getOwnPropertyDescriptor(error, key)?.enumerable === true;
    Object.defineProperty(copy, key, {
      value: shown,
      enumerable,
      writable: true,
      configurable: true,
    });
  }
  return isChanged ? copy : error;
}

function redactedCauseIn(cause: unknown, seen: ReadonlySet<Error>): unknown {
  if (!(cause instanceof Error)) {
    return redactedValue(cause);
  }
  // A chain that loops back is cut where it does, so the copy is finite.
  return seen.has(cause) ? undefined : redactedError(cause, seen);
}

/** The cause of a typed error with the URL secrets of its whole chain hidden. */
export function redactCauseSecrets(cause: unknown): unknown {
  return redactedCauseIn(cause, new Set());
}
