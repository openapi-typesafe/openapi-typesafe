/**
 * Parameter values in a query key (ADR-046): every form the fetch client, or a serializer set on
 * it, may send for a value, as plain values that TanStack Query's hash and its filters read
 * alike, also after a JSON round trip (`dehydrate` and `hydrate`).
 */

/** The objects a walk is inside of, so that a reference back to one of them ends it. */
type Ancestors = readonly object[];

/**
 * The names under which the key of an object holds the forms a serializer may send besides its
 * members: what its `toJSON` returns and its own text. No request names a member like this.
 */
const JSON_FORM = "toJSON()";
const TEXT_FORM = "toString()";

/**
 * The name of the member that stands for an `undefined` array item, also a hole. The hash writes
 * such an item as `null`, so `[1, undefined]` had the key of `[1, null]`, which a `qs` serializer
 * sends differently, and after a JSON round trip the key held `null`, which a filter with the key
 * of `undefined` does not match. The item is a plain object, which JSON keeps as it is.
 */
const UNDEFINED_ITEM = "(undefined)";

/**
 * What `read` gives, or undefined when it throws. A `toJSON`, a `toString`, a `toISOString` or a
 * getter of the caller's value may throw, and a key is made while the component renders, where a
 * throw crashes the component. The key is then left without that form, and the request, which
 * reads the value again, reports the error as a query error.
 */
function attempt<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/**
 * The text `String` gives a value, as `Headers` and a serializer that writes text send it, or
 * undefined when `String` throws: for an object without a `toString` (`Object.create(null)`) or
 * with one that throws.
 */
export function textOf(value: unknown): string | undefined {
  return attempt(() => String(value));
}

/**
 * A parameter value as the fetch client sends it. `NaN`, the infinities and a bigint are their
 * text, which is sent, while TanStack Query's hash writes the numbers as `null`, which sends
 * nothing, and throws for a bigint. A valid date, which the client tells by its `toISOString`, is
 * its ISO text. An array is its items, and any other object, also an invalid date, `objectKey`.
 * A function, which no serializer sends as data and which filters compare by identity, and a
 * reference back to an object the walk is inside of, which no request can send, are left out.
 */
function sentValue(value: unknown, ancestors: Ancestors): unknown {
  if (typeof value === "number" || typeof value === "bigint") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value !== "object" || value === null) {
    return typeof value === "function" ? undefined : value;
  }
  if (ancestors.includes(value)) {
    return undefined;
  }
  if (typeof (value as Partial<Date>).toISOString === "function") {
    // `Date.prototype.toJSON` calls the `toISOString` of any object, and gives `null` for an
    // invalid time instead of throwing while the component renders; the request reports it.
    const isoText = attempt(() => Date.prototype.toJSON.call(value)) ?? null;
    if (isoText !== null) {
      return isoText;
    }
  }
  return Array.isArray(value) ? itemsKey(value, ancestors) : objectKey(value, ancestors);
}

/**
 * The items of an array as `sentValue`, with an item it leaves out (`undefined`, a hole, a
 * function) as an object of the one member `UNDEFINED_ITEM`.
 */
function itemsKey(items: readonly unknown[], ancestors: Ancestors): unknown[] {
  const inner = [...ancestors, items];
  return Array.from(items, (item) => {
    const key = sentValue(item, inner);
    return key === undefined ? { [UNDEFINED_ITEM]: true } : key;
  });
}

/**
 * An object parameter value as plain values, by every form a serializer may send. The default
 * serializers send its members, so the key holds them. A `querySerializer` or `pathSerializer`
 * of the client, which the key cannot see, may send its `toJSON` form or its text instead, so the
 * key also holds those it has: a URL, a Temporal value or a value object with private fields has
 * no members, and keyed by them alone all such values shared one entry. The object itself is not
 * kept: TanStack Query's filters match an object by its own members.
 */
export function objectKey(value: object, ancestors: Ancestors): Record<string, unknown> {
  const key = sentMembers(value, ancestors);
  const { toJSON } = value as { toJSON?: unknown };
  if (typeof toJSON === "function") {
    key[JSON_FORM] = jsonFormKey(
      attempt(() => toJSON.call(value)),
      [...ancestors, value],
    );
  }
  const text = textOf(value);
  if (text !== undefined && text !== Object.prototype.toString.call(value)) {
    key[TEXT_FORM] = text;
  }
  return key;
}

/**
 * A `toJSON` form as `JSON.stringify` writes it: an object form by its members, since JSON does
 * not call a `toJSON` again, which also ends a `toJSON` that returns its own object.
 */
function jsonFormKey(form: unknown, ancestors: Ancestors): unknown {
  const isRecord = typeof form === "object" && form !== null && !Array.isArray(form);
  return isRecord ? sentMembers(form, ancestors) : sentValue(form, ancestors);
}

/**
 * The own enumerable members of an object, each as `sentValue`, as the fetch client and JSON read
 * them. A member that `sentValue` leaves out, or whose getter throws, is not there, as the hash
 * leaves it out. An empty object stays, as `{}` does.
 */
export function sentMembers(record: object, ancestors: Ancestors): Record<string, unknown> {
  const inner = [...ancestors, record];
  const members = Object.keys(record).map((name) => [
    name,
    sentValue(
      attempt(() => (record as Record<string, unknown>)[name]),
      inner,
    ),
  ]);
  return Object.fromEntries(members.filter(([, value]) => value !== undefined));
}
