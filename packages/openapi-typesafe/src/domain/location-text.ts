/** How a location the user writes, as a CLI argument or an option string, is read. */

/**
 * A scheme of two or more characters (`https:`, `file:`). One letter is a Windows drive (`C:`), so
 * `C:\\specs\\api.yaml` stays a path.
 */
const URL_SCHEME = /^[a-z][a-z\d+.-]+:/i;

/** Whether the location is written as a URL, not as a file path. */
export function hasUrlScheme(location: string): boolean {
  return URL_SCHEME.test(location);
}
