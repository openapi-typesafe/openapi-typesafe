import { NPM_SPECIFIER_PREFIX } from "./command-launchers.js";
import type { ManualStep } from "./migration-findings.js";
import { GENERATOR_COMMAND, oldPackageInNodeModules, PACKAGE_RENAMES } from "./package-names.js";
import type { ShellCommand } from "./shell-words.js";

/** The words of a command that name the original packages, apart from the roles they have. */

/** A package name with an optional `npm:` prefix and `@version`. */
export function packageReference(value: string): { name: string; isPinned: boolean } {
  const bare = value.startsWith(NPM_SPECIFIER_PREFIX)
    ? value.slice(NPM_SPECIFIER_PREFIX.length)
    : value;
  const at = bare.indexOf("@", 1);
  return { name: at === -1 ? bare : bare.slice(0, at), isPinned: at !== -1 };
}

/**
 * Whether a word names an original package: its name (`openapi-fetch`, `npm:x@1`), a file of it
 * in `node_modules`, or a path to the generator's binary (`$(npm bin)/openapi-typescript`).
 */
function namesOldPackage(value: string): boolean {
  return (
    PACKAGE_RENAMES.has(packageReference(value).name) ||
    oldPackageInNodeModules(value) !== undefined ||
    value.endsWith(`/${GENERATOR_COMMAND}`)
  );
}

/** A manual step at an offset of the text. */
export interface WordStep {
  readonly offset: number;
  readonly manualStep: ManualStep;
}

/**
 * The words that name an original package at offsets no finding renamed or reported: an argument
 * of a program the tool does not know (`chronic openapi-typescript`), or a script name of
 * `npm run`. The tool cannot tell what runs them, so each is a manual step, never silence.
 */
export function unmigratedWordFindings(
  words: ShellCommand,
  handledOffsets: ReadonlySet<number>,
  locate: (offset: number) => string,
): WordStep[] {
  return words
    .filter((word) => !handledOffsets.has(word.start) && namesOldPackage(word.value))
    .map((word) => ({
      offset: word.start,
      manualStep: { kind: "old-name-in-command", location: locate(word.start), word: word.value },
    }));
}
