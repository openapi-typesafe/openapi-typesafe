import { type OutputFixName, outputFixNamesOf } from "../domain/output-fixes.js";
import type { GeneratorOptions } from "../types.js";

/**
 * The `fix` option (ADR-021) as the CLI and `redocly.yaml` give it: `--fix a,b`, repeatable, or
 * `fix: [a, b]` / `fix: a,b` in an API's settings. Unknown names fail with `OPTION_FIX_UNKNOWN`.
 */

const SEPARATOR = ",";

/** The names of a flag value or a config value; `undefined` when the option is not set. */
export function fixNamesOf(value: unknown): readonly OutputFixName[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const names = [value]
    .flat()
    .flatMap((entry) => String(entry).split(SEPARATOR))
    .map((name) => name.trim())
    .filter((name) => name !== "");
  return outputFixNamesOf(names);
}

/** The generator option for the names; nothing when the option is not set. */
export function fixOption(
  names: readonly OutputFixName[] | undefined,
): Pick<GeneratorOptions, "fix"> {
  return names === undefined ? {} : { fix: names };
}
