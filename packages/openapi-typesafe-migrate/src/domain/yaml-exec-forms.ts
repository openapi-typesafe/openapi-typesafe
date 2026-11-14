import type { DocumentString } from "./config-documents.js";
import { shellScript } from "./exec-form-shells.js";
import type { ShellCommand } from "./shell-words.js";

/**
 * Commands in exec form in YAML files: a list under `command` or `entrypoint` (Compose,
 * Kubernetes), each item one word that no shell splits. A container runs its parts as one list:
 * Compose its `entrypoint` and then its `command`, Kubernetes its `command` and then its `args`.
 * A string value of these keys is still shell text.
 */

/** The keys of the parts of one exec-form command, in the order the container runs them. */
const EXEC_FORM_PARTS: readonly string[] = ["entrypoint", "command", "args"];
/** A part that is only the rest of a command: `args` alone runs the image's own program. */
const TRAILING_PART = "args";

const partOf = (item: DocumentString): string => String(item.path.at(-2));

/** Whether a value is an item of an exec-form list: a numbered item under one of the part keys. */
export const isExecFormItem = (value: DocumentString): boolean =>
  typeof value.path.at(-1) === "number" && EXEC_FORM_PARTS.includes(partOf(value));

const ownerOf = (item: DocumentString): string => item.path.slice(0, -2).join(".");

/**
 * Whether an item follows the one before it in the same list: every list starts again at item 0,
 * also where the next document of a stream repeats a list's path.
 */
const isNextItem = (previous: DocumentString, item: DocumentString): boolean =>
  Number(item.path.at(-1)) > Number(previous.path.at(-1));

/** The items of each exec-form list, one list each, in the order of the text. */
function execFormLists(items: readonly DocumentString[]): DocumentString[][] {
  const lists: DocumentString[][] = [];
  let previous: DocumentString | undefined;
  for (const item of items) {
    if (previous === undefined || !isNextItem(previous, item)) {
      lists.push([]);
    }
    lists.at(-1)?.push(item);
    previous = item;
  }
  return lists;
}

/** Whether `list` is the next part of the command that `parts` holds: same owner, a later key. */
function continuesCommand(parts: readonly DocumentString[], list: readonly DocumentString[]) {
  const [last, first] = [parts.at(-1), list[0]];
  return (
    last !== undefined &&
    first !== undefined &&
    ownerOf(last) === ownerOf(first) &&
    EXEC_FORM_PARTS.indexOf(partOf(first)) > EXEC_FORM_PARTS.indexOf(partOf(last))
  );
}

/**
 * The exec-form commands of the items of exec-form lists, each the words of the parts of one
 * container joined in order. An `args` list without a part before it is left out.
 */
export function execForms(items: readonly DocumentString[]): DocumentString[][] {
  const commands: DocumentString[][] = [];
  for (const list of execFormLists(items)) {
    const command = commands.at(-1);
    if (command !== undefined && continuesCommand(command, list)) {
      command.push(...list);
    } else if (list[0] !== undefined && partOf(list[0]) !== TRAILING_PART) {
      commands.push([...list]);
    }
  }
  return commands;
}

/** The item of each exec-form command that a shell it starts reads as a command line. */
export const execFormScripts = (forms: readonly DocumentString[][]): DocumentString[] =>
  forms.flatMap((words) => shellScript(words) ?? []);

/** The words of exec-form commands as shell words, the text inside each item's quotes. */
export const execFormCommands = (
  text: string,
  forms: readonly DocumentString[][],
): ShellCommand[] =>
  forms.map((words) =>
    words.map((item) => {
      const { start, end } = item.content;
      return { start, end, value: item.value, raw: text.slice(start, end) };
    }),
  );
