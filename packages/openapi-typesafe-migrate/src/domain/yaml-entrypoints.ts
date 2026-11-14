import type { Locate } from "./argument-findings.js";
import { type ShellTextFindings, textFindings } from "./command-migration.js";
import { type DocumentString, ownerKey } from "./config-documents.js";
import { entrypointArgumentFindings } from "./entrypoint-arguments.js";
import { type ShellCommand, type ShellWord, shellCommands } from "./shell-words.js";

/**
 * The entrypoints of containers in YAML files and the commands they get as arguments
 * (entrypoint-arguments.ts): Compose, GitLab and CircleCI images append `command` to
 * `entrypoint`, Kubernetes appends `args` to `command`. Both keys are in one map.
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
const LINE_BREAK = "\n";

/** One value of a paired key: its strings (one scalar, or the items of one list). */
interface KeyValue {
  readonly map: string;
  readonly key: string;
  readonly strings: DocumentString[];
}

const isItem = (string: DocumentString): boolean => typeof string.path.at(-1) === "number";

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

/** The words of a value and whether they are placed where they are written. */
interface ValueWords {
  readonly words: ShellCommand;
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
  const words = value.strings.map((item): ShellWord => {
    const { start, end } = item.content;
    return { start, end, value: item.value, raw: text.slice(start, end) };
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

/**
 * The pairs of an entrypoint and its arguments next to each other in one map, from the start of
 * the text, each value in one pair: the documents of a stream may hold the same map path, so a
 * value is paired with its neighbour in the same document.
 */
function pairs(values: readonly KeyValue[]): [KeyValue, KeyValue][] {
  const found: [KeyValue, KeyValue][] = [];
  for (let index = 0; index < values.length; index++) {
    const pair = pairOf(values[index] as KeyValue, values[index + 1]);
    if (pair !== undefined) {
      found.push(pair);
      index++;
    }
  }
  return found;
}

/**
 * The old flags in the commands that an entrypoint gets as arguments in a YAML file. A command
 * whose text is not its value as written (an escape, a folded line break) is reported, not edited.
 */
export function yamlEntrypointFindings(
  text: string,
  strings: readonly DocumentString[],
  locate: Locate,
): ShellTextFindings {
  const found = pairs(keyValues(strings)).flatMap(([entrypoint, args]) => {
    const command = valueWords(args, text);
    const pair = {
      entrypoint: valueWords(entrypoint, text).words,
      command: command.words,
      written: entrypoint.key,
      isPlaced: command.isPlaced,
    };
    return entrypointArgumentFindings(pair, locate);
  });
  return textFindings(found);
}
