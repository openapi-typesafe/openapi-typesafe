import { sortEntriesByKey } from "../../domain/ir/normalize.js";
import type { SchemaOptions } from "./schema/schema-context.js";

/** Whether a document object has `deprecated: true` (`--exclude-deprecated` drops it). */
export function isDeprecated(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && "deprecated" in value && value.deprecated);
}

/** Whether a deprecated entry is still needed, so `--exclude-deprecated` keeps it. */
export type DeprecatedEntryFilter = (value: unknown) => boolean;

const KEEPS_NONE: DeprecatedEntryFilter = () => false;

/**
 * `Object.entries` of a document map (the original `getEntries`): sorted for `--alphabetize`,
 * without deprecated entries for `--exclude-deprecated`, except those `isKept` names.
 */
export function documentEntries<T>(
  record: Readonly<Record<string, T>>,
  options: Pick<SchemaOptions, "alphabetize" | "excludeDeprecated">,
  isKept: DeprecatedEntryFilter = KEEPS_NONE,
): [string, T][] {
  const entries = Object.entries(record);
  const sorted = options.alphabetize ? sortEntriesByKey(entries) : entries;
  return options.excludeDeprecated
    ? sorted.filter(([, value]) => !isDeprecated(value) || isKept(value))
    : sorted;
}
