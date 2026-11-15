import type { ShellCommand, ShellWord } from "./shell-word-parts.js";
import { type PlacedText, rawText, unquotedRawText } from "./word-places.js";

/**
 * The variables a shell text sets itself: `GEN="npx openapi-typescript"` alone or before a
 * command, and the arguments of `export`, `readonly`, `local`, `declare` and `typeset`. A later
 * `$GEN a.yaml -it` runs what the value holds, so the value is read as a command line where it is
 * set, and the commands that expand the variable know which program it runs. bash, ksh and zsh
 * also append to a value (`G+=" -it"`).
 */

/** A word that assigns a variable (POSIX 2.9.1): a name, `=` or `+=`, then the value. */
export const ASSIGNMENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)(\+?=)/;
const APPEND_OPERATOR = "+=";

/** Builtins whose `NAME=value` arguments set variables of the shell. */
const DECLARATION_BUILTINS: ReadonlySet<string> = new Set([
  "export",
  "readonly",
  "local",
  "declare",
  "typeset",
]);

/**
 * One assignment: the variable, its value after quote removal, its word, and whether it appends
 * the value to the one the variable has. `head` is the length of `NAME=` or `NAME+=`.
 */
export interface ShellAssignment {
  readonly name: string;
  readonly value: string;
  readonly word: ShellWord;
  readonly isAppend: boolean;
  readonly head: number;
}

/** How many words at the start of a command are assignments. */
function leadingAssignments(command: ShellCommand): number {
  const index = command.findIndex((word) => !ASSIGNMENT_RE.test(word.raw));
  return index === -1 ? command.length : index;
}

/**
 * A word after a program written as an assignment: `NAME=value`, and the other operators of make
 * (`NAME:=value`, `::=`, `:::=`, `?=`, `!=`, `+=`), which reads every argument with one of them as
 * a variable it sets (`$(MAKE) -C api GEN:="npx openapi-typescript"`), with the names make allows.
 */
const ARGUMENT_ASSIGNMENT_RE = /^([A-Za-z_][A-Za-z0-9_.-]*)(:::=|::=|:=|\?=|!=|\+?=)/;

/** The assignment that a word is written as by `pattern`, or none. */
function assignmentOf(word: ShellWord, pattern: RegExp = ASSIGNMENT_RE): ShellAssignment[] {
  const match = pattern.exec(word.raw);
  const name = match?.[1];
  if (match === null || name === undefined) {
    return [];
  }
  const head = match[0].length;
  const isAppend = match[2] === APPEND_OPERATOR;
  return [{ name, value: word.value.slice(head), word, isAppend, head }];
}

/** The assignments of one command, in order. */
export function shellAssignments(command: ShellCommand): ShellAssignment[] {
  const count = leadingAssignments(command);
  const isDeclaration = DECLARATION_BUILTINS.has(command[count]?.value ?? "");
  const words = [...command.slice(0, count), ...(isDeclaration ? command.slice(count + 1) : [])];
  return words.flatMap((word) => assignmentOf(word));
}

/**
 * The words after the program of a command that are written as assignments: `cross-env
 * GEN="npx openapi-typescript -it" node gen.js`, `env GEN=… make`, `make GEN="…"`. The program
 * gets the variable and may run its value, but the shell sets nothing, so they define no
 * variable of the text.
 */
export function argumentAssignments(command: ShellCommand): ShellAssignment[] {
  const own = new Set(shellAssignments(command).map(({ word }) => word));
  return command
    .slice(leadingAssignments(command))
    .filter((word) => !own.has(word))
    .flatMap((word) => assignmentOf(word, ARGUMENT_ASSIGNMENT_RE));
}

/** A value with a blank or a command separator in it, which only a command line has. */
const COMMAND_LINE_RE = /[\s;&|()`]/;

/**
 * Whether the value of an argument assignment is a command line, as a quoted argument with
 * blanks is (`sh -c "…"`): one word (`make V=1`) may be anything, so it is not read as one.
 */
export const holdsCommandLine = (assignment: ShellAssignment): boolean =>
  COMMAND_LINE_RE.test(assignment.value);

const ARRAY_OPEN = "(";

/**
 * Whether an assignment sets a bash array (`GEN=(npx openapi-typescript)`). Its items are read
 * as a command line where they are written, but what an expansion of it runs (`$GEN` is the first
 * item, `"${GEN[@]}"` all of them) is not read: the commands after it are reported.
 */
export const isArrayAssignment = (assignment: ShellAssignment): boolean =>
  assignment.word.raw.startsWith(ARRAY_OPEN, assignment.head);

/**
 * The value of an assignment as the shell reads it (`GEN=npx\ a`, `GEN="npx "a` and `GEN="npx a"`
 * are all `npx a`), each character placed where it is written. A later `$GEN` splits that value
 * into words, so the value is read as a command line, the same text that says which program the
 * variable runs (shell-variables.ts). The items of an array are read as written, between its
 * parentheses: a word is an array assignment only up to the `)` that closes it
 * (shell-word-parts.ts).
 */
export function assignmentValue(assignment: ShellAssignment): PlacedText {
  const { word, head } = assignment;
  return isArrayAssignment(assignment)
    ? rawText(word, head + 1, word.raw.slice(head + 1, -1))
    : unquotedRawText(word, head);
}
