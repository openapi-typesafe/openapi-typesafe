import {
  type CommandMigration,
  commandWordFindings,
  type ShellTextFindings,
} from "./command-migration.js";
import type { DocumentPath, DocumentString } from "./config-documents.js";
import { type Change, lineLocator, type ManualStep } from "./migration-findings.js";
import { packageReference } from "./old-package-words.js";
import { PACKAGE_RENAMES } from "./package-names.js";
import type { ShellCommand, ShellWord } from "./shell-word-parts.js";
import { shellCommands } from "./shell-words.js";
import type { TextEdit } from "./text-edits.js";
import { appliedFindings, shellText } from "./yaml-migration.js";

/**
 * pre-commit hooks (`.pre-commit-config.yaml`). A hook runs its `entry`, split into words without
 * a shell, with its `args` after them, so the two are read as one command: the flags of the
 * generator can be in either. A `language: node` hook installs its `additional_dependencies`;
 * an old package there is renamed, or reported when it is pinned to a version.
 */

const ENTRY_KEY = "entry";
const ARGS_KEY = "args";
const DEPENDENCIES_KEY = "additional_dependencies";

const hookOf = (path: DocumentPath): string => path.slice(0, -1).join(".");

/** The items of the list at `key` of each hook, by hook. */
function listsByHook(strings: readonly DocumentString[], key: string) {
  const lists = new Map<string, DocumentString[]>();
  for (const item of strings) {
    if (item.path.at(-2) === key) {
      const hook = item.path.slice(0, -2).join(".");
      lists.set(hook, [...(lists.get(hook) ?? []), item]);
    }
  }
  return lists;
}

/** The words of an entry, as offsets into the whole text. */
function entryWords(text: string, entry: DocumentString): ShellWord[] {
  const { start } = entry.content;
  return shellCommands(shellText(text, entry))
    .flat()
    .map((word) => ({ ...word, start: word.start + start, end: word.end + start }));
}

const itemWord = (text: string, item: DocumentString): ShellWord => {
  const { start, end } = item.content;
  return { start, end, value: item.value, raw: text.slice(start, end) };
};

/** The command of each hook: its entry words, then its args. */
function hookCommands(text: string, strings: readonly DocumentString[]): ShellCommand[] {
  const args = listsByHook(strings, ARGS_KEY);
  return strings
    .filter((string) => string.path.at(-1) === ENTRY_KEY)
    .map((entry) => [
      ...entryWords(text, entry),
      ...(args.get(hookOf(entry.path)) ?? []).map((item) => itemWord(text, item)),
    ]);
}

/** The old packages that the hooks install, renamed, or reported when pinned. */
function dependencyFindings(
  strings: readonly DocumentString[],
  locate: (offset: number) => string,
): ShellTextFindings {
  const found = {
    edits: [] as TextEdit[],
    changes: [] as Change[],
    manualSteps: [] as ManualStep[],
  };
  for (const item of [...listsByHook(strings, DEPENDENCIES_KEY).values()].flat()) {
    const { name, isPinned } = packageReference(item.value);
    const to = PACKAGE_RENAMES.get(name);
    const location = locate(item.content.start);
    if (to !== undefined && isPinned) {
      found.manualSteps.push({ kind: "pinned-package", location, name });
    } else if (to !== undefined) {
      found.edits.push({ start: item.content.start, end: item.content.end, text: to });
      found.changes.push({ kind: "package-name-renamed", location, from: name, to });
    }
  }
  return found;
}

/** Migrate the hooks of a pre-commit config: their commands and the packages they install. */
export function migratePreCommitHooks(
  text: string,
  file: string,
  strings: readonly DocumentString[],
): CommandMigration {
  const lineOf = lineLocator(text);
  const locate = (offset: number): string => `${file}:${lineOf(offset)}`;
  return appliedFindings(text, [
    commandWordFindings(hookCommands(text, strings), locate),
    dependencyFindings(strings, locate),
  ]);
}
