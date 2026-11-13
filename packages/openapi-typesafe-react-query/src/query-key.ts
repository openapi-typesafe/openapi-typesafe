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
 * A parameter or header value as the fetch client sends it. `NaN` and the infinities are their
 * text, which is sent, while TanStack Query's hash writes them as `null`, which sends nothing. A
 * date, which the client tells by its `toISOString`, is its ISO text. Any other object or array is
 * its members, each as sent. TanStack Query's filters match an object by its own members, and a
 * Date or a `Number` object has none, so a key that kept one matched every other value.
 */
function sentValue(value: unknown): unknown {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  if (typeof (value as Partial<Date>).toISOString === "function") {
    // `Date.prototype.toJSON` calls the `toISOString` of any object, and gives `null` for an
    // invalid time instead of throwing while the component renders; the request reports it.
    return Date.prototype.toJSON.call(value);
  }
  return Array.isArray(value) ? value.map(sentValue) : sentMembers(value);
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

/** The headers of an init as `plainHeaders` of sent values, or undefined when they set none. */
function headersKey(headers: unknown): unknown {
  return typeof headers === "object" && headers !== null
    ? definedMembers(sentMembers(plainHeaders(headers)))
    : headers;
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
