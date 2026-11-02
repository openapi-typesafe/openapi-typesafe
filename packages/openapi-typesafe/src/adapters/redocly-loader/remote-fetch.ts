import type { Config as RedoclyConfig } from "@redocly/openapi-core";
import type { RefAccess } from "../../application/ports/schema-loader.js";
import { isHostAllowed } from "./ref-access.js";
import { refForbiddenError } from "./schema-load-errors.js";

/** How the loader fetches remote documents: a time limit, and the host limit on redirects. */

type ResolveConfig = RedoclyConfig["resolve"];

/** The fetch Redocly calls for a remote document (`resolve.http.customFetch`). */
export type RemoteFetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Redirects followed for a remote `$ref` when hosts are limited. Each hop is checked, so fetch
 * cannot follow them on its own; 5 covers http → https plus a moved file, and a loop stops early.
 */
export const MAX_CHECKED_REDIRECTS = 5;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Fetch with a time limit: Node's own fetch waits five minutes for a server that never answers. */
function fetchWithTimeout(timeoutMs: number): RemoteFetch {
  return (input, init = {}) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) }).catch((cause: unknown) => {
      const isTimeout = cause instanceof Error && cause.name === "TimeoutError";
      throw isTimeout ? new Error(`Timed out after ${timeoutMs} ms loading ${input}`) : cause;
    });
}

/**
 * Follow redirects one by one, and refuse a redirect to a host that is not listed. The first URL
 * was checked by the resolver (or is the root document). As fetch does, the configured headers
 * (often credentials) are not sent on to another origin.
 */
export function fetchWithCheckedRedirects(
  fetchImpl: RemoteFetch,
  hosts: readonly string[],
): RemoteFetch {
  return async (input, init = {}) => {
    const firstOrigin = new URL(input).origin;
    let url = new URL(input);
    for (let hop = 0; hop <= MAX_CHECKED_REDIRECTS; hop += 1) {
      if (hop > 0 && !isHostAllowed(url, hosts)) {
        throw refForbiddenError(url.href, { reason: "host-not-allowed", allowedHosts: [...hosts] });
      }
      const { headers, ...rest } = init;
      const hopInit: RequestInit =
        url.origin === firstOrigin && headers !== undefined ? { ...rest, headers } : rest;
      const response = await fetchImpl(url.href, { ...hopInit, redirect: "manual" });
      const location = response.headers.get("location");
      if (!REDIRECT_STATUSES.has(response.status) || location === null) {
        return response;
      }
      url = new URL(location, url);
    }
    throw new Error(`More than ${MAX_CHECKED_REDIRECTS} redirects loading ${input}`);
  };
}

export interface RemoteFetchOptions {
  /** Time limit of one fetch, unless the Redocly config brings its own `customFetch`. */
  readonly timeoutMs: number;
  readonly access: RefAccess;
}

/**
 * The resolve config with the fetch the loader uses. A `customFetch` of the Redocly config is
 * kept; with a host limit, it is wrapped so that each redirect is checked.
 */
export function resolveConfigWithAccess(
  resolve: ResolveConfig,
  options: RemoteFetchOptions,
): ResolveConfig {
  // Redocly types `customFetch` as `Function`; it is called as fetch is.
  const configured = resolve.http.customFetch as RemoteFetch | undefined;
  const base = configured ?? fetchWithTimeout(options.timeoutMs);
  const hosts = options.access.remoteHosts;
  const customFetch = hosts === undefined ? base : fetchWithCheckedRedirects(base, hosts);
  return { ...resolve, http: { ...resolve.http, customFetch } };
}
