import type { Config as RedoclyConfig } from "@redocly/openapi-core";
import type { RefAccess } from "../../application/ports/schema-loader.js";
import { isHostAllowed } from "./allowed-hosts.js";
import { type ConfiguredHeader, headersFor } from "./configured-headers.js";
import { RemoteBodyLimit, type RemoteBodyLimits } from "./remote-body-limit.js";
import { refForbiddenError } from "./schema-load-errors.js";

/**
 * How the loader fetches remote documents: a time limit, size limits, the host limit and the
 * configured headers checked on every redirect.
 */

type ResolveConfig = RedoclyConfig["resolve"];

/** The fetch Redocly calls for a remote document (`resolve.http.customFetch`). */
export type RemoteFetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Redirects followed for one remote document. The loader follows them itself, so that each hop is
 * checked; 20 is the limit of the Fetch standard, which fetch applied before.
 */
export const MAX_REDIRECTS = 20;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Statuses whose responses have no body; `new Response()` refuses a body for them. */
const NULL_BODY_STATUSES = new Set([101, 103, 204, 205, 304]);

/**
 * A response whose body is already read within the size limits, so that reading it again cannot
 * wait, fail or take more memory.
 */
async function bufferedResponse(
  response: Response,
  url: string,
  bodyLimit: RemoteBodyLimit,
): Promise<Response> {
  const body = await bodyLimit.read(response, url);
  const { status, statusText, headers } = response;
  return new Response(NULL_BODY_STATUSES.has(status) ? null : body, {
    status,
    statusText,
    headers,
  });
}

/**
 * Codes of a connection that closed before any response came. The server can close a kept-alive
 * connection while the process is busy (parsing a large document, generating another API) and
 * has not read the close yet; the next request on that connection then fails with one of these.
 */
const CLOSED_CONNECTION_CODES: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "EPIPE",
  "UND_ERR_SOCKET",
]);

/** Methods that may be sent again without a second effect (RFC 9110 §9.2.2). */
const IDEMPOTENT_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD"]);
const DEFAULT_METHOD = "GET";

/** Whether fetch failed because its connection closed before any response came. */
function isClosedConnection(error: unknown): boolean {
  const cause = error instanceof TypeError ? error.cause : undefined;
  const code = cause instanceof Error && "code" in cause ? cause.code : undefined;
  return typeof code === "string" && CLOSED_CONNECTION_CODES.has(code);
}

/**
 * Fetch, and send the request once more when its connection closed before any response came, as
 * RFC 9112 §9.3.1 allows for an idempotent request. Fetch drops a connection that failed, so the
 * second attempt goes out on another one; a second failure is the server's answer and is thrown.
 */
async function fetchOnOpenConnection(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch (error) {
    const method = (init.method ?? DEFAULT_METHOD).toUpperCase();
    if (!(IDEMPOTENT_METHODS.has(method) && isClosedConnection(error))) {
      throw error;
    }
    return fetch(input, init);
  }
}

/**
 * Fetch with a time limit for the whole response, body included: Node's own fetch waits five
 * minutes for a server that never answers, and a server that sends its body one byte at a time
 * never finishes. The body is read here, inside the limit; when Redocly read it, the abort
 * surfaced as a `DOMException` whose read-only `message` Redocly tried to change, which gave
 * "Cannot set property message of  which has only a getter" instead of the time limit.
 */
function fetchWithTimeout(timeoutMs: number, bodyLimit: RemoteBodyLimit): RemoteFetch {
  return async (input, init = {}) => {
    try {
      // One signal for both attempts, so that a request sent again stays within the same limit.
      const signal = AbortSignal.timeout(timeoutMs);
      const response = await fetchOnOpenConnection(input, { ...init, signal });
      return await bufferedResponse(response, input, bodyLimit);
    } catch (cause) {
      const isTimeout = cause instanceof Error && cause.name === "TimeoutError";
      throw isTimeout ? new Error(`Timed out after ${timeoutMs} ms loading ${input}`) : cause;
    }
  };
}

/** A configured `customFetch` with its bodies read within the size limits. */
function fetchWithBodyLimit(fetchImpl: RemoteFetch, bodyLimit: RemoteBodyLimit): RemoteFetch {
  return async (input, init) => bufferedResponse(await fetchImpl(input, init), input, bodyLimit);
}

/**
 * The URL each remote document was read from in the end, when redirects moved it. A relative
 * `$ref` resolves against the URL the document was retrieved from (RFC 3986, section 5.1.3), so
 * `/latest` that redirects to `/static/v1/root.yaml` loads `./pet.yaml` from `/static/v1/`.
 * Redocly reads only the body of the response, so the fetch records the URL here.
 */
export class RedirectedUrls {
  readonly #finalUrls = new Map<string, string>();

  record(requested: string, final: string): void {
    if (requested !== final) {
      this.#finalUrls.set(requested, final);
    }
  }

  /** The URL the document of `requested` came from; `requested` when it was not redirected. */
  finalUrlOf(requested: string): string {
    return this.#finalUrls.get(requested) ?? requested;
  }
}

/** What every hop of a remote fetch is checked against. */
export interface RedirectPolicy {
  /** `resolve.http.headers` of the Redocly config; chosen again for the URL of every hop. */
  readonly headers: readonly ConfiguredHeader[];
  /** `--remote-ref-hosts`; undefined allows every host. */
  readonly hosts: readonly string[] | undefined;
  /**
   * The URL of the root document, if it is remote. The developer chose it, so neither it nor its
   * redirects are limited to the hosts (ADR-017): a spec URL that redirects to a CDN loads.
   */
  readonly rootUrl: string | undefined;
  /** Where the final URL of each redirected document is recorded. */
  readonly redirects: RedirectedUrls;
}

/**
 * Follow redirects one by one. Fetch drops only `Authorization`, `Cookie` and
 * `Proxy-Authorization` on a redirect to another origin and keeps every other header (an
 * `X-Api-Key`), so the configured headers are chosen for each hop's own URL instead, and a hop to
 * a host that is not listed is refused before it is fetched. The first URL was checked by the
 * resolver (or is the root document). Redocly passes only the configured headers in `init`, and
 * it gets an empty list of them (`resolveConfigWithAccess`), so `init.headers` is replaced.
 */
export function fetchWithCheckedRedirects(
  fetchImpl: RemoteFetch,
  policy: RedirectPolicy,
): RemoteFetch {
  return async (input, init = {}) => {
    const hosts = input === policy.rootUrl ? undefined : policy.hosts;
    let url = new URL(input);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (hop > 0 && hosts !== undefined && !isHostAllowed(url, hosts)) {
        throw refForbiddenError(url.href, {
          reason: "host-not-allowed",
          allowedHosts: [...hosts],
        });
      }
      const headers = await headersFor(url, policy.headers);
      const response = await fetchImpl(url.href, { ...init, headers, redirect: "manual" });
      const location = response.headers.get("location");
      if (!REDIRECT_STATUSES.has(response.status) || location === null) {
        policy.redirects.record(input, url.href);
        return response;
      }
      url = new URL(location, url);
    }
    throw new Error(`More than ${MAX_REDIRECTS} redirects loading ${input}`);
  };
}

/** Bounds on the remote documents of one load (threat model T2, ADR-033). */
export interface RemoteDocumentLimits extends RemoteBodyLimits {
  /** Remote documents one load may fetch, the root included; one more is refused. */
  readonly maxDocuments: number;
  /** Remote documents fetched at the same time; the others wait for a free slot. */
  readonly maxParallelFetches: number;
  /** Nodes (keys and values) the remote documents of one load may parse into together. */
  readonly maxNodes: number;
}

/**
 * At most `limit` calls of the fetch run at once; the others wait in order. A finished call hands
 * its slot to the next waiting one.
 */
export function fetchWithConcurrencyLimit(fetchImpl: RemoteFetch, limit: number): RemoteFetch {
  let running = 0;
  const waiting: (() => void)[] = [];
  return async (input, init) => {
    if (running < limit) {
      running += 1;
    } else {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    try {
      return await fetchImpl(input, init);
    } finally {
      const next = waiting.shift();
      if (next === undefined) {
        running -= 1;
      } else {
        next();
      }
    }
  };
}

export interface RemoteFetchOptions {
  /** Time limit of one fetch and its body, unless the Redocly config has its own `customFetch`. */
  readonly timeoutMs: number;
  readonly access: RefAccess;
  /** The root document's URL, whose redirects are not limited to the hosts. */
  readonly rootUrl: string | undefined;
  readonly maxParallelFetches: number;
  readonly bodyLimits: RemoteBodyLimits;
  readonly redirects: RedirectedUrls;
}

/**
 * The resolve config with the fetch the loader uses. A `customFetch` of the Redocly config is
 * kept and wrapped, so that each redirect is checked, each body is read within the size limits
 * and only a few documents load at once. The
 * configured headers move into that wrapper: Redocly would match them against the raw URL and
 * send them on through redirects.
 */
export function resolveConfigWithAccess(
  resolve: ResolveConfig,
  options: RemoteFetchOptions,
): ResolveConfig {
  // Redocly types `customFetch` as `Function`; it is called as fetch is.
  const configured = resolve.http.customFetch as RemoteFetch | undefined;
  // One limit per load, so that the total covers every document this resolver fetches.
  const bodyLimit = new RemoteBodyLimit(options.bodyLimits);
  const base =
    configured === undefined
      ? fetchWithTimeout(options.timeoutMs, bodyLimit)
      : fetchWithBodyLimit(configured, bodyLimit);
  const checked = fetchWithCheckedRedirects(base, {
    headers: resolve.http.headers,
    hosts: options.access.remoteHosts,
    rootUrl: options.rootUrl,
    redirects: options.redirects,
  });
  // The limit is outside the redirects, so all hops of one document share one slot.
  const customFetch = fetchWithConcurrencyLimit(checked, options.maxParallelFetches);
  return { ...resolve, http: { ...resolve.http, headers: [], customFetch } };
}
