import { sortEntriesByKey } from "../../domain/ir/normalize.js";
import type { SchemaOptions } from "./schema/schema-context.js";

function isDeprecated(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "deprecated" in value && value.deprecated);
}

/**
 * `Object.entries` of a document map (the original `getEntries`): sorted for `--alphabetize`,
 * without deprecated entries for `--exclude-deprecated`.
 */
export function documentEntries<T>(
  record: Readonly<Record<string, T>>,
  options: Pick<SchemaOptions, "alphabetize" | "excludeDeprecated">,
): [string, T][] {
  const entries = Object.entries(record);
  const sorted = options.alphabetize ? sortEntriesByKey(entries) : entries;
  return options.excludeDeprecated ? sorted.filter(([, value]) => !isDeprecated(value)) : sorted;
}
