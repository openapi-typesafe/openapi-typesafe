import {
  type CommandMigration,
  commandWordFindings,
  type FileVariables,
  runsGenerator,
} from "./command-migration.js";
import { lineLocator } from "./migration-findings.js";
import { type ShellWord, shellCommands } from "./shell-words.js";
import { applyTextEdits } from "./text-edits.js";
import {
  type ProgramDefinition,
  type VariableProgram,
  variablePrograms,
} from "./variable-programs.js";

/**
 * Makefiles. Make expands its variables before a recipe line reaches the shell, so a variable can
 * hold the generator command: `OAT := openapi-typescript`, then `$(OAT) a.yaml -it`. The value of
 * an assignment is read as a command and migrated where it is set; the flags after a reference
 * to such a variable, or to one set to it (`GEN := $(OAT)`), are migrated where it is used.
 * Everything else is shell text.
 */

/**
 * A variable assignment at the start of a line (not a recipe line, which starts with a tab), also
 * one for some targets only (`gen: OAT := openapi-typescript`).
 */
const ASSIGNMENT_RE = new RegExp(
  [
    "^(?:[^\\s:#=][^:#=\\n]*:[ \\t]*)?",
    "(?:(?:export|override|private)[ \\t]+)*",
    "([A-Za-z_][A-Za-z0-9_.-]*)",
    "[ \\t]*(:::=|::=|:=|\\?=|\\+=|!=|=)",
  ].join(""),
  "gm",
);
/**
 * A reference to one variable, as a whole word: `$(NAME)`, `${NAME}`, or `$N` for a variable whose
 * name is one letter, as make reads a `$` before any other character.
 */
const VARIABLE_REFERENCE_RE =
  /^\$(?:\(([A-Za-z_][A-Za-z0-9_.-]*)\)|\{([A-Za-z_][A-Za-z0-9_.-]*)\}|([A-Za-z_]))$/;
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

/** `+=` adds text to the value a variable already has, so the program it runs stays. */
const APPEND_OPERATOR = "+=";

/** An assignment of a Makefile: the variable, where it starts, and where its value is. */
interface Assignment {
  readonly name: string;
  readonly isAppend: boolean;
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
    const name = match[1] as string;
    const isAppend = match[2] === APPEND_OPERATOR;
    return { name, isAppend, start: match.index, valueStart, valueEnd };
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

/** The variable that `written` references as a whole, after the recipe prefix, or undefined. */
function referencedName(written: string): string | undefined {
  const match = VARIABLE_REFERENCE_RE.exec(written.trim().replace(RECIPE_PREFIX_RE, ""));
  return match === null ? undefined : (match[1] ?? match[2] ?? match[3]);
}

/**
 * Each assignment as the program it sets: text appended to the value, a reference to one variable
 * (`GEN := $(OAT)`), or a command, which runs the generator when one of the commands that start in
 * its value does.
 */
function programDefinitions(
  text: string,
  commands: readonly (readonly ShellWord[])[],
  assignments: readonly Assignment[],
): ProgramDefinition[] {
  const generatorStarts = commands
    .filter(runsGenerator)
    .map((command) => (command[0] as ShellWord).start);
  return assignments.map(({ name, isAppend, valueStart, valueEnd }): ProgramDefinition => {
    if (isAppend) {
      return { name, kind: "append" };
    }
    const target = referencedName(text.slice(valueStart, valueEnd));
    if (target !== undefined) {
      return { name, kind: "reference", target };
    }
    const runs = generatorStarts.some((start) => valueStart <= start && start < valueEnd);
    return { name, kind: "command", runsGenerator: runs };
  });
}

/** The values each variable gets in the file, joined: any of them can reach a command. */
function variableValues(text: string, assignments: readonly Assignment[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const { name, valueStart, valueEnd } of assignments) {
    const value = text.slice(valueStart, valueEnd);
    values.set(name, [values.get(name), value].filter((part) => part !== undefined).join(" "));
  }
  return values;
}

/** The variables of a Makefile, read from its assignments. */
function makefileVariables(
  text: string,
  assignments: readonly Assignment[],
  programs: ReadonlyMap<string, VariableProgram>,
) {
  const values = variableValues(text, assignments);
  const nameAt = (word: ShellWord) => referencedName(text.slice(word.start, word.end));
  const variables: FileVariables = {
    programAt: (program) => {
      const name = nameAt(program);
      const found = name === undefined ? undefined : programs.get(name);
      const written = text.slice(program.start, program.end);
      return found === undefined ? undefined : { written, program: found };
    },
    referenceAt: (word) => {
      const name = nameAt(word);
      const value = name === undefined ? undefined : values.get(name);
      const written = text.slice(word.start, word.end);
      return value === undefined ? undefined : { written, value };
    },
  };
  return variables;
}

/** Migrate a Makefile; each finding names its `file:line`. */
export function migrateMakefile(text: string, file: string): CommandMigration {
  const lineOf = lineLocator(text);
  const assignments = assignmentsOf(text);
  const commands = shellCommands(withoutAssignmentHeads(maskExpansions(text), assignments));
  const programs = variablePrograms(programDefinitions(text, commands, assignments));
  const locate = (offset: number): string => `${file}:${lineOf(offset)}`;
  const variables = makefileVariables(text, assignments, programs);
  const { edits, changes, manualSteps } = commandWordFindings(commands, locate, variables);
  return { text: applyTextEdits(text, edits), changes, manualSteps };
}
