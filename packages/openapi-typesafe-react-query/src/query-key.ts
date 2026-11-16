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
import {
  type Ancestors,
  attempt,
  DEEPER_FORM,
  deeperKeys,
  hasSlotsOf,
  isClass,
  keyOf,
  readMembers,
  rootAncestors,
} from "./key-read.js";
import { objectKey, sentMembers, textOf } from "./param-key.js";

/** The `params` record the fetch client sends as headers, through no serializer. */
const HEADER_RECORD = "header";
/** A header pair holds a name and a value, no more and no fewer, or `Headers` throws for it. */
const HEADER_PAIR_LENGTH = 2;
/** Classes besides Map and Set whose every read gives a new iterator. */
const REREADABLE_CLASSES = ["Headers", "URLSearchParams", "FormData"] as const;

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
function headerText(value: unknown, ancestors: Ancestors): unknown {
  return textOf(value) ?? sentMembers(value as object, ancestors);
}

/**
 * A value of plain `headers` as the fetch client sends it: an array as the text of each item it
 * appends, any other value as `headerText`. `null`, which removes a header, and `undefined`,
 * which sends nothing, stay.
 */
function headerValueKey(value: unknown, ancestors: Ancestors): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  return Array.isArray(value)
    ? value.map((item) => headerText(item, ancestors))
    : headerText(value, ancestors);
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
 * Header entries by the headers they send, as the fetch client's `mergeHeaders` sets them one
 * after the other. `Headers` matches a name in any letter case, so names are folded to lower case
 * in their order: `{ "X-A": "1", "x-a": "2" }` sends `x-a: 2` and the reverse order `x-a: 1`, and
 * both had one key. A `null` value stays, as it removes the header.
 */
function foldedHeadersKey(
  entries: Iterable<readonly unknown[]>,
  ancestors: Ancestors,
): Record<string, unknown> {
  const sent = new Map<string, unknown>();
  for (const [name, value] of entries) {
    foldHeader(sent, headerName(name, ancestors), headerValueKey(value, ancestors));
  }
  return Object.fromEntries(sent);
}

/** A header name as `Headers` matches it: its text in lower case. */
function headerName(name: unknown, ancestors: Ancestors): string {
  return String(headerText(name, ancestors)).toLowerCase();
}

/**
 * A list of header pairs, or a `Set` of them, by the names and values the request sends: the
 * fetch client reads them through `Headers`, which sends the text of each value, also of `null`,
 * and joins a repeated name with `, `. They are read without `Headers`, which threw for an
 * invalid name or value while the component rendered; the request reports it as a query error.
 */
function headerPairsKey(headers: Iterable<unknown>, ancestors: Ancestors): Record<string, unknown> {
  const sent = new Map<string, string>();
  for (const pair of headers) {
    const [name, value] = headerPair(pair);
    const key = headerName(name, ancestors);
    const text = String(headerText(value, ancestors));
    sent.set(key, sent.has(key) ? `${sent.get(key)}, ${text}` : text);
  }
  return Object.fromEntries(sent);
}

/**
 * The name and value of a header pair. Throws, as `Headers` does, for an item that is no list of
 * two, such as a string, a number or a list of one or three items, and for an item that is no
 * collection, such as an iterator, which reading would use up for the request.
 */
function headerPair(pair: unknown): unknown[] {
  const items = isCollection(pair) ? Array.from(pair as Iterable<unknown>) : [];
  if (items.length !== HEADER_PAIR_LENGTH) {
    throw new TypeError("A header pair is a list of a name and a value");
  }
  return items;
}

/**
 * Whether a value can be read without using it up: an array, a Map or a Set of any realm, or a
 * `Headers`, `URLSearchParams` or `FormData`, each of which gives a new iterator on every read.
 * An iterator, a generator or another iterable of the caller may give its items only once: the
 * key would take them from the request.
 */
function isCollection(value: unknown): boolean {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    Array.isArray(value) ||
    hasSlotsOf(value, Map) ||
    hasSlotsOf(value, Set) ||
    REREADABLE_CLASSES.some((name) => isClass(value, name))
  );
}

/**
 * The headers of an init by the headers they send, read by the branches of the fetch client's
 * `mergeHeaders`, in its order: a value with a `get` method (`Headers` of any realm, a `Map`) by
 * its `entries()`, whose raw values it sets as plain headers (`null` removes one, `undefined`
 * sends nothing); any other iterable (a list of pairs) through `Headers`; any other object by its
 * own members, as plain headers; anything else is skipped. Headers that are no collection, such
 * as `map.entries()`, are left out of the key, which must not use them up: one request more,
 * while the request keeps every header. Undefined when they set none. Throws for headers it
 * cannot read, such as a pair that is not a list, for `keyOf` to leave them out: the request
 * fails for them too and reports it.
 */
function headersKey(headers: unknown, ancestors: Ancestors): unknown {
  if (typeof headers !== "object" || headers === null) {
    return undefined;
  }
  if (typeof (headers as { get?: unknown }).get === "function") {
    return isCollection(headers)
      ? definedMembers(foldedHeadersKey((headers as Map<unknown, unknown>).entries(), ancestors))
      : undefined;
  }
  if (Symbol.iterator in headers) {
    return isCollection(headers)
      ? definedMembers(headerPairsKey(headers as Iterable<unknown>, ancestors))
      : undefined;
  }
  return definedMembers(foldedHeadersKey(readMembers(headers), ancestors));
}

/**
 * A `params` record by what it sends, or undefined when it sends nothing. Any object record, also
 * a class instance, is read by its members, as the fetch client reads it; a record kept as it is
 * held `NaN` as `null` and a bigint, which the hash throws for. A query or path record goes whole
 * to a serializer of the client, so it has the other forms of `objectKey`. A header record goes
 * to none; its names are folded to lower case, the last value of a name kept, as the client sets
 * them one after the other into `Headers`, which match a name in any letter case.
 */
function recordKey(location: string, record: unknown, ancestors: Ancestors): unknown {
  if (typeof record !== "object" || record === null) {
    return record;
  }
  if (location !== HEADER_RECORD) {
    return definedMembers(objectKey(record, ancestors));
  }
  const members = Object.entries(sentMembers(record, ancestors));
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
function paramsKey(params: unknown, ancestors: Ancestors): unknown {
  if (typeof params !== "object" || params === null) {
    return params;
  }
  const records = readMembers(params).map(([location, record]) => [
    location,
    keyOf(record, ancestors, (value, inner) => recordKey(location, value, inner)),
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
 * The objects nested deeper than one walk reads are under `DEEPER_FORM`, in order.
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
  const root = rootAncestors();
  const keyInit: Record<string, unknown> = {
    ...sentMembers(rest, root),
    params: keyOf(params, root, paramsKey),
    headers: keyOf(headers, root, headersKey),
    ...keyOf(body, root, bodyKey),
  };
  const deeper = deeperKeys(root);
  if (deeper.length > 0) {
    keyInit[DEEPER_FORM] = deeper;
  }
  if (client.keyScope !== undefined) {
    keyInit.keyScope = client.keyScope;
  } else if (!(rest as { baseUrl?: unknown }).baseUrl && client.baseUrl) {
    keyInit.baseUrl = client.baseUrl;
  }
  return definedMembers(keyInit);
}
