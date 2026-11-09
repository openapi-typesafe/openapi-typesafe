import { NPM_SPECIFIER_PREFIX } from "./command-launchers.js";
import { commandRoles, type PackageWord } from "./command-roles.js";
import { type Change, lineLocator, type ManualStep } from "./migration-findings.js";
import {
  FLAG_RENAMES,
  GENERATOR_COMMAND,
  MIGRATED_GENERATOR_COMMAND,
  PACKAGE_RENAMES,
} from "./package-names.js";
import { type ShellCommand, type ShellWord, shellCommands } from "./shell-words.js";
import { applyTextEdits, type TextEdit } from "./text-edits.js";

/** One command line or script after the migration. */
export interface CommandMigration {
  readonly text: string;
  readonly changes: readonly Change[];
  readonly manualSteps: readonly ManualStep[];
}

/** Names the place of an offset for the report: a script name, or `file:line`. */
export type Locate = (offset: number) => string;

/** What the migration found at one offset of the text. */
interface Finding {
  readonly offset: number;
  readonly edit?: TextEdit;
  readonly change?: Change;
  readonly manualStep?: ManualStep;
}

const QUOTES: ReadonlySet<string> = new Set(["'", '"']);
const PATH_SEPARATOR = "/";
const BIN_FOLDER = "/.bin/";
const OLD_PACKAGE_FOLDER = `node_modules/${GENERATOR_COMMAND}/`;

/**
 * The edit that renames `name` at the end of a word (`x`, `"x"`, `npm:x`, `.bin/x`), or undefined
 * when the word is quoted in a way that does not keep `name` in one piece.
 */
function renameAtEnd(word: ShellWord, name: string, to: string): TextEdit | undefined {
  const at = word.raw.lastIndexOf(name);
  const tail = word.raw.slice(at + name.length);
  if (at === -1 || (tail !== "" && !QUOTES.has(tail))) {
    return undefined;
  }
  return { start: word.start + at, end: word.start + at + name.length, text: to };
}

/** A package name with an optional `npm:` prefix and `@version`. */
function packageReference(value: string): { name: string; isPinned: boolean } {
  const bare = value.startsWith(NPM_SPECIFIER_PREFIX)
    ? value.slice(NPM_SPECIFIER_PREFIX.length)
    : value;
  const at = bare.indexOf("@", 1);
  return { name: at === -1 ? bare : bare.slice(0, at), isPinned: at !== -1 };
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
function programPathFindings(word: ShellWord, location: string): Finding[] {
  const offset = word.start;
  if (word.value.includes(OLD_PACKAGE_FOLDER)) {
    return [{ offset, manualStep: { kind: "old-package-file", location, path: word.value } }];
  }
  const isBin = word.value.endsWith(`${BIN_FOLDER}${GENERATOR_COMMAND}`);
  const edit = isBin ? renameAtEnd(word, GENERATOR_COMMAND, MIGRATED_GENERATOR_COMMAND) : undefined;
  return edit === undefined
    ? []
    : [{ offset, edit, change: { kind: "command-renamed", location } }];
}

/** The findings for the program word of a command; renamed tells whether flags follow. */
function programFindings(word: ShellWord, location: string): Finding[] {
  if (word.value.includes(PATH_SEPARATOR)) {
    return programPathFindings(word, location);
  }
  const { name, isPinned } = packageReference(word.value);
  if (name !== GENERATOR_COMMAND) {
    return [];
  }
  if (isPinned) {
    return [{ offset: word.start, manualStep: { kind: "versioned-command", location } }];
  }
  const edit = renameAtEnd(word, GENERATOR_COMMAND, MIGRATED_GENERATOR_COMMAND);
  const change: Change = { kind: "command-renamed", location };
  return edit === undefined ? [] : [{ offset: word.start, edit, change }];
}

/** A renamed flag of the generator, alone (`-it`) or with its value (`--redoc=r.yaml`). */
function flagFindings(word: ShellWord, locate: Locate): Finding[] {
  const flag = word.raw.split("=", 1)[0] as string;
  const to = FLAG_RENAMES.get(flag);
  if (to === undefined) {
    return [];
  }
  const offset = word.start;
  const edit: TextEdit = { start: offset, end: offset + flag.length, text: to };
  return [
    { offset, edit, change: { kind: "flag-renamed", location: locate(offset), from: flag, to } },
  ];
}

/** `@`, `-` and `+` before a Makefile or justfile recipe: silent, ignore errors, always run. */
const RECIPE_PREFIX_RE = /^[@+-]+(?=.)/;

/**
 * The command with the recipe prefix taken off the value of its first word, so `@npx …` runs
 * `npx`. A shell command never starts with an option, so this changes nothing else.
 */
function withoutRecipePrefix(words: ShellCommand): ShellCommand {
  const [first, ...rest] = words;
  if (first === undefined || !RECIPE_PREFIX_RE.test(first.value)) {
    return words;
  }
  return [{ ...first, value: first.value.replace(RECIPE_PREFIX_RE, "") }, ...rest];
}

/**
 * Tells whether a program word runs the generator through a variable that the same file sets
 * (`$(OAT)` in a Makefile with `OAT := openapi-typescript`). The variable's value is migrated where
 * it is set; the flags after it are migrated where it is used.
 */
export type GeneratorReference = (program: ShellWord) => boolean;

const NO_GENERATOR_REFERENCES: GeneratorReference = () => false;

function commandFindings(
  command: ShellCommand,
  locate: Locate,
  isGeneratorReference: GeneratorReference,
): Finding[] {
  const words = withoutRecipePrefix(command);
  const roles = commandRoles(words);
  const findings = roles.packages.flatMap((found) => packageFindings(found, locate));
  const program = roles.program === undefined ? undefined : (words[roles.program] as ShellWord);
  if (program === undefined) {
    return findings;
  }
  const found = programFindings(program, locate(program.start));
  findings.push(...found);
  // Only a renamed command is ours to change; a pinned one still runs the old package.
  const isRenamed = found.some((finding) => finding.change?.kind === "command-renamed");
  if (isRenamed || isGeneratorReference(program)) {
    const flags = words.slice((roles.program as number) + 1);
    findings.push(...flags.flatMap((word) => flagFindings(word, locate)));
  }
  return findings;
}

/**
 * Whether a command runs the generator by its old name, so a variable set to it holds the
 * generator command.
 */
export function runsGenerator(command: ShellCommand): boolean {
  const words = withoutRecipePrefix(command);
  const { program } = commandRoles(words);
  const word = program === undefined ? undefined : words[program];
  return word !== undefined && packageReference(word.value).name === GENERATOR_COMMAND;
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

/** Find what to migrate in commands already split into words, as an exec-form list is. */
export function commandWordFindings(
  commands: readonly ShellCommand[],
  locate: Locate,
  isGeneratorReference: GeneratorReference = NO_GENERATOR_REFERENCES,
): ShellTextFindings {
  const findings = commands
    .flatMap((words) => commandFindings(words, locate, isGeneratorReference))
    .sort((left, right) => left.offset - right.offset);
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
