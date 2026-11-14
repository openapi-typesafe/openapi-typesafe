import { type ShellCommand, type ShellWord, unquotedText } from "./shell-word-parts.js";

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

/** The assignment that a word is written as, or none. */
function assignmentOf(word: ShellWord): ShellAssignment[] {
  const match = ASSIGNMENT_RE.exec(word.raw);
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
  return words.flatMap(assignmentOf);
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
    .flatMap(assignmentOf);
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
 * are all `npx a`), and how to move a word read from it onto the text as written. A later `$GEN`
 * splits that value into words, so the value is read as a command line, the same text that
 * says which program the variable runs (shell-variables.ts), and each word is placed where its
 * characters are written. The items of an array are read as written.
 */
export interface AssignmentValue {
  readonly text: string;
  readonly place: (word: ShellWord) => ShellWord;
}

/**
 * The items of an array assignment as written, between its parentheses: a word is an array
 * assignment only up to the `)` that closes it (shell-word-parts.ts).
 */
function arrayValue({ word, head }: ShellAssignment): AssignmentValue {
  const start = word.start + head + 1;
  const place = (found: ShellWord): ShellWord => ({
    ...found,
    start: found.start + start,
    end: found.end + start,
  });
  return { text: word.raw.slice(head + 1, -1), place };
}

/** The value of an assignment as a command line, with the places of its words. */
export function assignmentValue(assignment: ShellAssignment): AssignmentValue {
  if (isArrayAssignment(assignment)) {
    return arrayValue(assignment);
  }
  const { word, head } = assignment;
  const { value, offsets } = unquotedText(word.raw.slice(head));
  const written = (index: number): number => head + (offsets[index] as number);
  const place = (found: ShellWord): ShellWord => {
    const first = written(found.start);
    const end = written(found.end - 1) + 1;
    const raw = word.raw.slice(first, end);
    return { ...found, start: word.start + first, end: word.start + end, raw };
  };
  return { text: value, place };
}
