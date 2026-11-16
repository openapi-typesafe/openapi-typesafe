import { fileURLToPath, pathToFileURL } from "node:url";
import type { OpenAPITypesafeError } from "../../domain/errors.js";
import { isReadScheme, urlSchemeOf } from "../../domain/location-text.js";
import { refForbiddenError } from "./schema-load-errors.js";

/**
 * Which `$ref`s are URLs, by the rule the generator reads every location with (`hasUrlScheme`).
 * Redocly takes only `http://` and `https://` for URLs and joins any other `$ref` to the folder
 * of its document as a path, so `s3://bucket/pet.yaml` read `<folder>/s3:/bucket/pet.yaml` and
 * `file:///specs/pet.yaml` read `<folder>/file:/specs/pet.yaml` from disk.
 */

/** Redocly treats only these prefixes as remote; any other `$ref` is a local file path. */
export function isRemoteRef(absoluteRef: string): boolean {
  return absoluteRef.startsWith("http://") || absoluteRef.startsWith("https://");
}

const FILE_PROTOCOL = "file:";

/** The path of a `file:` URL, or undefined when it names no local path (a host on POSIX). */
function localPathOf(url: URL): string | undefined {
  try {
    return fileURLToPath(url);
  } catch (error) {
    // Node.js reports these as TypeErrors (ERR_INVALID_FILE_URL_PATH, ERR_INVALID_FILE_URL_HOST).
    if (error instanceof TypeError) {
      return undefined;
    }
    throw error;
  }
}

/**
 * The file that a `$ref` written as a `file:` URL names in a local document, resolved against
 * the document as RFC 3986 says (`file:pet.yaml` is next to it). Undefined for any other `$ref`,
 * for a `$ref` in a remote document (which may not name a local file at all), and for a `file:`
 * URL that names no local path, which `unreadableRefRefusal` refuses.
 */
export function fileRefPath(base: string | null, ref: string): string | undefined {
  if (base === null || isRemoteRef(base) || urlSchemeOf(ref) !== FILE_PROTOCOL) {
    return undefined;
  }
  const url = URL.parse(ref, pathToFileURL(base).href);
  return url === null ? undefined : localPathOf(url);
}

/** The schemes Redocly fetches, as `urlSchemeOf` writes them. */
const REMOTE_SCHEMES: ReadonlySet<string> = new Set(["http:", "https:"]);

/** The document's own URL, as the URL standard resolves a `$ref` against it. */
function documentUrlOf(base: string | null): string | undefined {
  if (base === null) {
    return undefined;
  }
  return isRemoteRef(base) ? base : pathToFileURL(base).href;
}

/**
 * The URL that a `$ref` names when Redocly would misread it: an `http:` or `https:` scheme in
 * another letter case or without `//` (`HTTP://host/pet.yaml`, `http:host/pet.yaml`). Redocly
 * takes only text that starts with `http://` or `https://` for a URL (`isAbsoluteUrl`) and joins
 * any other `$ref` in a local document to the document's folder, so it read these as files, while
 * the same text as the schema argument was fetched. Such a `$ref` is resolved against its document
 * by the URL standard, as the schema argument is (`parseUrlLocation`). A `$ref` that does not
 * parse throws the URL parser's own error, which Redocly reports as the unresolved `$ref`.
 *
 * Undefined for any other `$ref`, also for one that starts with `http://` or `https://`: Redocly
 * keeps that as written (`http://LOCALHOST/x/../pet.yaml`), and that text is the document's name
 * in `redocly lint`, in its lint ignore file and in Redocly's cache, so changing it would drop
 * the ignore entries. In a remote document Redocly resolves every relative `$ref` by the URL
 * standard already.
 */
export function remoteRefUrl(base: string | null, ref: string): string | undefined {
  const scheme = urlSchemeOf(ref);
  return scheme !== undefined && REMOTE_SCHEMES.has(scheme) && !isRemoteRef(ref)
    ? new URL(ref, documentUrlOf(base)).href
    : undefined;
}

/**
 * The refusal of a `$ref` in a local document that is a URL the generator cannot read: a scheme
 * other than `http:`, `https:` and `file:` (`s3:`, `ftp:`), or a `file:` URL that names no local
 * path. A remote document refers to URLs only, which `local-ref-from-remote` already enforces.
 */
export function unreadableRefRefusal(base: string, ref: string): OpenAPITypesafeError | undefined {
  const scheme = urlSchemeOf(ref);
  if (scheme === undefined || isRemoteRef(base)) {
    return undefined;
  }
  const isReadable =
    scheme === FILE_PROTOCOL ? fileRefPath(base, ref) !== undefined : isReadScheme(scheme);
  return isReadable ? undefined : refForbiddenError(ref, { reason: "unsupported-url" });
}
