import type { FileVariables, VariableProgramUse } from "./file-variables.js";
import type { Change, ManualStep } from "./migration-findings.js";
import { unmigratedWordFindings } from "./old-package-words.js";
import { FLAG_RENAMES } from "./package-names.js";
import { type ShellCommand, type ShellWord, shellCommands } from "./shell-words.js";
import type { TextEdit } from "./text-edits.js";
import { placedSpan, unquotedRawText } from "./word-places.js";

/**
 * The findings of the words that a program gets as arguments: renamed flags of the generator, old
 * flags in a variable they expand, and one step for the flags after a program that may be the
 * generator or another one. Text appended to a variable's value is such words too.
 */

/** Names the place of an offset for the report: a script name, or `file:line`. */
export type Locate = (offset: number) => string;

/** What the migration found at one offset of the text. */
export interface Finding {
  readonly offset: number;
  readonly edit?: TextEdit;
  readonly change?: Change;
  readonly manualStep?: ManualStep;
}

/** The flag that a word passes before any `=`, as the program gets it: `"-it"` passes `-it`. */
const passedFlag = (text: string): string => text.split("=", 1)[0] as string;

/**
 * A renamed flag of the generator, alone (`-it`) or with its value (`--redoc=r.yaml`), as the
 * program gets it after quote removal (`"-it"`). A flag whose characters quotes split where the
 * file writes it (`-i't'`, word-places.ts) has no place to edit, so it is a step that names it.
 */
function flagFindings(word: ShellWord, locate: Locate): Finding[] {
  const passed = unquotedRawText(word, 0);
  const flag = passedFlag(passed.text);
  const to = FLAG_RENAMES.get(flag);
  if (to === undefined) {
    return [];
  }
  const offset = word.start;
  const location = locate(offset);
  const span = placedSpan(passed, flag.length);
  if (span === undefined) {
    const manualStep: ManualStep = { kind: "split-flag", location, flag };
    return [{ offset, manualStep }];
  }
  const edit: TextEdit = { ...span, text: to };
  return [{ offset, edit, change: { kind: "flag-renamed", location, from: flag, to } }];
}

/** The flags of a variable's value that the generator renamed, each once. */
function renamedFlags(value: string): string[] {
  const flags = shellCommands(value)
    .flat()
    .map((word) => passedFlag(word.value));
  return [...new Set(flags.filter((flag) => FLAG_RENAMES.has(flag)))];
}

/** The findings of one argument of the generator: a renamed flag, or a variable that holds one. */
function argumentFindings(word: ShellWord, locate: Locate, variables: FileVariables): Finding[] {
  const reference = variables.referenceAt(word);
  if (reference === undefined) {
    return flagFindings(word, locate);
  }
  const flags = renamedFlags(reference.value);
  if (flags.length === 0) {
    return [];
  }
  const manualStep: ManualStep = {
    kind: "flags-in-variable",
    location: locate(word.start),
    variable: reference.written,
    flags,
  };
  return [{ offset: word.start, manualStep }];
}

/** The old flags that findings rename, or report in a variable's value. */
const oldFlagsOf = (findings: readonly Finding[]): string[] =>
  findings.flatMap(({ change, manualStep }) => {
    if (change?.kind === "flag-renamed") {
      return [change.from];
    }
    return manualStep?.kind === "flags-in-variable" ? [...manualStep.flags] : [];
  });

/** Where the program of some arguments is: the offset its one step names. */
export interface ProgramPlace {
  readonly offset: number;
  readonly use: VariableProgramUse | undefined;
}

/**
 * The findings of the arguments that a program gets. After a program that may be the generator
 * or another one (some definitions of its variable, a default, a value set where the tool does not
 * read) they are one step at the program's place that names the old flags, since the tool cannot
 * tell which program runs there.
 */
export function programArgumentFindings(
  words: ShellCommand,
  { offset, use }: ProgramPlace,
  locate: Locate,
  variables: FileVariables,
): Finding[] {
  const found = words.flatMap((word) => argumentFindings(word, locate, variables));
  if (use?.program !== "generator-or-other") {
    return found;
  }
  const flags = [...new Set(oldFlagsOf(found))];
  if (flags.length === 0) {
    return [];
  }
  const location = locate(offset);
  const manualStep: ManualStep = {
    kind: "variable-not-only-generator",
    location,
    variable: use.written,
    flags,
  };
  return [{ offset, manualStep }];
}

/**
 * Text appended to the value of a variable (`GEN += -it`, `G+=" -it"`, `"npx …" + " -it"`): its
 * words are arguments of the program that the value runs before them, so their old flags are
 * renamed where they are written when that program is the generator, and reported when it may be
 * another one.
 */
export interface AppendedValue {
  readonly words: ShellCommand;
  readonly program: VariableProgramUse;
}

/** The findings of appended text, and of the words in it that name an old package otherwise. */
export function appendedValueFindings(
  { words, program }: AppendedValue,
  locate: Locate,
  variables: FileVariables,
): Finding[] {
  const place: ProgramPlace = { offset: words[0]?.start ?? 0, use: program };
  const found =
    program.program === "other" ? [] : programArgumentFindings(words, place, locate, variables);
  const handled = new Set(found.map((finding) => finding.offset));
  return [...found, ...unmigratedWordFindings(words, handled, locate)];
}
