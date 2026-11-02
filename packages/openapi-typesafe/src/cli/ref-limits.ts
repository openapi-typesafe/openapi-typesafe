import type { GeneratorOptions } from "../types.js";
import type { CliArguments } from "./cli-arguments.js";
import { resolveFileUrl } from "./cli-output.js";

/** The `$ref` limits of the CLI flags as generator options (threat model R1, R2, ADR-017). */

export type RefLimitOptions = Pick<GeneratorOptions, "localRefRoot" | "remoteRefHosts">;

/** `--local-ref-root` resolves against the working directory, like every other CLI path. */
export function refLimitOptions(args: CliArguments, cwd: URL): RefLimitOptions {
  const { localRefRoot, remoteRefHosts } = args.refLimits;
  return {
    ...(localRefRoot === undefined ? {} : { localRefRoot: resolveFileUrl(localRefRoot, cwd) }),
    ...(remoteRefHosts === undefined ? {} : { remoteRefHosts }),
  };
}
