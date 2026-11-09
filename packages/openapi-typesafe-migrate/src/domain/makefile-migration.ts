import {
  type CommandMigration,
  commandWordFindings,
  type GeneratorReference,
  runsGenerator,
} from "./command-migration.js";
import { lineLocator } from "./migration-findings.js";
import { type ShellWord, shellCommands } from "./shell-words.js";
import { applyTextEdits } from "./text-edits.js";

/**
 * Makefiles. Make expands its variables before a recipe line reaches the shell, so a variable can
 * hold the generator command: `OAT := openapi-typescript`, then `$(OAT) a.yaml -it`. The value of
 * an assignment is read as a command and migrated where it is set; the flags after a reference
 * to such a variable are migrated where it is used. Everything else is shell text.
 */

/** A variable assignment at the start of a line (not a recipe line, which starts with a tab). */
const ASSIGNMENT_RE = new RegExp(
  [
    "^(?:(?:export|override|private)[ \\t]+)*",
    "([A-Za-z_][A-Za-z0-9_.-]*)",
    "[ \\t]*(?::::=|::=|:=|\\?=|\\+=|!=|=)",
  ].join(""),
  "gm",
);
/** A reference to one variable, as a whole word: `$(NAME)` or `${NAME}`. */
const VARIABLE_REFERENCE_RE =
  /^\$(?:\(([A-Za-z_][A-Za-z0-9_.-]*)\)|\{([A-Za-z_][A-Za-z0-9_.-]*)\})$/;
/** `@`, `-` and `+` before a recipe line: silent, ignore errors, always run. */
const RECIPE_PREFIX_RE = /^[@+-]+/;
const DOLLAR = "$";
const CLOSING: Readonly<Record<string, string>> = { "(": ")", "{": "}" };
const NOT_LINE_BREAK_RE = /[^\n]/g;
const MASK = "_";
const LINE_BREAK = "\n";
const BACKSLASH = "\\";

/** Where the make expansion that starts with the `$` at `start` ends, or undefined for none. */
function expansionEnd(text: string, start: number): number | undefined {
  const open = text[start + 1] ?? "";
  const close = CLOSING[open];
  if (close === undefined) {
    return undefined;
  }
  let depth = 0;
  for (let index = start + 1; index < text.length; index++) {
    if (text[index] === open) {
      depth++;
    } else if (text[index] === close && --depth === 0) {
      return index + 1;
    }
  }
  return undefined;
}

/**
 * The text with each `$(…)` and `${…}` expansion turned into one word of the same length, so the
 * shell reads it as make passes it on. `$$` is a `$` for the shell and stays.
 */
function maskExpansions(text: string): string {
  const parts: string[] = [];
  let copiedUpTo = 0;
  for (let index = text.indexOf(DOLLAR); index !== -1; index = text.indexOf(DOLLAR, index + 1)) {
    if (text[index + 1] === DOLLAR) {
      index++;
      continue;
    }
    const end = expansionEnd(text, index);
    if (end !== undefined) {
      parts.push(text.slice(copiedUpTo, index + 1), MASK.repeat(end - index - 1));
      copiedUpTo = end;
      index = end - 1;
    }
  }
  parts.push(text.slice(copiedUpTo));
  return parts.join("");
}

/** An assignment of a Makefile: the variable, where it starts, and where its value is. */
interface Assignment {
  readonly name: string;
  readonly start: number;
  readonly valueStart: number;
  readonly valueEnd: number;
}

/** Where the line that holds `index` ends; a `\` before a line break continues it. */
function logicalLineEnd(text: string, index: number): number {
  let end = text.indexOf(LINE_BREAK, index);
  while (end !== -1 && text[end - 1] === BACKSLASH) {
    end = text.indexOf(LINE_BREAK, end + 1);
  }
  return end === -1 ? text.length : end;
}

const assignmentsOf = (text: string): Assignment[] =>
  [...text.matchAll(ASSIGNMENT_RE)].map((match) => {
    const valueStart = match.index + match[0].length;
    const valueEnd = logicalLineEnd(text, valueStart);
    return { name: match[1] as string, start: match.index, valueStart, valueEnd };
  });

/** The text with the `NAME :=` of each assignment blanked, so its value reads as a command. */
function withoutAssignmentHeads(text: string, assignments: readonly Assignment[]): string {
  const parts: string[] = [];
  let copiedUpTo = 0;
  for (const { start, valueStart } of assignments) {
    parts.push(
      text.slice(copiedUpTo, start),
      text.slice(start, valueStart).replace(NOT_LINE_BREAK_RE, " "),
    );
    copiedUpTo = valueStart;
  }
  parts.push(text.slice(copiedUpTo));
  return parts.join("");
}

/** The variables whose value runs the generator, by the commands that start in their value. */
function generatorVariables(
  commands: readonly (readonly ShellWord[])[],
  assignments: readonly Assignment[],
): Set<string> {
  const names = new Set<string>();
  for (const command of commands.filter(runsGenerator)) {
    const start = (command[0] as ShellWord).start;
    const owner = assignments.find(
      (assignment) => assignment.valueStart <= start && start < assignment.valueEnd,
    );
    if (owner !== undefined) {
      names.add(owner.name);
    }
  }
  return names;
}

/** A program word that is a reference to one of `names`, after the recipe prefix. */
function referenceTo(text: string, names: ReadonlySet<string>): GeneratorReference {
  return (program) => {
    const written = text.slice(program.start, program.end).replace(RECIPE_PREFIX_RE, "");
    const match = VARIABLE_REFERENCE_RE.exec(written);
    return match !== null && names.has(match[1] ?? match[2] ?? "");
  };
}

/** Migrate a Makefile; each finding names its `file:line`. */
export function migrateMakefile(text: string, file: string): CommandMigration {
  const lineOf = lineLocator(text);
  const assignments = assignmentsOf(text);
  const commands = shellCommands(withoutAssignmentHeads(maskExpansions(text), assignments));
  const names = generatorVariables(commands, assignments);
  const locate = (offset: number): string => `${file}:${lineOf(offset)}`;
  const { edits, changes, manualSteps } = commandWordFindings(
    commands,
    locate,
    referenceTo(text, names),
  );
  return { text: applyTextEdits(text, edits), changes, manualSteps };
}
