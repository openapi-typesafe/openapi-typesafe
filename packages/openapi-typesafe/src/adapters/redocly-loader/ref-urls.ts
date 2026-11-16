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
 * The name of the document a `$ref` with an `http:` or `https:` scheme names (`redoclyUrlName`).
 * Redocly takes only text that starts with `http://` or `https://` for a URL (`isAbsoluteUrl`)
 * and joins any other `$ref` in a local document to the document's folder, so it read
 * `HTTP://host/pet.yaml` and `http:host/pet.yaml` as files, while the same text as the schema
 * argument was fetched. Such a `$ref` is resolved against its document by the URL standard, as
 * the schema argument is (`parseUrlLocation`); one that does not parse throws the URL parser's
 * own error, which Redocly reports as the unresolved `$ref`. A `$ref` that starts with `http://`
 * or `https://` keeps the text Redocly keeps. Undefined for any other `$ref`: in a remote
 * document Redocly resolves every relative `$ref` by the URL standard already.
 */
export function remoteRefUrl(base: string | null, ref: string): string | undefined {
  const scheme = urlSchemeOf(ref);
  return scheme !== undefined && REMOTE_SCHEMES.has(scheme)
    ? redoclyUrlName(ref, documentUrlOf(base))
    : undefined;
}

/**
 * The name of the document of an `http:` or `https:` URL written as `written`, by Redocly's rule:
 * the text as written when Redocly takes it for a URL (`isRemoteRef`), since `redocly lint`, its
 * lint ignore file and Redocly's cache name the document so (`http://host/my pet.yaml`,
 * `http://LOCALHOST/x/../pet.yaml`); else the URL standard's normal form against `base`, since
 * Redocly would misread it as a file and no ignore entry can name it (`HTTP://host/pet.yaml`).
 * The root and every `$ref` are named by this one rule.
 */
export function redoclyUrlName(written: string, base: string | undefined): string {
  return isRemoteRef(written) ? written : new URL(written, base).href;
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
