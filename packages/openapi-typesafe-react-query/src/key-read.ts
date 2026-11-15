/**
 * How a query key reads the caller's values (ADR-046), one rule for bodies, parameters, headers
 * and the other init members alike: which members a value has, which values are left out, and
 * that no read throws while the component renders. The body and the parameter keys write what is
 * read each by their own rule, as their serializers send it.
 */

/** The objects a walk is inside of, so that a reference back to one of them ends it. */
export type Ancestors = readonly object[];

/** How a body or a parameter key writes one value it has read. */
export type Walk<K> = (value: unknown, ancestors: Ancestors) => K;

/** `[object Name]`: the type tag is between these indexes of `Object.prototype.toString`. */
const TYPE_TAG_START = "[object ".length;
const TYPE_TAG_END = -1;

/**
 * The collections whose contents are in none of their members, each with the name under which a
 * key holds what iterating it gives: JSON and the default serializers send `{}` or nothing for
 * any of them, while a serializer of the client that sends their contents can only read those.
 * Other iterables are not iterated: an iterator is used up by reading it, which would take the
 * values its request sends, and a class of the caller may iterate without end. The names are in
 * band, as `"toJSON()"` is; no request names a member like this.
 */
const COLLECTION_FORMS: readonly (readonly [className: string, form: string])[] = [
  ["Map", "entries()"],
  ["Set", "values()"],
];

/**
 * What `read` gives, or undefined when it throws. A getter, a `toJSON`, a `toString`, a Proxy
 * trap of the caller's value, or a revoked Proxy, may throw, and a key is made while the
 * component renders, where a throw crashes the component. The key is then left without what it
 * could not read, and the request, which reads the value again, reports the error as a query
 * error.
 */
export function attempt<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/**
 * Whether a value is of the class `name`: an instance of this realm's global class of that name
 * (React Native's classes have no type tag), or a value with its type tag (a class of another
 * realm or of the `undici` package), as the fetch client tells bodies (ADR-030).
 */
export function isClass(value: object, name: string): boolean {
  const type = (globalThis as Record<string, unknown>)[name];
  return (
    (typeof type === "function" && value instanceof type) ||
    Object.prototype.toString.call(value).slice(TYPE_TAG_START, TYPE_TAG_END) === name
  );
}

/**
 * The members of an object as a key reads them, by name: the items of an array by index, also a
 * hole; the own enumerable members of any other object, which JSON and the fetch client's
 * serializers send, a member whose getter throws as `undefined`; and the contents of a Map or a
 * Set as one more member, as `COLLECTION_FORMS` names it. May throw for a revoked Proxy.
 */
export function readMembers(value: object): (readonly [string, unknown])[] {
  if (Array.isArray(value)) {
    return Array.from(value, (item, index) => [String(index), item] as const);
  }
  const members = Object.keys(value).map(
    (name) => [name, attempt(() => (value as Record<string, unknown>)[name])] as const,
  );
  const collection = COLLECTION_FORMS.find(([className]) => isClass(value, className));
  return collection === undefined
    ? members
    : [...members, [collection[1], Array.from(value as Iterable<unknown>)]];
}

/**
 * A value as `walk` writes it, or undefined when the key leaves it out: a function, which no
 * serializer sends as data (JSON leaves it out) and filters compare by identity, so a filter with
 * the key of a later render, which has a new inline function, or after `hydrate`, which has none,
 * missed the query; a reference back to an object the walk is inside of, which no request can
 * send; and a value that throws while it is read.
 */
export function keyOf<K>(value: unknown, ancestors: Ancestors, walk: Walk<K>): K | undefined {
  if (typeof value === "function" || ancestors.includes(value as object)) {
    return undefined;
  }
  return attempt(() => walk(value, ancestors));
}

/** The members of an object as `readMembers` reads them, each as `keyOf` writes it. */
export function walkMembers<K>(
  value: object,
  ancestors: Ancestors,
  walk: Walk<K>,
): (readonly [string, K | undefined])[] {
  const inner = [...ancestors, value];
  return readMembers(value).map(([name, member]) => [name, keyOf(member, inner, walk)] as const);
}
