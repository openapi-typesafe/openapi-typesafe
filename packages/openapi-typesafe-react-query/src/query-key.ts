/**
 * The request part of a query key (ADR-046). TanStack Query hashes a key as JSON: a `Headers`
 * object or a list of header pairs hashed as `{}` or by its order, so two requests with different
 * headers shared one cache entry, and the `queryFn` of that entry sent the headers of the first.
 * Two clients with different base URLs shared entries too. The key's init holds the headers as a
 * plain object and the base URL the request goes to, so the key names what was fetched.
 */

/** Headers as a plain object, which TanStack Query hashes by its names and values. */
type HeadersRecord = Readonly<Record<string, unknown>>;

/**
 * The headers of an init as a plain object. A `Headers` object and a list of pairs, which are both
 * iterable, become the names and values the request sends (`Headers` writes the names in
 * lowercase and joins a repeated one); a plain object stays as it is, since its `null` and array
 * values mean more than a string.
 */
function plainHeaders(headers: object): HeadersRecord {
  return Symbol.iterator in headers
    ? Object.fromEntries(new Headers(headers as HeadersInit).entries())
    : (headers as HeadersRecord);
}

/**
 * The init of a query key: the request init with its headers as a plain object and the base URL
 * of the client when the init has none. The `signal` is left out: TanStack Query gives each
 * request its own. Undefined without an init and a base URL, so such a key is `[method, path]`.
 */
export function queryKeyInit(init: unknown, clientBaseUrl: string): object | undefined {
  if (init === undefined && !clientBaseUrl) {
    return undefined;
  }
  const { signal: _signal, ...rest } = (init ?? {}) as {
    signal?: unknown;
    headers?: unknown;
    baseUrl?: unknown;
  };
  const keyInit: Record<string, unknown> = { ...rest };
  const { headers } = rest;
  if (typeof headers === "object" && headers !== null) {
    keyInit.headers = plainHeaders(headers);
  }
  if (!rest.baseUrl && clientBaseUrl) {
    keyInit.baseUrl = clientBaseUrl;
  }
  return keyInit;
}
