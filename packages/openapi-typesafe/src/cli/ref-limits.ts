import { isLocalFileUrl } from "../api/local-file-url.js";
import type { GeneratorOptions } from "../types.js";
import type { CliArguments } from "./cli-arguments.js";
import { cliError } from "./cli-errors.js";
import { resolveLocationUrl } from "./cli-output.js";

/** The `$ref` limits of the CLI flags as generator options (threat model R1, R2, ADR-017). */

export type RefLimitOptions = Pick<GeneratorOptions, "localRefRoot" | "remoteRefHosts">;

/**
 * A local `$ref` root as a URL; undefined for a URL of another protocol or a `file:` URL with a
 * host, which name no local folder.
 */
export function localRootUrl(location: string, base: URL): URL | undefined {
  const url = resolveLocationUrl(location, base);
  return isLocalFileUrl(url) ? url : undefined;
}

/**
 * `--local-ref-root` resolves against the working directory, like every other CLI path. A URL of
 * another protocol (`https://…`) or one that names no local path (`file://host/specs/`) fails
 * with `CLI_FLAG_INVALID` before anything loads.
 */
export function refLimitOptions(args: CliArguments, cwd: URL): RefLimitOptions {
  const { localRefRoot, remoteRefHosts } = args.refLimits;
  const localRoot = localRefRoot === undefined ? undefined : localRootUrl(localRefRoot, cwd);
  if (localRefRoot !== undefined && localRoot === undefined) {
    throw cliError(
      "CLI_FLAG_INVALID",
      `--local-ref-root ${localRefRoot}: a directory path or a file: URL of a local directory.`,
    );
  }
  return {
    ...(localRoot === undefined ? {} : { localRefRoot: localRoot }),
    ...(remoteRefHosts === undefined ? {} : { remoteRefHosts }),
  };
}
