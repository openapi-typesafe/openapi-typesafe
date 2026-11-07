import type { Config as RedoclyConfig } from "@redocly/openapi-core";
import type { RefAccess } from "../../application/ports/schema-loader.js";
import { isHostAllowed } from "./allowed-hosts.js";
import { type ConfiguredHeader, headersFor } from "./configured-headers.js";
import { refForbiddenError } from "./schema-load-errors.js";

/**
 * How the loader fetches remote documents: a time limit, the host limit and the configured headers
 * checked on every redirect.
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

/** A response whose body is already read, so that reading it again cannot wait or fail. */
async function bufferedResponse(response: Response): Promise<Response> {
  const body = await response.arrayBuffer();
  const { status, statusText, headers } = response;
  return new Response(NULL_BODY_STATUSES.has(status) ? null : body, {
    status,
    statusText,
    headers,
  });
}

/**
 * Fetch with a time limit for the whole response, body included: Node's own fetch waits five
 * minutes for a server that never answers, and a server that sends its body one byte at a time
 * never finishes. The body is read here, inside the limit; when Redocly read it, the abort
 * surfaced as a `DOMException` whose read-only `message` Redocly tried to change, which gave
 * "Cannot set property message of  which has only a getter" instead of the time limit.
 */
function fetchWithTimeout(timeoutMs: number): RemoteFetch {
  return async (input, init = {}) => {
    try {
      const response = await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      return await bufferedResponse(response);
    } catch (cause) {
      const isTimeout = cause instanceof Error && cause.name === "TimeoutError";
      throw isTimeout ? new Error(`Timed out after ${timeoutMs} ms loading ${input}`) : cause;
    }
  };
}

/** What every hop of a remote fetch is checked against. */
export interface RedirectPolicy {
  /** `resolve.http.headers` of the Redocly config; chosen again for the URL of every hop. */
  readonly headers: readonly ConfiguredHeader[];
  /** `--remote-ref-hosts`; undefined allows every host. */
  readonly hosts: readonly string[] | undefined;
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
    let url = new URL(input);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (hop > 0 && policy.hosts !== undefined && !isHostAllowed(url, policy.hosts)) {
        throw refForbiddenError(url.href, {
          reason: "host-not-allowed",
          allowedHosts: [...policy.hosts],
        });
      }
      const headers = await headersFor(url, policy.headers);
      const response = await fetchImpl(url.href, { ...init, headers, redirect: "manual" });
      const location = response.headers.get("location");
      if (!REDIRECT_STATUSES.has(response.status) || location === null) {
        return response;
      }
      url = new URL(location, url);
    }
    throw new Error(`More than ${MAX_REDIRECTS} redirects loading ${input}`);
  };
}

/** Bounds on the remote documents of one load (threat model T2, ADR-033). */
export interface RemoteDocumentLimits {
  /** Remote documents one load may fetch, the root included; one more is refused. */
  readonly maxDocuments: number;
  /** Remote documents fetched at the same time; the others wait for a free slot. */
  readonly maxParallelFetches: number;
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
  readonly maxParallelFetches: number;
}

/**
 * The resolve config with the fetch the loader uses. A `customFetch` of the Redocly config is
 * kept and wrapped, so that each redirect is checked and only a few documents load at once. The
 * configured headers move into that wrapper: Redocly would match them against the raw URL and
 * send them on through redirects.
 */
export function resolveConfigWithAccess(
  resolve: ResolveConfig,
  options: RemoteFetchOptions,
): ResolveConfig {
  // Redocly types `customFetch` as `Function`; it is called as fetch is.
  const configured = resolve.http.customFetch as RemoteFetch | undefined;
  const base = configured ?? fetchWithTimeout(options.timeoutMs);
  const checked = fetchWithCheckedRedirects(base, {
    headers: resolve.http.headers,
    hosts: options.access.remoteHosts,
  });
  // The limit is outside the redirects, so all hops of one document share one slot.
  const customFetch = fetchWithConcurrencyLimit(checked, options.maxParallelFetches);
  return { ...resolve, http: { ...resolve.http, headers: [], customFetch } };
}
