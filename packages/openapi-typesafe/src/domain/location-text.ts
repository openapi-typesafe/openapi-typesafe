/** How a location the user writes, as a CLI argument or an option string, is read. */

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
