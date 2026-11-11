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
 * The init fields that are not `undefined`. A field set to `undefined` (`headers: token ? … :
 * undefined`) sends the same request as none, so it must not make the init count as not empty.
 */
function definedFields(fields: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

/**
 * The init of a query key: the request init with its headers as plain values, its body as
 * `bodyKey`, and the client's key scope, or its base URL when the init has none. The `signal` is
 * left out: TanStack Query gives each request its own. Undefined when nothing is left, so a call
 * without an init and one with an empty init, or one of only `undefined` fields, have the key
 * `[method, path]`.
 */
export function queryKeyInit(init: unknown, client: KeyClient): object | undefined {
  const { signal: _signal, ...rest } = (init ?? {}) as {
    signal?: unknown;
    params?: unknown;
    headers?: unknown;
    baseUrl?: unknown;
    body?: unknown;
  };
  const keyInit = definedFields({
    ...rest,
    ...(rest.body === undefined ? {} : bodyKey(rest.body)),
  });
  if (typeof rest.headers === "object" && rest.headers !== null) {
    keyInit.headers = plainHeaders(rest.headers);
  }
  if (client.keyScope !== undefined) {
    keyInit.keyScope = client.keyScope;
  } else if (!rest.baseUrl && client.baseUrl) {
    keyInit.baseUrl = client.baseUrl;
  }
  return Object.keys(keyInit).length === 0 ? undefined : keyInit;
}
