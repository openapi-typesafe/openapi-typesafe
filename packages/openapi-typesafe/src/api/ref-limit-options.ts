import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { RefAccess } from "../application/ports/schema-loader.js";
import { ERROR_CODES, OpenAPITypesafeError } from "../domain/errors.js";
import type { GeneratorOptions } from "../types.js";

/**
 * The `$ref` limits of the options (threat model R1, R2, ADR-017), checked before anything loads.
 * A value of another type from JavaScript (`remoteRefHosts: "a.com"`, `localRefRoot: new
 * URL("https://…")`) used to fail later as an error of the document.
 */

const FILE_PROTOCOL = "file:";

/** What a value is, for the error; a URL is named by its protocol only, as it may hold secrets. */
function kindOf(value: unknown): string {
  if (value instanceof URL) {
    return `a ${value.protocol} URL`;
  }
  if (Array.isArray(value)) {
    return "a list";
  }
  return value === null ? "null" : `a ${typeof value}`;
}

function optionInvalid(option: string, expected: string, got: string): OpenAPITypesafeError {
  return new OpenAPITypesafeError({
    code: ERROR_CODES.OPTION_INVALID,
    message: `The ${option} option must be ${expected}; got ${got}.`,
    details: { option },
  });
}

/** The local root as a `file:` URL; a path resolves against the cwd. */
function localRootOf(value: unknown, cwd: URL): URL {
  if (typeof value === "string") {
    return pathToFileURL(path.resolve(fileURLToPath(cwd), value));
  }
  if (value instanceof URL && value.protocol === FILE_PROTOCOL) {
    return value;
  }
  throw optionInvalid("localRefRoot", "a directory path or a file: URL", kindOf(value));
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
