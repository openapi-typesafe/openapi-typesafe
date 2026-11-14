import type { Finding, Locate } from "./argument-findings.js";
import { commandWordFindings, type ShellTextFindings, textFindings } from "./command-migration.js";
import { type DocumentString, ownerKey } from "./config-documents.js";
import { entrypointArgumentFindings, shellScript } from "./entrypoint-arguments.js";
import { type ShellWord, shellCommands } from "./shell-words.js";

/**
 * The commands of containers in YAML files, the one place that builds them: Compose, GitLab and
 * CircleCI images append `command` to `entrypoint`, Kubernetes appends `args` to `command`, both
 * keys in one map. A list value is exec form, each item one word that no shell splits; a string
 * value is shell text, read where it is written as other command values are. When every part is
 * a list, the container runs one command of all their items (`["npx"]` and then
 * `["openapi-typescript", "-it"]`), read once for its old names and flags and for the command line
 * of `["sh", "-c", "…"]`. When a part is a string, the command is the arguments of the
 * entrypoint (entrypoint-arguments.ts).
 */

/** The key of an entrypoint, and the key of its arguments in the same map. */
const ARGUMENT_KEYS: ReadonlyMap<string, string> = new Map([
  ["entrypoint", "command"],
  ["command", "args"],
]);
const PAIRED_KEYS: ReadonlySet<string> = new Set([
  ...ARGUMENT_KEYS.keys(),
  ...ARGUMENT_KEYS.values(),
]);
/** A key whose value only adds to a command: `args` alone runs the image's own program. */
const TRAILING_KEY = "args";
const LINE_BREAK = "\n";

/** One value of a paired key: its strings (one scalar, or the items of one list). */
interface KeyValue {
  readonly map: string;
  readonly key: string;
  readonly strings: DocumentString[];
}

const isItem = (string: DocumentString): boolean => typeof string.path.at(-1) === "number";

/** Whether a value is an item of a container's list, which the container commands read. */
export const isContainerListItem = (string: DocumentString): boolean =>
  isItem(string) && PAIRED_KEYS.has(String(string.path.at(-2)));

const isList = (value: KeyValue): boolean =>
  value.strings[0] !== undefined && isItem(value.strings[0]);

/** The path of the map that holds a value, as text. */
const mapOf = (string: DocumentString): string =>
  JSON.stringify(string.path.slice(0, isItem(string) ? -2 : -1));

/** Whether `string` is the next item of the list that `value` holds. */
function isNextItem(value: KeyValue | undefined, string: DocumentString): boolean {
  const last = value?.strings.at(-1);
  return (
    last !== undefined &&
    isItem(last) &&
    isItem(string) &&
    JSON.stringify(last.path.slice(0, -1)) === JSON.stringify(string.path.slice(0, -1)) &&
    Number(string.path.at(-1)) > Number(last.path.at(-1))
  );
}

/**
 * The values of the paired keys, in the order of the text, each place once (an alias gives the
 * strings of its anchor again). A stream of documents repeats a path, so a scalar, or a list item
 * whose index does not grow, starts another value.
 */
function keyValues(strings: readonly DocumentString[]): KeyValue[] {
  const values: KeyValue[] = [];
  const starts = new Set<number>();
  for (const string of strings) {
    const key = ownerKey(string.path) ?? "";
    const isValue = isItem(string) ? string.path.at(-2) === key : string.path.at(-1) === key;
    if (!PAIRED_KEYS.has(key) || !isValue || starts.has(string.start)) {
      continue;
    }
    starts.add(string.start);
    const last = values.at(-1);
    if (last !== undefined && isNextItem(last, string)) {
      last.strings.push(string);
    } else {
      values.push({ map: mapOf(string), key, strings: [string] });
    }
  }
  return values;
}

/** Whether a scalar's text as written is its value, so its words can be edited in place. */
const isPlaceable = (string: DocumentString, text: string): boolean =>
  !string.isEscaped &&
  !(string.isFolded && text.slice(string.content.start, string.content.end).includes(LINE_BREAK));

/** A word of a container's command, with the list item that holds it when it is one. */
interface ContainerWord extends ShellWord {
  readonly item?: DocumentString;
}

/** The words of a value and whether they are placed where they are written. */
interface ValueWords {
  readonly words: readonly ContainerWord[];
  readonly isPlaced: boolean;
}

/** The first command of a scalar: placed in the text, or all at its start when it cannot be. */
function scalarWords(scalar: DocumentString, text: string): ValueWords {
  const { start, end } = scalar.content;
  const isPlaced = isPlaceable(scalar, text);
  const [words = []] = shellCommands(isPlaced ? text.slice(start, end) : scalar.value);
  const at = (word: ShellWord): ShellWord =>
    isPlaced
      ? { ...word, start: word.start + start, end: word.end + start }
      : { ...word, start: scalar.start, end: scalar.start };
  return { words: words.map(at), isPlaced };
}

/** The words of a value: each list item, or the first command of a scalar. */
function valueWords(value: KeyValue, text: string): ValueWords {
  const [first] = value.strings;
  if (first !== undefined && !isItem(first)) {
    return scalarWords(first, text);
  }
  const words = value.strings.map((item): ContainerWord => {
    const { start, end } = item.content;
    return { start, end, value: item.value, raw: text.slice(start, end), item };
  });
  return { words, isPlaced: true };
}

/** The entrypoint and the arguments of two values next to each other, in either order. */
function pairOf(left: KeyValue, right: KeyValue | undefined): [KeyValue, KeyValue] | undefined {
  if (right === undefined || left.map !== right.map) {
    return undefined;
  }
  if (ARGUMENT_KEYS.get(left.key) === right.key) {
    return [left, right];
  }
  return ARGUMENT_KEYS.get(right.key) === left.key ? [right, left] : undefined;
}

/** One container: its entrypoint (or its only part) and the command it gets as arguments. */
interface Container {
  readonly entrypoint: KeyValue;
  readonly command: KeyValue | undefined;
}

/**
 * The containers of an entrypoint and its arguments next to each other in one map, from the start
 * of the text, each value in one container: the documents of a stream may hold the same map path,
 * so a value is paired with its neighbour in the same document. An `args` value alone is left out.
 */
function containers(values: readonly KeyValue[]): Container[] {
  const found: Container[] = [];
  for (let index = 0; index < values.length; index++) {
    const value = values[index] as KeyValue;
    const pair = pairOf(value, values[index + 1]);
    if (pair !== undefined) {
      found.push({ entrypoint: pair[0], command: pair[1] });
      index++;
    } else if (value.key !== TRAILING_KEY) {
      found.push({ entrypoint: value, command: undefined });
    }
  }
  return found;
}

/**
 * The exec-form command of a container: the items of its lists, the entrypoint first. A string
 * part is read where it is written, so a container with one holds at most one list.
 */
function listCommand({ entrypoint, command }: Container, text: string): ContainerWord[] {
  const parts = command === undefined ? [entrypoint] : [entrypoint, command];
  return parts.filter(isList).flatMap((part) => valueWords(part, text).words);
}

/**
 * The old flags in the command that a container's entrypoint gets as arguments, where the joined
 * command does not show them: after a string entrypoint, or after a shell script that may pass its
 * arguments on. A command whose text is not its value as written is reported, not edited.
 */
function argumentFindings(container: Container, text: string, locate: Locate): Finding[] {
  const { entrypoint, command } = container;
  if (command === undefined) {
    return [];
  }
  const words = valueWords(entrypoint, text).words;
  if (isList(entrypoint) && isList(command) && shellScript(words) === undefined) {
    return [];
  }
  const args = valueWords(command, text);
  const pair = { entrypoint: words, command: args.words, written: entrypoint.key };
  return entrypointArgumentFindings({ ...pair, isPlaced: args.isPlaced }, locate);
}

/** What the commands of the containers in a YAML file give. */
export interface ContainerCommands {
  /** The old names and flags of the commands. */
  readonly findings: readonly ShellTextFindings[];
  /** The items that a shell the commands start reads as command lines (`["sh", "-c", "…"]`). */
  readonly scripts: ReadonlySet<DocumentString>;
}

/** The commands of the containers in a YAML file: their findings and their shell scripts. */
export function containerCommands(
  text: string,
  strings: readonly DocumentString[],
  locate: Locate,
): ContainerCommands {
  const found = containers(keyValues(strings));
  const commands = found.map((container) => listCommand(container, text));
  const scripts = commands.flatMap((words) => shellScript(words)?.item ?? []);
  const flags = found.flatMap((container) => argumentFindings(container, text, locate));
  return {
    findings: [commandWordFindings(commands, locate), textFindings(flags)],
    scripts: new Set(scripts),
  };
}
