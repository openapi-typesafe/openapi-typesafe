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

/**
 * Two file bases that differ: a location that parses into two URLs against them depends on its
 * base. The URL parser ignores a base of another scheme for a `file:` URL, so `file:api.yaml`
 * against `https://host/specs/` is `file:///api.yaml`; asking the parser itself follows every
 * spelling it reads as relative (`file:a`, `file:./a`, `file:`, `file:?q`), which a pattern would
 * have to copy from the URL standard.
 */
const PROBE_BASES = ["file:///probe-a/", "file:///probe-b/"] as const;

/** Whether the location is a relative `file:` URL, which resolves against a `file:` base only. */
function isRelativeFileUrl(location: string): boolean {
  if (URL_SCHEME.exec(location)?.[0].toLowerCase() !== FILE_PROTOCOL) {
    return false;
  }
  const [first, second] = PROBE_BASES.map((base) => URL.parse(location, base)?.href);
  return first !== second;
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
