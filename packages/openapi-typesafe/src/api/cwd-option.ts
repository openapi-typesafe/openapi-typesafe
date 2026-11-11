import path from "node:path";
import { pathToFileURL } from "node:url";
import { hasUrlScheme } from "../domain/location-text.js";
import type { GeneratorOptions } from "../types.js";
import { processCwd } from "./default-ports.js";
import { isLocalFileUrl, NO_LOCAL_PATH_KIND } from "./local-file-url.js";
import { kindOf, optionInvalid } from "./option-errors.js";

/**
 * The `cwd` option: the directory that relative `$ref`s of an inline source resolve against
 * (ADR-023). A string is read as `localRefRoot` is: a URL when it has a scheme, else a path.
 */

const FILE_PROTOCOL = "file:";

/** A `file:` cwd is a local directory; an `http:` or `https:` one holds remote documents. */
const CWD_PROTOCOLS: ReadonlySet<string> = new Set([FILE_PROTOCOL, "http:", "https:"]);

const CWD_EXPECTED = "a directory path, or a file:, http: or https: URL";

/** A path, resolved against the working directory, as a directory URL; `#` and `%` are encoded. */
function pathDirectoryUrl(directory: string): URL {
  return pathToFileURL(path.join(path.resolve(directory), path.sep));
}

/** The URL the value names, before its scheme is checked; undefined for another type. */
function cwdUrlOf(value: unknown): URL | undefined {
  if (value === undefined) {
    return pathDirectoryUrl(processCwd());
  }
  if (typeof value === "string") {
    if (!hasUrlScheme(value)) {
      return pathDirectoryUrl(value);
    }
    return URL.parse(value, pathDirectoryUrl(processCwd()).href) ?? undefined;
  }
  if (Buffer.isBuffer(value)) {
    return pathDirectoryUrl(value.toString());
  }
  return value instanceof URL ? value : undefined;
}

/** What the cwd is instead of a directory, for the error. */
function cwdKindOf(value: unknown, url: URL | undefined): string {
  if (url?.protocol === FILE_PROTOCOL) {
    return NO_LOCAL_PATH_KIND;
  }
  return url === undefined && typeof value === "string"
    ? "a string that is no valid URL"
    : kindOf(url ?? value);
}

/**
 * The cwd as a URL that ends in a slash. Fails with `OPTION_INVALID` for another type, a URL of
 * another scheme or a `file:` URL that names no local path.
 */
export function sourceCwdOf(options: GeneratorOptions): URL {
  const url = cwdUrlOf(options.cwd);
  const isUsable =
    url !== undefined &&
    CWD_PROTOCOLS.has(url.protocol) &&
    (url.protocol !== FILE_PROTOCOL || isLocalFileUrl(url));
  if (!isUsable) {
    throw optionInvalid("cwd", CWD_EXPECTED, cwdKindOf(options.cwd, url));
  }
  return url.pathname.endsWith("/") ? url : new URL(`${url.pathname}/`, url);
}
