import { fileURLToPath } from "node:url";

/** Whether a URL names a file or directory on this computer; shared by the options and the CLI. */

/** What a `file:` URL that names no local path is, for an `OPTION_INVALID` or a CLI error. */
export const NO_LOCAL_PATH_KIND = "a file: URL that names no local path";

/**
 * Whether the URL is a `file:` URL that names a local path. One with a host (`file://specs/a.yaml`,
 * which looks like the relative `file:specs/a.yaml`) or with an encoded slash (`file:///a%2Fb`)
 * names none on this platform: Node.js refuses to turn it into a path, so every later file
 * operation on it would throw. Node.js refuses a URL of another scheme the same way.
 */
export function isLocalFileUrl(url: URL): boolean {
  try {
    fileURLToPath(url);
    return true;
  } catch {
    // The error says only which rule the URL breaks; the callers name the value instead.
    return false;
  }
}
