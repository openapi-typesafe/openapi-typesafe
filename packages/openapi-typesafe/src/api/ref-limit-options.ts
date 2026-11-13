import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { RefAccess } from "../application/ports/schema-loader.js";
import { hasUrlScheme, parseUrlLocation } from "../domain/location-text.js";
import type { GeneratorOptions } from "../types.js";
import { isLocalFileUrl, NO_LOCAL_PATH_KIND } from "./local-file-url.js";
import { kindOf, optionInvalid } from "./option-errors.js";

/**
 * The `$ref` limits of the options (threat model R1, R2, ADR-017), checked before anything loads.
 * A value of another type from JavaScript (`remoteRefHosts: "a.com"`, `localRefRoot: new
 * URL("https://…")`) used to fail later as an error of the document.
 */

const FILE_PROTOCOL = "file:";

const LOCAL_ROOT_EXPECTED = "a directory path or a file: URL";
const RELATIVE_ROOT_EXPECTED = "an absolute path or file: URL when cwd is no file: URL";

/** A relative local root names no local directory against a cwd that is no `file:` URL. */
function relativeRootError(relative: string, cwd: URL): Error {
  return optionInvalid(
    "localRefRoot",
    RELATIVE_ROOT_EXPECTED,
    `${relative}, and cwd is ${kindOf(cwd)}`,
  );
}

/**
 * A string as the CLI reads `--local-ref-root`: a URL when it has a scheme (`file:///specs/`),
 * else a path that resolves against the cwd. Undefined when it does not parse as a URL. A
 * relative path or `file:` URL needs a local cwd: with an `http:` cwd it names no local directory.
 */
function localRootUrlOf(value: string, cwd: URL): URL | undefined {
  if (hasUrlScheme(value)) {
    const resolved = parseUrlLocation(value, cwd);
    if (resolved.kind === "relative-file") {
      throw relativeRootError("a relative file: URL", cwd);
    }
    return resolved.kind === "url" ? resolved.url : undefined;
  }
  if (path.isAbsolute(value)) {
    return pathToFileURL(value);
  }
  if (cwd.protocol !== FILE_PROTOCOL) {
    throw relativeRootError("a relative path", cwd);
  }
  return pathToFileURL(path.resolve(fileURLToPath(cwd), value));
}

/** What the local root is instead of a local directory, for the error. */
function localRootKindOf(root: unknown): string {
  if (root === undefined) {
    return "a string that is no valid URL";
  }
  return root instanceof URL && root.protocol === FILE_PROTOCOL ? NO_LOCAL_PATH_KIND : kindOf(root);
}

/**
 * The local root as a `file:` URL that names a local path; the option is set, so it is not
 * undefined. A `file:` URL with a host failed only once a local `$ref` was loaded.
 */
function localRootOf(value: unknown, cwd: URL): URL {
  const root = typeof value === "string" ? localRootUrlOf(value, cwd) : value;
  if (root instanceof URL && isLocalFileUrl(root)) {
    return root;
  }
  throw optionInvalid("localRefRoot", LOCAL_ROOT_EXPECTED, localRootKindOf(root));
}

function remoteHostsOf(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw optionInvalid("remoteRefHosts", "a list of hosts", kindOf(value));
  }
  const other = value.find((entry) => typeof entry !== "string");
  if (other !== undefined) {
    throw optionInvalid("remoteRefHosts", "a list of hosts", `a list with ${kindOf(other)}`);
  }
  return value;
}

/** The limits of the options; fails with `OPTION_INVALID` for a value of another type. */
export function refAccessOf(options: GeneratorOptions, cwd: URL): RefAccess {
  const { localRefRoot, remoteRefHosts } = options;
  return {
    ...(localRefRoot === undefined ? {} : { localRoot: localRootOf(localRefRoot, cwd) }),
    ...(remoteRefHosts === undefined ? {} : { remoteHosts: remoteHostsOf(remoteRefHosts) }),
  };
}
