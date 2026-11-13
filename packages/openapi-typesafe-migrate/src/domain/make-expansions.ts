import { type ShellCommand, shellCommandsAt } from "./shell-words.js";

/**
 * Make expansions in a Makefile: `$(NAME)`, `${NAME}` and function calls such as `$(or …)`. Make
 * expands them before a recipe line reaches the shell, so the shell reads each as one word. The
 * functions that give one of their arguments as their value (`$(or $(GEN),npx
 * openapi-typescript)`) have command text in those arguments, read where it is written.
 */

const DOLLAR = "$";
const CLOSING: Readonly<Record<string, string>> = { "(": ")", "{": "}" };
const MASK = "_";
const ARGUMENT_SEPARATOR = ",";

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

/** A make expansion: where its `$` is and where it ends. */
interface Expansion {
  readonly start: number;
  readonly end: number;
}

/** The expansions of a text, outside one another; `$$` is a `$` for the shell. */
function expansionsOf(text: string): Expansion[] {
  const found: Expansion[] = [];
  for (let index = text.indexOf(DOLLAR); index !== -1; index = text.indexOf(DOLLAR, index + 1)) {
    if (text[index + 1] === DOLLAR) {
      index++;
      continue;
    }
    const end = expansionEnd(text, index);
    if (end !== undefined) {
      found.push({ start: index, end });
      index = end - 1;
    }
  }
  return found;
}

/**
 * The text with each `$(…)` and `${…}` expansion turned into one word of the same length, so the
 * shell reads it as make passes it on.
 */
export function maskExpansions(text: string): string {
  const parts: string[] = [];
  let copiedUpTo = 0;
  for (const { start, end } of expansionsOf(text)) {
    parts.push(text.slice(copiedUpTo, start + 1), MASK.repeat(end - start - 1));
    copiedUpTo = end;
  }
  parts.push(text.slice(copiedUpTo));
  return parts.join("");
}

/**
 * The functions whose value is one of their arguments, by the first argument that can be it:
 * `$(if COND,THEN,ELSE)` gives THEN or ELSE, `$(or A,B)` the first that is not empty, `$(and A,B)`
 * the last. Any other function (`$(shell …)`, `$(subst …)`) computes a new text.
 */
const VALUE_ARGUMENTS: ReadonlyMap<string, number> = new Map([
  ["if", 1],
  ["or", 0],
  ["and", 0],
]);
/** The head of a function call: `$(`, the function's name and the blanks after it. */
const FUNCTION_HEAD_RE = /^\$[({]([a-z]+)[ \t]+/;
const OPENING: ReadonlySet<string> = new Set(Object.keys(CLOSING));
const CLOSINGS: ReadonlySet<string> = new Set(Object.values(CLOSING));

/** An argument of a function call, as written, and where it starts in the whole text. */
interface Argument {
  readonly text: string;
  readonly start: number;
}

/** The arguments of a call between `start` and `end`, split at commas outside parentheses. */
function callArguments(text: string, start: number, end: number): Argument[] {
  const found: Argument[] = [];
  let argumentStart = start;
  let depth = 0;
  for (let index = start; index < end; index++) {
    const char = text[index] as string;
    depth += OPENING.has(char) ? 1 : CLOSINGS.has(char) ? -1 : 0;
    if (char === ARGUMENT_SEPARATOR && depth === 0) {
      found.push({ text: text.slice(argumentStart, index), start: argumentStart });
      argumentStart = index + 1;
    }
  }
  return [...found, { text: text.slice(argumentStart, end), start: argumentStart }];
}

/** The arguments of the expansion that can be its value, or none for another expansion. */
function valueArguments(text: string, { start, end }: Expansion): Argument[] {
  const head = FUNCTION_HEAD_RE.exec(text.slice(start, end));
  const first = head === null ? undefined : VALUE_ARGUMENTS.get(head[1] as string);
  if (head === null || first === undefined) {
    return [];
  }
  return callArguments(text, start + head[0].length, end - 1).slice(first);
}

/**
 * The commands in the value arguments of the function calls of `text`, which starts at `offset`
 * of the whole text, also of calls nested in such an argument. Each argument is read as a command
 * line where it is written, with its own expansions as words.
 */
export function functionCommands(text: string, offset = 0): ShellCommand[] {
  return expansionsOf(text)
    .flatMap((expansion) => valueArguments(text, expansion))
    .flatMap((argument) => [
      ...shellCommandsAt(maskExpansions(argument.text), offset + argument.start),
      ...functionCommands(argument.text, offset + argument.start),
    ]);
}
