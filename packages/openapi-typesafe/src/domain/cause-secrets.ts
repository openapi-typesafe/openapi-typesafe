import { redactUrlSecrets } from "./url-secrets.js";

/**
 * The `cause` of a typed error is shown wherever the error is: `console.error(error)` and
 * `util.inspect` print the whole chain, and error trackers send it. A lower-level error names the
 * URL it failed on (fetch refuses `https://user:token@host/…` and quotes it), and may keep it in
 * nested objects too (Redocly's parse error holds `originalError.mark.name` and
 * `source.absoluteRef`), so the chain must hide the same secrets as the message (url-secrets.ts)
 * at every depth.
 */

/**
 * How deep the walk copies a cause. The data of a cause is shallow (Redocly's deepest URL is three
 * levels below the error); a value below this depth is dropped, so no secret is kept unread.
 */
const MAX_CAUSE_DEPTH = 8;

interface Walk {
  /** The objects on the way from the cause to the value, so a cycle is cut where it closes. */
  readonly path: ReadonlySet<object>;
  readonly depth: number;
}

function deeper(walk: Walk, value: object): Walk {
  return { path: new Set([...walk.path, value]), depth: walk.depth + 1 };
}

/** An array with each item hidden, or the array itself when no item holds a secret. */
function redactedArray(array: readonly unknown[], walk: Walk): readonly unknown[] {
  const inner = deeper(walk, array);
  const items = array.map((item) => redactedValue(item, inner));
  return items.every((item, index) => item === array[index]) ? array : items;
}

/**
 * A copy of `value` with the same prototype, its own properties (`message`, `stack`, `code`,
 * `input`, a nested `cause` or object) with URL secrets hidden, or `value` itself when none of
 * them holds one. Each property is read through its getter (V8 keeps `stack` behind one) and
 * copied as a value.
 */
function redactedObject(value: object, walk: Walk): object {
  const inner = deeper(walk, value);
  // An error is copied as a real error, so `util.inspect` and `util.types.isNativeError` treat
  // the copy as one.
  const copy: object =
    value instanceof Error
      ? Object.setPrototypeOf(new Error(), Object.getPrototypeOf(value))
      : Object.create(Object.getPrototypeOf(value) as object | null);
  let isChanged = false;
  for (const key of Reflect.ownKeys(value)) {
    const property: unknown = Reflect.get(value, key);
    const shown = redactedValue(property, inner);
    isChanged ||= shown !== property;
    const enumerable = Object.getOwnPropertyDescriptor(value, key)?.enumerable === true;
    Object.defineProperty(copy, key, {
      value: shown,
      enumerable,
      writable: true,
      configurable: true,
    });
  }
  return isChanged ? copy : value;
}

/** Binary data and functions hold no text to hide, so they are kept as they are. */
function isOpaque(value: object): boolean {
  return typeof value === "function" || ArrayBuffer.isView(value) || value instanceof ArrayBuffer;
}

function redactedValue(value: unknown, walk: Walk): unknown {
  if (typeof value === "string") {
    return redactUrlSecrets(value);
  }
  if (typeof value !== "object" || value === null || isOpaque(value)) {
    return value;
  }
  if (walk.path.has(value) || walk.depth >= MAX_CAUSE_DEPTH) {
    return undefined;
  }
  return Array.isArray(value) ? redactedArray(value, walk) : redactedObject(value, walk);
}

/** The cause of a typed error with the URL secrets of its whole chain hidden. */
export function redactCauseSecrets(cause: unknown): unknown {
  return redactedValue(cause, { path: new Set(), depth: 0 });
}
