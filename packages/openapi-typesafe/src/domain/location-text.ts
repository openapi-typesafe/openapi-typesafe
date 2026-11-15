/**
 * How a location the user writes, as a CLI argument, an option string or a schema given as text
 * (a string, a buffer, a stream, stdin), is read. One rule serves them all, so the same text is
 * the same location wherever it is written.
 */

/**
 * A scheme of two or more characters (`https:`, `file:`). One letter is a Windows drive (`C:`), so
 * `C:\\specs\\api.yaml` stays a path.
 */
const URL_SCHEME = /^[a-z][a-z\d+.-]+:/i;

/** The schemes the generator reads, which mark a URL also without `//` (`file:api.yaml`). */
const READ_SCHEMES: ReadonlySet<string> = new Set(["file:", "http:", "https:"]);

const AUTHORITY_START = "//";

/**
 * Whether the location is written as a URL, not as a file path: a scheme the generator reads, or
 * any scheme followed by `//` (`s3://bucket/api.yaml`). Another text before a colon is part of a
 * file name, as it is on POSIX file systems (`out:v2.ts`, `spec:v2.yaml`).
 */
export function hasUrlScheme(location: string): boolean {
  const scheme = URL_SCHEME.exec(location)?.[0];
  if (scheme === undefined) {
    return false;
  }
  return (
    READ_SCHEMES.has(scheme.toLowerCase()) || location.startsWith(AUTHORITY_START, scheme.length)
  );
}

/**
 * The scheme of a location written as a URL (`hasUrlScheme`), in lowercase (`s3:`); undefined
 * for a file path. A `$ref` is read by the same rule, so `s3://bucket/a.yaml` is a URL there too.
 */
export function urlSchemeOf(location: string): string | undefined {
  return hasUrlScheme(location) ? URL_SCHEME.exec(location)?.[0].toLowerCase() : undefined;
}

/**
 * Whether the generator reads URLs of this scheme (`file:`, `http:`, `https:`, in lowercase, as
 * `URL.protocol` writes it). Any other URL names nothing it can read: Redocly would take it for a
 * path relative to the working directory, so `s3://bucket/a.yaml` read `./s3:/bucket/a.yaml`.
 */
export function isReadScheme(scheme: string): boolean {
  return READ_SCHEMES.has(scheme);
}

/** Any whitespace: a URL holds none, and a YAML key needs it after its colon. */
const WHITESPACE = /\s/;

/**
 * The location that a schema given as text names, if it names one: the text, trimmed, is one
 * word written as a URL (`hasUrlScheme`). Text with whitespace is a document, so a YAML document
 * that starts like a URL stays one: a key needs whitespace after its colon (`file: x`,
 * `http://host/a: b`), and so do a comment and a second line. A document of one word is only a
 * YAML string or a key without a value, never an OpenAPI document.
 */
export function locationInText(text: string): string | undefined {
  const location = text.trim();
  return !WHITESPACE.test(location) && hasUrlScheme(location) ? location : undefined;
}

const FILE_PROTOCOL = "file:";

/** The URL parser drops these anywhere in a URL before it reads it (`file:\t/a` is `file:/a`). */
const TAB_OR_NEWLINE = /[\t\n\r]/g;

/** A path that starts at the root: the URL standard reads a backslash as `/` in a `file:` URL. */
const ROOT_SLASHES: ReadonlySet<string> = new Set(["/", "\\"]);

/**
 * A Windows drive letter at the start of the path (`C:`, `c|`), then the end, a slash, a
 * backslash, `?` or `#`: the "starts with a Windows drive letter" rule of the URL standard.
 */
const LEADING_DRIVE_LETTER = /^[a-z][:|](?:$|[/\\?#])/i;

/**
 * Whether the location is a relative `file:` URL, which resolves against a `file:` base only.
 * This is the URL standard's "file state": after `file:`, a slash or backslash starts a path from
 * the root (`file:/a`, `file://host/a`), and a leading drive letter replaces the base path
 * (`file:C:/a` is `file:///C:/a` against `file:///specs/` and against an `https:` base). Any
 * other text (`file:a`, `file:../a`, `file:..`, `file:?q`, `file:`) keeps the base path, so it
 * names no file without a `file:` base.
 */
function isRelativeFileUrl(location: string): boolean {
  const scheme = URL_SCHEME.exec(location)?.[0];
  if (scheme?.toLowerCase() !== FILE_PROTOCOL) {
    return false;
  }
  const rest = location.slice(scheme.length).replace(TAB_OR_NEWLINE, "");
  return !ROOT_SLASHES.has(rest.charAt(0)) && !LEADING_DRIVE_LETTER.test(rest);
}

/**
 * A location written as a URL, resolved: its URL, or why it has none. A location that does not
 * parse (`http://[::1/x`) is `unparsed`; a relative `file:` URL with a base that is no `file:` URL
 * is `relative-file`, since it names no file there (it used to name one in the file system root).
 */
export type UrlLocation =
  | { readonly kind: "url"; readonly url: URL }
  | { readonly kind: "unparsed" }
  | { readonly kind: "relative-file" };

/**
 * The URL of a location written as a URL, resolved against `base` (a directory or file URL), so
 * a relative `file:` URL (`file:api.yaml`) names a file next to it, as in openapi-typescript.
 */
export function parseUrlLocation(location: string, base: URL): UrlLocation {
  if (base.protocol !== FILE_PROTOCOL && isRelativeFileUrl(location)) {
    return { kind: "relative-file" };
  }
  const url = URL.parse(location, base.href);
  return url === null ? { kind: "unparsed" } : { kind: "url", url };
}
