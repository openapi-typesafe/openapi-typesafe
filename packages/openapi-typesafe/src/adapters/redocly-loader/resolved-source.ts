import { fileURLToPath } from "node:url";
import type { SchemaLoadRequest } from "../../application/ports/schema-loader.js";
import { redoclyUrlName } from "./ref-urls.js";
import { loadFailedError, type TextOrigin } from "./schema-load-errors.js";

/** A schema source once read, and the name the loader gives its root document. */

/**
 * A source once its text is read: a URL, document text, or an object. Text that is a location
 * is a URL here, whether it came as a string, a buffer or a stream, so every later step (the name
 * of the root, its redirects, whether it is a file) treats it exactly as a `URL` source. `written`
 * is the URL as the user wrote it, when that text is known, which names the root (`rootNameOf`).
 */
export type ResolvedSource =
  | { readonly kind: "url"; readonly url: URL; readonly written?: string }
  | { readonly kind: "text"; readonly text: string; readonly origin: TextOrigin }
  | { readonly kind: "object"; readonly value: unknown };

type UrlSource = Extract<ResolvedSource, { readonly kind: "url" }>;

/** A load request whose source has been resolved. */
export interface ResolvedLoadRequest extends Omit<SchemaLoadRequest, "source"> {
  readonly source: ResolvedSource;
}

/**
 * The name an inline source (a string, object, buffer or stream) gets inside the working
 * directory. Redocly resolves relative `$ref`s against the directory of the document, so the
 * document must be named as a file in the working directory, not as the directory itself.
 */
const INLINE_SOURCE_NAME = "inline-source";

const FILE_PROTOCOL = "file:";

/**
 * The path of a `file:` source. A URL that names no path on this platform (an encoded slash, a
 * host on POSIX, no drive letter on Windows) cannot be read, so it fails as a read would.
 */
function sourceFilePath(source: URL): string {
  try {
    return fileURLToPath(source);
  } catch (error) {
    // Node.js reports these as TypeErrors (ERR_INVALID_FILE_URL_PATH, ERR_INVALID_FILE_URL_HOST).
    if (!(error instanceof TypeError)) {
      throw error;
    }
    throw loadFailedError(source.href, error);
  }
}

/** The name of a URL source: the path of a file, else the URL. */
function urlAbsoluteRef(url: URL): string {
  return url.protocol === FILE_PROTOCOL ? sourceFilePath(url) : url.href;
}

/** The name of an inline source, which is also the base of its relative `$ref`s. */
export function inlineAbsoluteRef(cwd: URL): string {
  return urlAbsoluteRef(new URL(INLINE_SOURCE_NAME, cwd));
}

/**
 * The name of a URL root: the path of a file, else the URL by the rule every `$ref` URL is named
 * by (`redoclyUrlName`), so that `redocly lint`, its lint ignore file and the loader name the root
 * alike (`http://host/my root.yaml` as written). A `URL` given without its text has only its
 * normal form.
 */
function rootNameOf({ url, written }: UrlSource, cwd: URL): string {
  return url.protocol === FILE_PROTOCOL || written === undefined
    ? urlAbsoluteRef(url)
    : redoclyUrlName(written, cwd.href);
}

/** The base for relative `$ref`s: the source file or URL itself, else a file in the cwd. */
export function sourceAbsoluteRef(source: ResolvedSource, cwd: URL): string {
  return source.kind === "url" ? rootNameOf(source, cwd) : inlineAbsoluteRef(cwd);
}

/** The name of a remote root (`sourceAbsoluteRef`), which its redirects start from. */
export function remoteRootRef(source: ResolvedSource, cwd: URL): string | undefined {
  return source.kind === "url" && source.url.protocol !== FILE_PROTOCOL
    ? rootNameOf(source, cwd)
    : undefined;
}

/** The URL of a source that is a URL, also when it was given as text. */
function rootUrlOf(source: ResolvedSource): URL | undefined {
  return source.kind === "url" ? source.url : undefined;
}

/** Whether the source is a local file, also when its `file:` URL was given as text. */
export function isFileSource(source: ResolvedSource): boolean {
  return rootUrlOf(source)?.protocol === FILE_PROTOCOL;
}
