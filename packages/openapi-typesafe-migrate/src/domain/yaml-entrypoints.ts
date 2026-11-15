import type { Finding, Locate } from "./argument-findings.js";
import { commandWordFindings, type ShellTextFindings, textFindings } from "./command-migration.js";
import { type DocumentString, ownerKey } from "./config-documents.js";
import { containerCommand, entrypointArgumentFindings } from "./entrypoint-arguments.js";
import { shellScript } from "./shell-scripts.js";
import { type ShellWord, shellCommands } from "./shell-words.js";
import { movedWord } from "./word-places.js";

/**
 * The commands of containers in YAML files, the one place that builds them: Compose, GitLab and
 * CircleCI images append `command` to `entrypoint`, Kubernetes appends `args` to `command`, and a
 * GitHub Docker action (`runs`, or the `with` of a `docker://` step) `args` to `entrypoint`, the
 * keys in one map, also through a merge key (`<<: *gen`). A list value is exec form, each item
 * one word that no shell splits; a string value is split into words. The container runs one
 * command of the words of both, the entrypoint first (`["npx"]` and then `["openapi-typescript",
 * "-it"]`), read once for its old names and flags and for the command line of `["sh", "-c", "…"]`
 * (entrypoint-arguments.ts). A string whose words are not where the text writes them (an escape)
 * is read where it is written, as other command values are, and the command's flags by the
 * entrypoint rule.
 */

/** The key of an entrypoint, and the keys of its arguments in the same map, the first one used. */
const ARGUMENT_KEYS: ReadonlyMap<string, readonly string[]> = new Map([
  ["entrypoint", ["command", "args"]],
  ["command", ["args"]],
]);
const PAIRED_KEYS: ReadonlySet<string> = new Set([
  ...ARGUMENT_KEYS.keys(),
  ...[...ARGUMENT_KEYS.values()].flat(),
]);
/** The key of a YAML merge: its alias or list of aliases adds the entries of their maps. */
const MERGE_KEY = "<<";
const LINE_BREAK = "\n";

/** One value of a paired key: its strings (one scalar, or the items of one list). */
interface KeyValue {
  readonly map: string;
  readonly key: string;
  readonly strings: DocumentString[];
  /** Whether a merge key gives the value, which a key of the map itself overrides. */
  readonly isMerged: boolean;
}

const isItem = (string: DocumentString): boolean => typeof string.path.at(-1) === "number";

/** Whether a value is an item of a container's list, which the container commands read. */
export const isContainerListItem = (string: DocumentString): boolean =>
  isItem(string) && PAIRED_KEYS.has(String(string.path.at(-2)));

const isList = (value: KeyValue): boolean =>
  value.strings[0] !== undefined && isItem(value.strings[0]);

/**
 * The map that holds a value, as text: a value that a merge key gives (`<<: *gen`, `<<: [*a,
 * *b]`) belongs to the map that merges it.
 */
function mapOf(string: DocumentString): { readonly map: string; readonly isMerged: boolean } {
  const path = string.path.slice(0, isItem(string) ? -2 : -1);
  let isMerged = false;
  for (;;) {
    if (path.at(-1) === MERGE_KEY) {
      path.pop();
    } else if (typeof path.at(-1) === "number" && path.at(-2) === MERGE_KEY) {
      path.splice(-2);
    } else {
      return { map: JSON.stringify(path), isMerged };
    }
    isMerged = true;
  }
}

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
 * The values of the paired keys, in the order of the text, also where an alias gives them again.
 * A stream of documents repeats a path, so a scalar, or a list item whose index does not grow,
 * starts another value.
 */
function keyValues(strings: readonly DocumentString[]): KeyValue[] {
  const values: KeyValue[] = [];
  for (const string of strings) {
    const key = ownerKey(string.path) ?? "";
    const isValue = isItem(string) ? string.path.at(-2) === key : string.path.at(-1) === key;
    if (!PAIRED_KEYS.has(key) || !isValue) {
      continue;
    }
    const last = values.at(-1);
    if (last !== undefined && isNextItem(last, string)) {
      last.strings.push(string);
    } else {
      values.push({ ...mapOf(string), key, strings: [string] });
    }
  }
  return values;
}

/** The paired values of one map: its own, and those its merge keys give. */
interface MapValues {
  readonly own: Map<string, KeyValue>;
  readonly merged: Map<string, KeyValue>;
}

/**
 * The paired values of each map. A key of its own that the map already has starts another map at
 * the same path, a document of the stream; the first merge that gives a key gives it.
 */
function mapValues(values: readonly KeyValue[]): MapValues[] {
  const maps: MapValues[] = [];
  const latest = new Map<string, MapValues>();
  for (const value of values) {
    let map = latest.get(value.map);
    if (map === undefined || (!value.isMerged && map.own.has(value.key))) {
      map = { own: new Map(), merged: new Map() };
      maps.push(map);
      latest.set(value.map, map);
    }
    const values = value.isMerged ? map.merged : map.own;
    if (!values.has(value.key)) {
      values.set(value.key, value);
    }
  }
  return maps;
}

/** One container: its entrypoint (or its only part) and the command it gets as arguments. */
interface Container {
  readonly entrypoint: KeyValue;
  readonly command: KeyValue | undefined;
}

/** The container of a map: the value of each key that the map's own keys do not override. */
function containerOf({ own, merged }: MapValues): Container[] {
  const keyValue = (key: string): KeyValue | undefined => own.get(key) ?? merged.get(key);
  for (const [key, argumentKeys] of ARGUMENT_KEYS) {
    const entrypoint = keyValue(key);
    if (entrypoint !== undefined) {
      const argumentKey = argumentKeys.find((found) => keyValue(found) !== undefined);
      return [
        { entrypoint, command: argumentKey === undefined ? undefined : keyValue(argumentKey) },
      ];
    }
  }
  // A value that only adds to a command (`args` alone) runs the image's own program.
  return [];
}

/** Whether a scalar's text as written is its value, so its words can be edited in place. */
const isPlaceable = (string: DocumentString, text: string): boolean =>
  !string.isEscaped &&
  !(string.isFolded && text.slice(string.content.start, string.content.end).includes(LINE_BREAK));

/** A word of a container's command, with the list item that holds it when it is one. */
interface ContainerWord extends ShellWord {
  readonly item?: DocumentString;
}

/**
 * The words of a value, whether they are placed where they are written, and whether they are all
 * the words of the value (a string of one command).
 */
interface ValueWords {
  readonly words: readonly ContainerWord[];
  readonly isPlaced: boolean;
  readonly isWhole: boolean;
}

/** The first command of a scalar: placed in the text, or all at its start when it cannot be. */
function scalarWords(scalar: DocumentString, text: string): ValueWords {
  const { start, end } = scalar.content;
  const isPlaced = isPlaceable(scalar, text);
  const commands = shellCommands(isPlaced ? text.slice(start, end) : scalar.value);
  const at = (word: ShellWord): ShellWord =>
    isPlaced ? movedWord(word, start) : { ...word, start: scalar.start, end: scalar.start };
  return { words: (commands[0] ?? []).map(at), isPlaced, isWhole: commands.length <= 1 };
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
  return { words, isPlaced: true, isWhole: true };
}

/** What a container gives: the commands it runs, and the old flags of a script it starts. */
interface ContainerReading {
  readonly commands: readonly (readonly ContainerWord[])[];
  readonly flags: readonly Finding[];
  /** The scalars read in the commands, which are no command values of their own. */
  readonly scalars: readonly DocumentString[];
}

/** A value whose words are all placed in the text, so a command of them can be edited. */
const isJoinable = (words: ValueWords): boolean => words.isPlaced && words.isWhole;

/**
 * What a container runs. An entrypoint and a command whose words are placed make one command,
 * and the old flags after a script that may pass them on are reported. Otherwise a list part is
 * read on its own and a string where it is written, and the flags of the command by the
 * entrypoint rule; a command whose text is not its value as written is reported, not edited.
 */
function containerReading(
  { entrypoint, command }: Container,
  text: string,
  locate: Locate,
): ContainerReading {
  const first = valueWords(entrypoint, text);
  if (command === undefined) {
    return { commands: isList(entrypoint) ? [first.words] : [], flags: [], scalars: [] };
  }
  const args = valueWords(command, text);
  const pair = { entrypoint: first.words, command: args.words, written: entrypoint.key };
  if (isJoinable(first) && isJoinable(args)) {
    const isScript = shellScript(first.words) !== undefined;
    return {
      commands: containerCommand(first.words, args.words),
      flags: isScript ? entrypointArgumentFindings(pair, locate) : [],
      scalars: [entrypoint, command]
        .filter((part) => !isList(part))
        .flatMap((part) => part.strings),
    };
  }
  const lists = [entrypoint, command].filter(isList).map((part) => valueWords(part, text).words);
  const flags = entrypointArgumentFindings({ ...pair, isPlaced: args.isPlaced }, locate);
  return { commands: lists, flags, scalars: [] };
}

/** What the commands of the containers in a YAML file give. */
export interface ContainerCommands {
  /** The old names and flags of the commands. */
  readonly findings: readonly ShellTextFindings[];
  /** The items that a shell the commands start reads as command lines (`["sh", "-c", "…"]`). */
  readonly scripts: ReadonlySet<DocumentString>;
  /** The offsets of the string values that the commands read, which are read nowhere else. */
  readonly commandStrings: ReadonlySet<number>;
}

/** The commands of the containers in a YAML file: their findings and their shell scripts. */
export function containerCommands(
  text: string,
  strings: readonly DocumentString[],
  locate: Locate,
): ContainerCommands {
  const found = mapValues(keyValues(strings))
    .flatMap(containerOf)
    .map((container) => containerReading(container, text, locate));
  const commands = found.flatMap((reading) => reading.commands);
  const scripts = commands.flatMap((words) => shellScript(words)?.item ?? []);
  const flags = found.flatMap((reading) => reading.flags);
  return {
    findings: [commandWordFindings(commands, locate), textFindings(flags)],
    scripts: new Set(scripts),
    commandStrings: new Set(found.flatMap((reading) => reading.scalars.map(({ start }) => start))),
  };
}
