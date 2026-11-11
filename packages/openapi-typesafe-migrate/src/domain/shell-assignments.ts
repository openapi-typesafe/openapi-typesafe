import { type ShellCommand, type ShellWord, wordPart } from "./shell-word-parts.js";

/**
 * The variables a shell text sets itself: `GEN="npx openapi-typescript"` alone or before a
 * command, and the arguments of `export`, `readonly`, `local`, `declare` and `typeset`. A later
 * `$GEN a.yaml -it` runs what the value holds, so the value is read as a command line where it is
 * set, and the commands that expand the variable know which program it runs.
 */

/** A word that assigns a variable (POSIX 2.9.1): a name, `=`, then the value. */
export const ASSIGNMENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)=/;

/** Builtins whose `NAME=value` arguments set variables of the shell. */
const DECLARATION_BUILTINS: ReadonlySet<string> = new Set([
  "export",
  "readonly",
  "local",
  "declare",
  "typeset",
]);

const QUOTES: ReadonlySet<string> = new Set(["'", '"']);
/**
 * Characters that make an unquoted value more than a plain command line: quotes and escapes (its
 * offsets would not map onto the value), and expansions, whose result only the shell knows.
 */
const UNPLAIN_RE = /['"\\$`]/;

/** One assignment: the variable, its value after quote removal, and its word. */
export interface ShellAssignment {
  readonly name: string;
  readonly value: string;
  readonly word: ShellWord;
}

/** How many words at the start of a command are assignments. */
function leadingAssignments(command: ShellCommand): number {
  const index = command.findIndex((word) => !ASSIGNMENT_RE.test(word.raw));
  return index === -1 ? command.length : index;
}

/** The assignments of one command, in order. */
export function shellAssignments(command: ShellCommand): ShellAssignment[] {
  const count = leadingAssignments(command);
  const isDeclaration = DECLARATION_BUILTINS.has(command[count]?.value ?? "");
  const words = [...command.slice(0, count), ...(isDeclaration ? command.slice(count + 1) : [])];
  return words.flatMap((word) => {
    const match = ASSIGNMENT_RE.exec(word.raw);
    const name = match?.[1];
    return name === undefined ? [] : [{ name, value: word.value.slice(name.length + 1), word }];
  });
}

const ARRAY_OPEN = "(";
const ARRAY_CLOSE = ")";

/**
 * Whether an assignment sets a bash array (`GEN=(npx openapi-typescript)`). Its items are read
 * as a command line where they are written, but what an expansion of it runs (`$GEN` is the first
 * item, `"${GEN[@]}"` all of them) is not read: the commands after it are reported.
 */
export const isArrayAssignment = (assignment: ShellAssignment): boolean =>
  assignment.word.raw.startsWith(ARRAY_OPEN, assignment.name.length + 1);

/**
 * The value of an assignment as written and its offset in the text, when its offsets map one to
 * one onto the text: a plain value, one quoted string (read as written, as a quoted command line
 * is), or the items of an array. Undefined for a value built of several parts.
 */
export function assignmentValueText(
  assignment: ShellAssignment,
): { readonly text: string; readonly start: number } | undefined {
  const at = assignment.name.length + 1;
  const raw = assignment.word.raw.slice(at);
  const start = assignment.word.start + at;
  const quote = raw[0] ?? "";
  if (isArrayAssignment(assignment)) {
    return raw.endsWith(ARRAY_CLOSE) ? { text: raw.slice(1, -1), start: start + 1 } : undefined;
  }
  if (QUOTES.has(quote)) {
    const isOneString =
      raw.length > 1 && raw.endsWith(quote) && wordPart(raw, 0).end === raw.length;
    return isOneString ? { text: raw.slice(1, -1), start: start + 1 } : undefined;
  }
  return UNPLAIN_RE.test(raw) ? undefined : { text: raw, start };
}
