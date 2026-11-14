/**
 * The request part of a query key (ADR-046). TanStack Query hashes a key as JSON: a `Headers`
 * object or a list of header pairs hashed as `{}` or by its order, and so did a FormData, a Blob,
 * an ArrayBuffer or a URLSearchParams body. Two requests that differed in them shared one cache
 * entry, and the `queryFn` of that entry sent the request of the first. Two clients with
 * different base URLs shared entries too. The key's init holds the headers and such a body as
 * plain values, and the base URL the request goes to or the client's key scope, so the key names
 * what was fetched.
 */
import { bodyKey } from "./body-key.js";

/**
 * Whether a value is an object literal, such as the `params` of an init and its records, which
 * the fetch client reads by their members.
 */
function isPlainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  const prototype: unknown =
    typeof value === "object" && value !== null ? Object.getPrototypeOf(value) : undefined;
  return prototype === Object.prototype || prototype === null;
}

/** Headers as a plain object, which TanStack Query hashes by its names and values. */
type HeadersRecord = Readonly<Record<string, unknown>>;

/** What the key takes from the fetch client and the options of `createClient`. */
export interface KeyClient {
  /** The fetch client's base URL, `""` without one. */
  readonly baseUrl: string;
  /** The name of the API in every key, in place of the base URL. */
  readonly keyScope?: string | undefined;
}

/**
 * The headers of an init as a plain object. A `Headers` object and a list of pairs, which are both
 * iterable, become the names and values the request sends: names in lowercase, a repeated one
 * joined with `, `, as `Headers` writes them. They are read without `Headers`, which threw for an
 * invalid name or value while the component rendered; the request reports it as a query error. A
 * plain object stays as it is, since its `null` and array values mean more than a string.
 */
function plainHeaders(headers: object): HeadersRecord {
  if (!(Symbol.iterator in headers)) {
    return headers as HeadersRecord;
  }
  const record: Record<string, string> = {};
  for (const pair of headers as Iterable<unknown>) {
    const [name, value] = Array.from(pair as ArrayLike<unknown>);
    const key = String(name).toLowerCase();
    record[key] = key in record ? `${record[key]}, ${String(value)}` : String(value);
  }
  return record;
}

/**
 * The members of an object that are not `undefined`, or undefined when none is. A member set to
 * `undefined` (`headers: token ? … : undefined`, `query: { cursor: undefined }`) sends the same
 * request as none, and TanStack Query's hash leaves it out too, so a record of only such members
 * sends nothing and must not count as one. `null`, `[]` and `{}` members stay: `null` removes a
 * header, and a query serializer of the client may send them.
 */
function definedMembers(record: object): Record<string, unknown> | undefined {
  const members = Object.entries(record).filter(([, value]) => value !== undefined);
  return members.length === 0 ? undefined : Object.fromEntries(members);
}

/**
 * The names under which the key of an object holds the forms a serializer may send besides its
 * members: what its `toJSON` returns and its own text. No request names a member like this.
 */
const JSON_FORM = "toJSON()";
const TEXT_FORM = "toString()";

/**
 * The text `String` gives a value, as `Headers` and a serializer that writes text send it, or
 * undefined for an object without a `toString` (`Object.create(null)`): `String` throws for it,
 * which would crash the component while it renders instead of failing the request.
 */
function textOf(value: unknown): string | undefined {
  const isConvertible =
    typeof value !== "object" ||
    value === null ||
    typeof (value as { toString?: unknown }).toString === "function";
  return isConvertible ? String(value) : undefined;
}

/**
 * A parameter value as the fetch client sends it. `NaN`, the infinities and a bigint are their
 * text, which is sent, while TanStack Query's hash writes the numbers as `null`, which sends
 * nothing, and throws for a bigint. A valid date, which the client tells by its `toISOString`, is
 * its ISO text. An array is its items, and any other object, also an invalid date, `objectKey`.
 */
function sentValue(value: unknown): unknown {
  if (typeof value === "number" || typeof value === "bigint") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (typeof (value as Partial<Date>).toISOString === "function") {
    // `Date.prototype.toJSON` calls the `toISOString` of any object, and gives `null` for an
    // invalid time instead of throwing while the component renders; the request reports it.
    const isoText: unknown = Date.prototype.toJSON.call(value);
    if (isoText !== null) {
      return isoText;
    }
  }
  return Array.isArray(value) ? value.map(sentValue) : objectKey(value);
}

/**
 * An object parameter value as plain values, by every form a serializer may send. The default
 * serializers send its own members, so the key holds them. A `querySerializer` or
 * `pathSerializer` of the client, which the key cannot see, may send its `toJSON` form or its
 * text instead, so the key also holds those it has: a URL, a Temporal value or a value object
 * with private fields has no members, and keyed by them alone all such values shared one entry.
 * The object itself is not kept: TanStack Query's filters match an object by its own members.
 */
function objectKey(value: object): Record<string, unknown> {
  const key = sentMembers(value);
  const { toJSON } = value as { toJSON?: unknown };
  if (typeof toJSON === "function") {
    key[JSON_FORM] = jsonFormKey(toJSON.call(value));
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
function jsonFormKey(form: unknown): unknown {
  const isRecord = typeof form === "object" && form !== null && !Array.isArray(form);
  return isRecord ? sentMembers(form) : sentValue(form);
}

/**
 * A header value as `Headers.set` and `append` send it: its text, so a `Number` object, a URL and
 * a date are their text (a date its local text, not its ISO text), and `5` and `"5"` send one
 * header. An object without a `toString` is its members: the request fails for it.
 */
function headerText(value: unknown): unknown {
  return textOf(value) ?? sentMembers(value as object);
}

/**
 * A value of plain `headers` as the fetch client sends it: an array as the text of each item it
 * appends, any other value as `headerText`. `null`, which removes a header, and `undefined`,
 * which sends nothing, stay.
 */
function headerValueKey(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  return Array.isArray(value) ? value.map(headerText) : headerText(value);
}

/** The own members of an object, each as `sentValue`. An empty object stays, as `{}` does. */
function sentMembers(record: object): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([name, value]) => [name, sentValue(value)]),
  );
}

/**
 * The `params` of an init with the values of its records as `sentValue`, without the records that
 * send nothing: `{}`, `{ query: {} }` and `{ query: { cursor: undefined } }` send the request of
 * no `params`, since the fetch client reads a missing record as an empty one. Undefined when no
 * record is left.
 */
function paramsKey(params: unknown): unknown {
  if (!isPlainRecord(params)) {
    return params;
  }
  const records = Object.entries(params).map(([location, record]) => [
    location,
    isPlainRecord(record) ? definedMembers(sentMembers(record)) : record,
  ]);
  return definedMembers(Object.fromEntries(records));
}

/** The headers of an init as `plainHeaders` of sent texts, or undefined when they set none. */
function headersKey(headers: unknown): unknown {
  if (typeof headers !== "object" || headers === null) {
    return headers;
  }
  const entries = Object.entries(plainHeaders(headers)).map(([name, value]) => [
    name,
    headerValueKey(value),
  ]);
  return definedMembers(Object.fromEntries(entries));
}

/**
 * The init of a query key: the request init with its params and headers without what sends
 * nothing, its body as `bodyKey`, and the client's key scope, or its base URL when the init has
 * none. The `signal` is left out: TanStack Query gives each request its own. Undefined when
 * nothing is left, so a call without an init and one with an init that sends nothing more, such
 * as `{}` or `{ params: { query: { cursor: undefined } } }`, have the key `[method, path]`.
 */
export function queryKeyInit(init: unknown, client: KeyClient): object | undefined {
  const { signal: _signal, ...rest } = (init ?? {}) as {
    signal?: unknown;
    params?: unknown;
    headers?: unknown;
    baseUrl?: unknown;
    body?: unknown;
  };
  const keyInit: Record<string, unknown> = {
    ...rest,
    params: paramsKey(rest.params),
    headers: headersKey(rest.headers),
    ...(rest.body === undefined ? {} : bodyKey(rest.body)),
  };
  if (client.keyScope !== undefined) {
    keyInit.keyScope = client.keyScope;
  } else if (!rest.baseUrl && client.baseUrl) {
    keyInit.baseUrl = client.baseUrl;
  }
  return definedMembers(keyInit);
}
