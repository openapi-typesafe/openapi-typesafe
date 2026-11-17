/**
 * Parameter values in a query key (ADR-046): every form the fetch client, or a serializer set on
 * it, may send for a value, as plain values that TanStack Query's hash and its filters read
 * alike, also after a JSON round trip (`dehydrate` and `hydrate`). Values are read by the rule
 * of `key-read.ts`, which bodies and headers share.
 */
import {
  type Ancestors,
  attempt,
  inside,
  keyOf,
  type MemberNames,
  valueMemberNames,
  walkMembers,
} from "./key-read.js";

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
 * The name of the member that stands for a number JSON cannot hold, `NaN`, an infinity or a
 * bigint, with its text. A serializer may send it as its text (`qs`, the fetch client's own
 * serializers) or not (JSON writes `null` for `NaN` and fails for a bigint), so keyed as its text
 * `NaN` shared the key of `"NaN"`, which JSON sends as a string, and keyed as `null` it shared
 * the key of `null`. The form is a plain object, which JSON keeps as it is.
 */
const NUMBER_FORM = "(number)";

/**
 * The text `String` gives a value, as `Headers` and a serializer that writes text send it, or
 * undefined when `String` throws: for an object without a `toString` (`Object.create(null)`) or
 * with one that throws.
 */
export function textOf(value: unknown): string | undefined {
  return attempt(() => String(value));
}

/**
 * A parameter value as the fetch client sends it, once `keyOf` has left out a function, a
 * reference back to an object the walk is inside of and a value that throws. `NaN`, the
 * infinities and a bigint are an object of the one member `NUMBER_FORM`, while TanStack Query's
 * hash writes the numbers as `null` and throws for a bigint. A valid date, which the client
 * tells by its `toISOString`, is its ISO text. An array is its items, and any other object, also
 * an invalid date, `objectKey`.
 */
function sentValue(value: unknown, ancestors: Ancestors): unknown {
  if (typeof value === "number" || typeof value === "bigint") {
    return Number.isFinite(value) ? value : { [NUMBER_FORM]: String(value) };
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  // `Date.prototype.toJSON` calls the `toISOString` of any object, and gives `null` for an
  // invalid time instead of throwing while the component renders; the request reports it.
  const isoText = attempt(() =>
    typeof (value as Partial<Date>).toISOString === "function"
      ? Date.prototype.toJSON.call(value)
      : null,
  );
  if (isoText != null) {
    return isoText;
  }
  return Array.isArray(value) ? itemsKey(value, ancestors) : objectKey(value, ancestors);
}

/**
 * The items of an array as `sentValue`, with an item `keyOf` leaves out (`undefined`, a hole, a
 * function) as an object of the one member `UNDEFINED_ITEM`.
 */
function itemsKey(items: readonly unknown[], ancestors: Ancestors): unknown[] {
  return walkMembers(items, ancestors, sentValue).map(([, key]) =>
    key === undefined ? { [UNDEFINED_ITEM]: true } : key,
  );
}

/**
 * An object parameter value as plain values, by every form a serializer may send. The default
 * serializers send its members as `names` lists them (`valueMemberNames`, or `for..in` for a
 * query record), so the key holds them. A `querySerializer` or `pathSerializer` of the client,
 * which the key cannot see, may send its `toJSON` form or its text instead, so the key also holds
 * those it has: a URL, a Temporal value or a value object with private fields has no members, and
 * keyed by them alone all such values shared one entry. The object itself is not kept: TanStack
 * Query's filters match an object by its own members.
 */
export function objectKey(
  value: object,
  ancestors: Ancestors,
  names: MemberNames = valueMemberNames,
): Record<string, unknown> {
  const key = sentMembers(value, ancestors, names);
  const toJSON = attempt(() => (value as { toJSON?: unknown }).toJSON);
  if (typeof toJSON === "function") {
    key[JSON_FORM] = jsonFormKey(
      attempt(() => toJSON.call(value)),
      inside(ancestors, value),
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
  return isRecord ? sentMembers(form, ancestors) : keyOf(form, ancestors, sentValue);
}

/**
 * The members of an object as `readMembers` reads them by `names`, each as `sentValue`. A member
 * that `keyOf` leaves out is not there, as the hash leaves it out. An empty object stays, as `{}`
 * does.
 */
export function sentMembers(
  record: object,
  ancestors: Ancestors,
  names: MemberNames = Object.keys,
): Record<string, unknown> {
  const members = walkMembers(record, ancestors, sentValue, names);
  return Object.fromEntries(members.filter(([, value]) => value !== undefined));
}

/**
 * A path record as `objectKey`, with each of `names` that it does not list read by name: the
 * default path serializer reads `path[name]` for each name of the path template, so a value
 * behind a getter of a class (`get id()`) is sent, while a key of the listed members alone held
 * none of it, and the requests of two ids shared an entry. A name read as `undefined` stays
 * `undefined`, which the caller leaves out (`definedMembers`), as the hash does.
 */
export function pathRecordKey(
  record: object,
  names: readonly string[],
  ancestors: Ancestors,
): Record<string, unknown> {
  const key = objectKey(record, ancestors);
  const inner = inside(ancestors, record);
  const unlisted = names.filter((name) => !Object.hasOwn(key, name));
  const read = unlisted.map((name) => {
    const value = attempt(() => (record as Record<string, unknown>)[name]);
    return [name, keyOf(value, inner, sentValue)] as const;
  });
  return { ...key, ...Object.fromEntries(read) };
}
