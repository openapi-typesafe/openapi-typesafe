/**
 * The request part of a query key (ADR-046). TanStack Query hashes a key as JSON: a `Headers`
 * object or a list of header pairs hashed as `{}` or by its order, and so did a FormData, a Blob,
 * an ArrayBuffer or a URLSearchParams body. Two requests that differed in them shared one cache
 * entry, and the `queryFn` of that entry sent the request of the first. Two clients with
 * different base URLs shared entries too. The key's init holds the headers and such a body as
 * plain values, and the base URL the request goes to or the client's key scope, so the key names
 * what was fetched. Every value is read by the rule of `key-read.ts`, so no key throws while the
 * component renders.
 */
import { bodyKey } from "./body-key.js";
import { attempt, keyOf, readMembers } from "./key-read.js";
import { objectKey, sentMembers, textOf } from "./param-key.js";

/** The `params` record the fetch client sends as headers, through no serializer. */
const HEADER_RECORD = "header";

/** What the key takes from the fetch client and the options of `createClient`. */
export interface KeyClient {
  /** The fetch client's base URL, `""` without one. */
  readonly baseUrl: string;
  /** The name of the API in every key, in place of the base URL. */
  readonly keyScope?: string | undefined;
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
 * A header value as `Headers.set` and `append` send it: its text, so a `Number` object, a URL and
 * a date are their text (a date its local text, not its ISO text), and `5` and `"5"` send one
 * header. An object whose text `String` cannot give is its members: the request fails for it.
 */
function headerText(value: unknown): unknown {
  return textOf(value) ?? sentMembers(value as object, []);
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

/**
 * One plain header into the headers sent so far, as the fetch client's `mergeHeaders` sets them:
 * `undefined` sends nothing, `null` removes the header, a value sets it and an array appends its
 * items. Items appended after the same name was set or removed in this object give the whole text,
 * which `Headers` joins with `, `; items appended to nothing yet keep their list, as they add to
 * the client's own headers.
 */
function foldHeader(sent: Map<string, unknown>, name: string, value: unknown): void {
  const prior = sent.get(name);
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || prior === undefined || Array.isArray(prior)) {
    sent.set(name, Array.isArray(prior) && Array.isArray(value) ? [...prior, ...value] : value);
  } else if (value.length > 0) {
    sent.set(name, [prior, ...value].filter((text) => text !== null).join(", "));
  }
}

/**
 * Plain headers by the headers they send. `Headers` matches a name in any letter case, so names
 * are folded to lower case in their order: `{ "X-A": "1", "x-a": "2" }` sends `x-a: 2` and the
 * reverse order `x-a: 1`, and both had one key. A `null` value stays, as it removes the header.
 */
function plainHeadersKey(headers: object): Record<string, unknown> {
  const sent = new Map<string, unknown>();
  for (const [name, value] of readMembers(headers)) {
    foldHeader(sent, name.toLowerCase(), headerValueKey(value));
  }
  return Object.fromEntries(sent);
}

/**
 * A `Headers` object or a list of pairs, which are both iterable, by the names and values the
 * request sends: names in lowercase, a repeated one joined with `, `, as `Headers` writes them.
 * They are read without `Headers`, which threw for an invalid name or value while the component
 * rendered; the request reports it as a query error.
 */
function headerPairsKey(headers: Iterable<unknown>): Record<string, unknown> {
  const sent = new Map<string, string>();
  for (const pair of headers) {
    const [name, value] = Array.from(pair as ArrayLike<unknown>);
    const key = String(headerText(name)).toLowerCase();
    const text = String(headerText(value));
    sent.set(key, sent.has(key) ? `${sent.get(key)}, ${text}` : text);
  }
  return Object.fromEntries(sent);
}

/**
 * The headers of an init by the headers they send, or undefined when they set none. Throws for
 * headers it cannot read, such as a pair that is not a list, for `keyOf` to leave them out: the
 * request fails for them too and reports it.
 */
function headersKey(headers: unknown): unknown {
  if (typeof headers !== "object" || headers === null) {
    return headers;
  }
  return definedMembers(
    Symbol.iterator in headers
      ? headerPairsKey(headers as Iterable<unknown>)
      : plainHeadersKey(headers),
  );
}

/**
 * A `params` record by what it sends, or undefined when it sends nothing. Any object record, also
 * a class instance, is read by its members, as the fetch client reads it; a record kept as it is
 * held `NaN` as `null` and a bigint, which the hash throws for. A query or path record goes whole
 * to a serializer of the client, so it has the other forms of `objectKey`. A header record goes
 * to none; its names are folded to lower case, the last value of a name kept, as the client sets
 * them one after the other into `Headers`, which match a name in any letter case.
 */
function recordKey(location: string, record: unknown): unknown {
  if (typeof record !== "object" || record === null) {
    return record;
  }
  if (location !== HEADER_RECORD) {
    return definedMembers(objectKey(record, []));
  }
  const members = Object.entries(sentMembers(record, []));
  return definedMembers(
    Object.fromEntries(members.map(([name, value]) => [name.toLowerCase(), value])),
  );
}

/**
 * The `params` of an init by its records as `recordKey`, without the records that send nothing:
 * `{}`, `{ query: {} }` and `{ query: { cursor: undefined } }` send the request of no `params`,
 * since the fetch client reads a missing record as an empty one. Undefined when no record is
 * left. Any object, also a class instance, is read by its members, as the client reads it.
 */
function paramsKey(params: unknown): unknown {
  if (typeof params !== "object" || params === null) {
    return params;
  }
  const records = readMembers(params).map(([location, record]) => [
    location,
    keyOf(record, [], (value) => recordKey(location, value)),
  ]);
  return definedMembers(Object.fromEntries(records));
}

/**
 * The init of a query key: its params and headers by what they send, its body as `bodyKey`, its
 * other members as plain values, and the client's key scope, or its base URL when the init has
 * none. The `signal` is left out: TanStack Query gives each request its own. A function (`fetch`,
 * a serializer, the hooks of a `middleware`) is left out too: the hash drops it, while filters
 * compare it by identity, so a filter with the key of a later render, which has a new inline
 * function, missed the query, and so did every filter after `hydrate`, which has none. Undefined
 * when nothing is left, so a call without an init and one with an init that sends nothing more,
 * such as `{}` or `{ params: { query: { cursor: undefined } } }`, have the key `[method, path]`.
 */
export function queryKeyInit(init: unknown, client: KeyClient): object | undefined {
  const {
    signal: _signal,
    params,
    headers,
    body,
    ...rest
  }: { signal?: unknown; params?: unknown; headers?: unknown; body?: unknown } = Object.fromEntries(
    attempt(() => readMembers(init ?? {})) ?? [],
  );
  const keyInit: Record<string, unknown> = {
    ...sentMembers(rest, []),
    params: keyOf(params, [], paramsKey),
    headers: keyOf(headers, [], headersKey),
    ...keyOf(body, [], bodyKey),
  };
  if (client.keyScope !== undefined) {
    keyInit.keyScope = client.keyScope;
  } else if (!(rest as { baseUrl?: unknown }).baseUrl && client.baseUrl) {
    keyInit.baseUrl = client.baseUrl;
  }
  return definedMembers(keyInit);
}
