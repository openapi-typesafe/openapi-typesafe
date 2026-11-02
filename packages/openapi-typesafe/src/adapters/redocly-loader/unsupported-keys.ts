import { ERROR_CODES, OpenAPITypesafeError } from "../../domain/errors.js";

/**
 * Keys Redocly 1.34 cannot walk. It looks up the type of every key with `type.properties[key]`,
 * which also finds inherited `Object.prototype` members; it then calls a found function with no
 * `this`, and these methods throw a `TypeError` for that. Redocly 2.x looks up own keys only
 * (ADR-005 keeps 1.34). `toString` and `constructor` do not throw, and load as they should.
 *
 * Redocly does not walk every value (`default` and `const` are data), so a document with such a
 * key is not rejected up front: the loader looks for them only after Redocly threw a `TypeError`.
 */
export const UNSUPPORTED_KEYS: ReadonlySet<string> = new Set([
  "hasOwnProperty",
  "isPrototypeOf",
  "propertyIsEnumerable",
  "toLocaleString",
  "valueOf",
  "__defineGetter__",
  "__defineSetter__",
  "__lookupGetter__",
  "__lookupSetter__",
]);

/** Enough found keys in the message to act on; `details.keys` has all of them. */
const KEYS_IN_MESSAGE = 5;

/** A parsed document and where it was loaded from. */
export interface LoadedDocument {
  readonly source: string;
  readonly parsed: unknown;
}

/** An unsupported key: its JSON pointer and the document that has it. */
export interface UnsupportedKey {
  readonly key: string;
  readonly pointer: string;
  readonly source: string;
}

interface PendingNode {
  readonly value: object;
  readonly pointer: string;
}

/** RFC 6901: `~` becomes `~0` and `/` becomes `~1`. */
function escapePointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

/**
 * The unsupported keys of one parsed document. The walk uses its own stack, so a deeply nested
 * document is checked without running out of call stack; nodes shared by YAML aliases are checked
 * once.
 */
function unsupportedKeysOf(document: LoadedDocument): UnsupportedKey[] {
  const found: UnsupportedKey[] = [];
  const visited = new WeakSet<object>();
  const pending: PendingNode[] = [];
  const enqueue = (value: unknown, pointer: string): void => {
    if (typeof value === "object" && value !== null && !visited.has(value)) {
      visited.add(value);
      pending.push({ value, pointer });
    }
  };
  enqueue(document.parsed, "#");
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    for (const [key, child] of Object.entries(node.value)) {
      const pointer = `${node.pointer}/${escapePointerSegment(key)}`;
      if (UNSUPPORTED_KEYS.has(key)) {
        found.push({ key, pointer, source: document.source });
      }
      enqueue(child, pointer);
    }
  }
  return found;
}

/** Every unsupported key of the given documents. */
export function findUnsupportedKeys(documents: readonly LoadedDocument[]): UnsupportedKey[] {
  return documents.flatMap(unsupportedKeysOf);
}

function describeKey(found: UnsupportedKey): string {
  return `"${found.key}" at ${found.pointer} in ${found.source}`;
}

/** The typed error for the keys the schema loader failed on; `cause` is Redocly's `TypeError`. */
export function unsupportedKeysError(
  keys: readonly UnsupportedKey[],
  cause: unknown,
): OpenAPITypesafeError {
  const listed = keys.slice(0, KEYS_IN_MESSAGE).map(describeKey);
  const more = keys.length > KEYS_IN_MESSAGE ? ` and ${keys.length - KEYS_IN_MESSAGE} more` : "";
  return new OpenAPITypesafeError({
    code: ERROR_CODES.SCHEMA_KEY_UNSUPPORTED,
    message:
      "The schema loader (Redocly 1.x) failed on a key named like a built-in object method. " +
      `Rename it: ${listed.join(", ")}${more}.`,
    details: { keys: keys.map((found) => ({ ...found })) },
    cause,
  });
}
