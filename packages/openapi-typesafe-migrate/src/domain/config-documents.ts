import { type FileMigration, unchanged } from "./migration-findings.js";
import { PACKAGE_RENAMES } from "./package-names.js";

/**
 * The string values of JSON and YAML configs, as a parser adapter reads them: each with its key
 * path and its offsets in the text, so a migration replaces one value and keeps the rest of the
 * file byte for byte.
 */

/** A key path: mapping keys and list indexes, from the root of the document. */
export type DocumentPath = readonly (string | number)[];

/** A string value of a JSON document; `start` and `end` include its quotes. */
export interface JsonString {
  readonly path: DocumentPath;
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

/**
 * A string scalar of a YAML document. `start` and `end` cover its text as written: inside the
 * quotes of a quoted scalar, and the content lines of a block scalar without its `|` or `>` line.
 */
export interface YamlString {
  readonly path: DocumentPath;
  readonly value: string;
  readonly start: number;
  readonly end: number;
  /** Line breaks fold to spaces in every scalar but a literal block scalar (`|`). */
  readonly isFolded: boolean;
}

/**
 * The key a value belongs to: the last key of its path, past list indexes, so the items of a list
 * (also of a nested list) belong to the key that holds the list.
 */
export function ownerKey(path: DocumentPath): string | undefined {
  return path.findLast((part): part is string => typeof part === "string");
}

/**
 * The migration of a config that the parser could not read. A broken config that names no
 * original package is not this migration's concern; one that does is left to the user.
 */
export function unreadableConfig(text: string): FileMigration {
  const isNamed = [...PACKAGE_RENAMES.keys()].some((name) => text.includes(name));
  return isNamed
    ? { text, changes: [], manualSteps: [{ kind: "config-unreadable" }] }
    : unchanged(text);
}
