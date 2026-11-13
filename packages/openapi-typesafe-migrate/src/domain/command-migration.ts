import { shellAppends } from "./appended-assignments.js";
import {
  type AppendedValue,
  appendedValueFindings,
  type Finding,
  type Locate,
  programArgumentFindings,
} from "./argument-findings.js";
import { commandRoles, type PackageWord } from "./command-roles.js";
import { type FileVariables, NO_VARIABLES, withoutRecipePrefix } from "./file-variables.js";
import { type InlineCode, inlineCode } from "./inline-code.js";
import { type Change, lineLocator, type ManualStep } from "./migration-findings.js";
import { packageReference, unmigratedWordFindings } from "./old-package-words.js";
import {
  GENERATOR_COMMAND,
  MIGRATED_GENERATOR_COMMAND,
  namesOriginalPackage,
  PACKAGE_RENAMES,
} from "./package-names.js";
import { type ProgramPath, programPath } from "./program-paths.js";
import {
  withShellAssignments,
  withUnreadVariables,
  withWordExpansions,
} from "./shell-variables.js";
import { type ShellCommand, type ShellWord, shellCommands } from "./shell-words.js";
import { applyTextEdits, type TextEdit } from "./text-edits.js";

export type { AppendedValue, Locate } from "./argument-findings.js";

/** One command line or script after the migration. */
export interface CommandMigration {
  readonly text: string;
  readonly changes: readonly Change[];
  readonly manualSteps: readonly ManualStep[];
}

const QUOTES: ReadonlySet<string> = new Set(["'", '"']);
const PATH_SEPARATOR = "/";
const BIN_FOLDER = "/.bin/";
const OLD_PACKAGE_FOLDER = `node_modules/${GENERATOR_COMMAND}/`;

/**
 * The edit that renames `name` at the end of a word (`x`, `"x"`, `npm:x`, `.bin/x`), before the
 * Windows `suffix` of a program (`x.cmd`), or undefined when the word is quoted in a way that
 * does not keep `name` in one piece.
 */
function renameAtEnd(word: ShellWord, name: string, to: string, suffix = ""): TextEdit | undefined {
  const at = word.raw.lastIndexOf(name);
  const tail = word.raw.slice(at + name.length);
  // The suffix is taken from the word's value, which ends with it, so the tail starts with it.
  const quote = tail.slice(suffix.length);
  if (at === -1 || (quote !== "" && !QUOTES.has(quote))) {
    return undefined;
  }
  return { start: word.start + at, end: word.start + at + name.length, text: to };
}

/** A word of an install command or a `--package` option that names an original package. */
function packageFindings(found: PackageWord, locate: Locate): Finding[] {
  const { name, isPinned } = packageReference(found.value);
  const to = PACKAGE_RENAMES.get(name);
  const offset = found.word.start;
  if (to === undefined) {
    return [];
  }
  const location = locate(offset);
  if (isPinned) {
    return [{ offset, manualStep: { kind: "pinned-package", location, name } }];
  }
  const edit = renameAtEnd(found.word, name, to);
  const change: Change = { kind: "package-name-renamed", location, from: name, to };
  return edit === undefined ? [] : [{ offset, edit, change }];
}

/** The program given by a path: `node_modules/.bin/openapi-typescript` or a file of the package. */
function programPathFindings(
  word: ShellWord,
  { path, suffix }: ProgramPath,
  location: string,
): Finding[] {
  const offset = word.start;
  if (path.includes(OLD_PACKAGE_FOLDER)) {
    return [{ offset, manualStep: { kind: "old-package-file", location, path } }];
  }
  const isBin = path.endsWith(`${BIN_FOLDER}${GENERATOR_COMMAND}${suffix}`);
  const to = MIGRATED_GENERATOR_COMMAND;
  const edit = isBin ? renameAtEnd(word, GENERATOR_COMMAND, to, suffix) : undefined;
  return edit === undefined
    ? []
    : [{ offset, edit, change: { kind: "command-renamed", location } }];
}

/** The findings for the program word of a command; renamed tells whether flags follow. */
function programFindings(word: ShellWord, location: string): Finding[] {
  const program = programPath(word);
  if (program.path.includes(PATH_SEPARATOR)) {
    return programPathFindings(word, program, location);
  }
  const { path, suffix } = program;
  const { name, isPinned } = packageReference(path.slice(0, path.length - suffix.length));
  if (name !== GENERATOR_COMMAND) {
    return [];
  }
  if (isPinned) {
    return [{ offset: word.start, manualStep: { kind: "versioned-command", location } }];
  }
  const edit = renameAtEnd(word, GENERATOR_COMMAND, MIGRATED_GENERATOR_COMMAND, suffix);
  const change: Change = { kind: "command-renamed", location };
  return edit === undefined ? [] : [{ offset: word.start, edit, change }];
}

function commandFindings(
  command: ShellCommand,
  locate: Locate,
  variables: FileVariables,
): Finding[] {
  const words = withoutRecipePrefix(command);
  const found = knownFindings(words, locate, variables);
  const handled = new Set(found.map((finding) => finding.offset));
  return [...found, ...unmigratedWordFindings(words, handled, locate)];
}

/** Inline code (`python3 -c '…'`) that names an old package: code the tool does not read. */
function inlineCodeFindings({ code, program }: InlineCode, locate: Locate): Finding[] {
  if (!namesOriginalPackage(code.value)) {
    return [];
  }
  const location = locate(code.start);
  const manualStep: ManualStep = { kind: "script-not-shell", location, shell: program.value };
  return [{ offset: code.start, manualStep }];
}

/** The findings of the packages, the program and its flags in the roles the tool knows. */
function knownFindings(words: ShellCommand, locate: Locate, variables: FileVariables): Finding[] {
  const roles = commandRoles(words);
  const findings = roles.packages.flatMap((found) => packageFindings(found, locate));
  const program = roles.program === undefined ? undefined : (words[roles.program] as ShellWord);
  if (program === undefined) {
    return findings;
  }
  const code = inlineCode(words);
  if (code !== undefined) {
    return [...findings, ...inlineCodeFindings(code, locate)];
  }
  const found = programFindings(program, locate(program.start));
  findings.push(...found);
  // Only a renamed command is ours to change; a pinned one still runs the old package.
  const isRenamed = found.some((finding) => finding.change?.kind === "command-renamed");
  const variable = variables.programAt(program);
  if (!isRenamed && (variable === undefined || variable.program === "other")) {
    return findings;
  }
  const flags = words.slice((roles.program as number) + 1);
  const place = { offset: program.start, use: variable };
  findings.push(...programArgumentFindings(flags, place, locate, variables));
  return findings;
}

/** The findings of a shell text as edits, without applying them. */
export interface ShellTextFindings {
  readonly edits: readonly TextEdit[];
  readonly changes: readonly Change[];
  readonly manualSteps: readonly ManualStep[];
}

/** Find what to migrate in every command of a shell text; `locate` names each place. */
export function shellTextFindings(text: string, locate: Locate): ShellTextFindings {
  return commandWordFindings(shellCommands(text), locate);
}

/**
 * Find what to migrate in commands already split into words, as an exec-form list is. Text that
 * the file appends to a variable's value (`GEN += -it` of a Makefile) is read after the program
 * of that value, as is the text that a shell text appends itself (`G+=" -it"`).
 */
export function commandWordFindings(
  commands: readonly ShellCommand[],
  locate: Locate,
  variables: FileVariables = NO_VARIABLES,
  appended: readonly AppendedValue[] = [],
): ShellTextFindings {
  const known = withUnreadVariables(withWordExpansions(withShellAssignments(commands, variables)));
  const shell = shellAppends(commands, known);
  const findings = [
    ...shell.commands.flatMap((words) => commandFindings(words, locate, known)),
    ...[...appended, ...shell.appended].flatMap((value) =>
      appendedValueFindings(value, locate, known),
    ),
  ].sort((left, right) => left.offset - right.offset);
  return {
    edits: findings.flatMap((finding) => (finding.edit === undefined ? [] : [finding.edit])),
    changes: findings.flatMap((finding) => (finding.change === undefined ? [] : [finding.change])),
    manualSteps: findings.flatMap((finding) =>
      finding.manualStep === undefined ? [] : [finding.manualStep],
    ),
  };
}

function migrateShellText(text: string, locate: Locate): CommandMigration {
  const { edits, changes, manualSteps } = shellTextFindings(text, locate);
  return { text: applyTextEdits(text, edits), changes, manualSteps };
}

/**
 * Rename the generator command in one script, the renamed flags of that command only, and the
 * original packages that an install command or `npx -p` names. `location` names the script.
 */
export function migrateCommand(text: string, location: string): CommandMigration {
  return migrateShellText(text, () => location);
}

/**
 * Every command of a shell script, Makefile or Dockerfile, through `migrateCommand`. A command
 * continued with `\` onto the next lines is one command. Each finding names its `file:line`.
 */
export function migrateCommandLines(text: string, file: string): CommandMigration {
  const lineOf = lineLocator(text);
  return migrateShellText(text, (offset) => `${file}:${lineOf(offset)}`);
}
