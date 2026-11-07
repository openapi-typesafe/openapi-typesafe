import { type Config as RedoclyConfig, readFileFromUrl } from "@redocly/openapi-core";

/**
 * Which `resolve.http.headers` of the Redocly config go with a request (threat model T4a). The
 * headers often carry credentials, so they are chosen again for every request and every redirect,
 * from the parsed URL, and never sent over plain HTTP unless the pattern asks for it.
 */

/** One `resolve.http.headers` entry: a name, a value or an environment variable, a pattern. */
export type ConfiguredHeader = RedoclyConfig["resolve"]["http"]["headers"][number];

/** Redocly matches the protocol only when the pattern starts with one; the same test. */
const EXPLICIT_HTTP_PATTERN = /^http:\/\//;

/** A header goes over HTTPS, or over HTTP when its pattern names `http://` itself. */
function isProtocolAllowed(header: ConfiguredHeader, url: URL): boolean {
  return url.protocol === "https:" || EXPLICIT_HTTP_PATTERN.test(header.matches);
}

/**
 * The URL as a pattern sees it: protocol, host and path. User info, query and fragment are left
 * out, so a `*` in the pattern cannot match across `?`, `#` or `@` into another host's URL.
 */
function matchedText(url: URL): string {
  return `${url.protocol}//${url.host}${url.pathname}`;
}

/**
 * The headers configured for this URL. The patterns are matched by Redocly's own matcher, which
 * also reads `envVariable` values, so a pattern means here what it means in Redocly; its fetch
 * only records the headers it would send and sends nothing.
 */
export async function headersFor(
  url: URL,
  configured: readonly ConfiguredHeader[],
): Promise<Record<string, string>> {
  const candidates = configured.filter((header) => isProtocolAllowed(header, url));
  let selected: Record<string, string> = {};
  if (candidates.length === 0) {
    return selected;
  }
  const recordHeaders = async (_input: string, init: { headers: Record<string, string> }) => {
    selected = init.headers;
    return new Response("");
  };
  await readFileFromUrl(matchedText(url), { headers: [...candidates], customFetch: recordHeaders });
  return selected;
}
