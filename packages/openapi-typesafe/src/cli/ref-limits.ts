import { isLocalFileUrl } from "../api/local-file-url.js";
import type { FileCheck } from "../application/ports/file-system.js";
import type { GeneratorOptions } from "../types.js";
import { cliError } from "./cli-errors.js";
import { type CliRun, parseLocationUrl } from "./cli-output.js";

/** The `$ref` limits of the CLI flags as generator options (threat model R1, R2, ADR-017). */

export type RefLimitOptions = Pick<GeneratorOptions, "localRefRoot" | "remoteRefHosts">;

/**
 * A local `$ref` root as a URL; undefined for a URL of another protocol, a `file:` URL with a
 * host, which name no local folder, a URL that does not parse (`http://[::1/x`), or an existing
 * file, so each caller reports it as its own bad value, as it reports the others. A file as the
 * root refused every local `$ref`, also one next to it, as outside the root. A root that does not
 * exist yet is allowed: no `$ref` can load a file from it.
 */
export function localRootUrl(location: string, base: URL, files: FileCheck): URL | undefined {
  const url = parseLocationUrl(location, base);
  return url !== undefined && isLocalFileUrl(url) && !files.isFile(url) ? url : undefined;
}

/**
 * `--local-ref-root` resolves against the working directory, like every other CLI path. A URL of
 * another protocol (`https://…`), one that names no local path (`file://host/specs/`) or a file
 * fails with `CLI_FLAG_INVALID` before anything loads.
 */
export function refLimitOptions(run: CliRun): RefLimitOptions {
  const { localRefRoot, remoteRefHosts } = run.args.refLimits;
  const localRoot =
    localRefRoot === undefined
      ? undefined
      : localRootUrl(localRefRoot, run.deps.cwd, run.deps.files);
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
