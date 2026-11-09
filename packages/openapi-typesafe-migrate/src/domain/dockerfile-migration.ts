import { type CommandMigration, commandWordFindings } from "./command-migration.js";
import { lineLocator } from "./migration-findings.js";
import { type ShellWord, shellCommands } from "./shell-words.js";
import { applyTextEdits } from "./text-edits.js";

/**
 * Dockerfiles and Containerfiles. `RUN`, `CMD` and `ENTRYPOINT` take a command in shell form (a
 * line the shell splits) or in exec form: a JSON array of strings, each one word, which no shell
 * splits. Docker reads an instruction whose argument is not a valid JSON array as shell form, and
 * so does the migration.
 */

/**
 * An instruction that takes a command, at the start of a line, before its `[`. In capitals, as
 * Dockerfiles write them and as the launcher table reads the shell form (command-launchers.ts).
 */
const EXEC_FORM_START_RE = /^[ \t]*(?:RUN|CMD|ENTRYPOINT)[ \t]+\[/gm;
/** Blanks between the items of the array; a `\` at the end of a line continues the instruction. */
const ARRAY_BLANK_RE = /(?:[ \t\r\n]|\\\r?\n)*/y;
/** A double-quoted string on one line; `JSON.parse` decides whether it is a JSON string. */
const QUOTED_RE = /"(?:[^"\\\n]|\\.)*"/y;
const ITEM_SEPARATOR = ",";
const NOT_LINE_BREAK_RE = /[^\n]/g;
const ARRAY_END = "]";

/** Where a pattern with the sticky flag matches at `index`, or undefined. */
function matchAt(pattern: RegExp, text: string, index: number): string | undefined {
  pattern.lastIndex = index;
  return pattern.exec(text)?.[0];
}

/** The value of a JSON string, or undefined when `raw` is not one (a bad escape, a raw tab). */
function jsonString(raw: string): string | undefined {
  try {
    return JSON.parse(raw) as string;
  } catch (error) {
    // Docker reads an argument that is not valid JSON as shell form; so does the migration.
    if (error instanceof SyntaxError) {
      return undefined;
    }
    throw error;
  }
}

/** One exec-form array: where it starts (at the `[`) and ends (after the `]`), and its words. */
interface ExecForm {
  readonly start: number;
  readonly end: number;
  readonly words: readonly ShellWord[];
}

/** The exec-form array whose `[` is at `start`, or undefined when it is not one. */
function execFormAt(text: string, start: number): ExecForm | undefined {
  const words: ShellWord[] = [];
  let index = start + 1;
  for (;;) {
    index += matchAt(ARRAY_BLANK_RE, text, index)?.length ?? 0;
    const raw = matchAt(QUOTED_RE, text, index);
    if (raw === undefined) {
      const isEmpty = text[index] === ARRAY_END && words.length === 0;
      return isEmpty ? { start, end: index + 1, words } : undefined;
    }
    const value = jsonString(raw);
    if (value === undefined) {
      return undefined;
    }
    // A word is the text inside the quotes, as an exec-form item of a YAML file is.
    words.push({ start: index + 1, end: index + raw.length - 1, value, raw: raw.slice(1, -1) });
    index += raw.length;
    index += matchAt(ARRAY_BLANK_RE, text, index)?.length ?? 0;
    if (text[index] === ARRAY_END) {
      return { start, end: index + 1, words };
    }
    if (text[index] !== ITEM_SEPARATOR) {
      return undefined;
    }
    index++;
  }
}

/** The exec-form arrays of a Dockerfile, in order. */
function execForms(text: string): ExecForm[] {
  return [...text.matchAll(EXEC_FORM_START_RE)].flatMap((match) => {
    const form = execFormAt(text, match.index + match[0].length - 1);
    return form === undefined ? [] : [form];
  });
}

/** The text with the arrays blanked out, line breaks kept, so the shell reads the rest. */
function withoutExecForms(text: string, forms: readonly ExecForm[]): string {
  const parts: string[] = [];
  let copiedUpTo = 0;
  for (const { start, end } of forms) {
    parts.push(
      text.slice(copiedUpTo, start),
      text.slice(start, end).replace(NOT_LINE_BREAK_RE, " "),
    );
    copiedUpTo = end;
  }
  parts.push(text.slice(copiedUpTo));
  return parts.join("");
}

/**
 * Migrate the commands of a Dockerfile: exec-form arrays word by word, everything else as shell
 * text. Each finding names its `file:line`.
 */
export function migrateDockerfile(text: string, file: string): CommandMigration {
  const lineOf = lineLocator(text);
  const locate = (offset: number): string => `${file}:${lineOf(offset)}`;
  const forms = execForms(text);
  const commands = [
    ...shellCommands(withoutExecForms(text, forms)),
    ...forms.map((form) => form.words),
  ];
  const { edits, changes, manualSteps } = commandWordFindings(commands, locate);
  return { text: applyTextEdits(text, edits), changes, manualSteps };
}
