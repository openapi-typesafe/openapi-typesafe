import type { Finding, Locate } from "./argument-findings.js";
import { commandLineItemFindings, commandLineItems } from "./command-line-items.js";
import {
  commandWordFindingList,
  type ShellTextFindings,
  textFindings,
} from "./command-migration.js";
import { composeIncludeFindings } from "./compose-includes.js";
import { type ComposeReading, composeServices } from "./compose-services.js";
import { type DocumentString, type DocumentValue, isDocumentString } from "./config-documents.js";
import { containerCommand, entrypointArgumentFindings } from "./entrypoint-arguments.js";
import { inlineCode } from "./inline-code.js";
import type { ContainerUnknown } from "./migration-findings.js";
import { type PlaceReading, sharedPlaceFindings } from "./shared-container-places.js";
import { shellScript } from "./shell-scripts.js";
import { ownCommands, type ShellWord } from "./shell-words.js";
import { unknownContainerFindings } from "./unknown-containers.js";
import { movedWord } from "./word-places.js";
import {
  type Container,
  isItem,
  isList,
  type KeyValue,
  yamlContainers,
} from "./yaml-container-keys.js";

export { isContainerListItem } from "./yaml-container-keys.js";

/**
 * The commands of the containers in YAML files (yaml-container-keys.ts pairs their keys). A list
 * value is exec form, each item one word that no shell splits; a string value is split into
 * words. The container runs one command of the words of both, the entrypoint first (`["npx"]`
 * and then `["openapi-typescript", "-it"]`), read once for its old names and flags and for the
 * command line of `["sh", "-c", "…"]` (entrypoint-arguments.ts). A string whose words are not
 * where the text writes them (an escape), or that holds more than one command, is read where it
 * is written, as other command values are, and the command's flags by the entrypoint rule.
 */

const LINE_BREAK = "\n";

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

/**
 * The first command of a scalar: placed in the text, or all at its start when it cannot be. It is
 * the whole value when the text has no operator of its own: a quoted word that holds a command
 * line (`-o "${{ github.workspace }}/a.ts"`) is one word of it, whose command line the file's
 * own reading reads (yaml-migration.ts).
 */
function scalarWords(scalar: DocumentString, text: string): ValueWords {
  const { start, end } = scalar.content;
  const isPlaced = isPlaceable(scalar, text);
  const read = isPlaced ? text.slice(start, end) : scalar.value;
  const own = ownCommands(read);
  const at = (word: ShellWord): ShellWord =>
    isPlaced ? movedWord(word, start) : { ...word, start: scalar.start, end: scalar.start };
  return { words: (own[0] ?? []).map(at), isPlaced, isWhole: own.length <= 1 };
}

/** The words of a value: each list item, or the first command of a scalar; none for no value. */
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

/** What a container runs: its commands, and the old flags of a script it starts. */
interface ContainerRun {
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
function containerRun(
  { entrypoint, command, unknown }: Container,
  text: string,
  locate: Locate,
): ContainerRun {
  const first = valueWords(entrypoint, text);
  if (command === undefined) {
    // A string alone is read as a command value, unless the container is not known.
    const isRead = isList(entrypoint) || unknown !== undefined;
    return { commands: isRead ? [first.words] : [], flags: [], scalars: [] };
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

/** What one container gives: its findings, the shell scripts it starts, and what it read. */
interface ContainerReading extends PlaceReading {
  readonly scripts: readonly DocumentString[];
  readonly scalars: readonly DocumentString[];
}

function containerReading(container: Container, text: string, locate: Locate): ContainerReading {
  const { commands, flags, scalars } = containerRun(container, text, locate);
  const parts = [
    container.entrypoint,
    ...(container.command === undefined ? [] : [container.command]),
  ];
  const scripts = commands.flatMap((words) => shellScript(words)?.item ?? []);
  const code = new Set(commands.flatMap((words) => inlineCode(words)?.code.start ?? []));
  const isReadOtherwise = (item: DocumentString): boolean =>
    scripts.includes(item) || code.has(item.content.start);
  const items = commandLineItems(parts, isReadOtherwise, locate);
  const { unknown } = container;
  const reading = {
    findings: [
      ...commandWordFindingList(commands, locate),
      ...flags,
      ...(unknown === undefined ? commandLineItemFindings(items, locate) : []),
    ],
    places: parts.flatMap((part) => part.strings),
    isPaired: container.command !== undefined,
    scripts: unknown === undefined ? scripts : [...scripts, ...items],
    scalars,
  };
  return unknown === undefined
    ? reading
    : unknownReading({ unknown, parts, reading }, text, locate);
}

/**
 * The reading of a container whose program is not known: one step for its renames. Its strings
 * are read here only, so the reading of command values elsewhere does not edit them.
 */
function unknownReading(
  { unknown, parts, reading }: UnknownParts,
  text: string,
  locate: Locate,
): ContainerReading {
  const words = parts.flatMap((part) => valueWords(part, text).words);
  // The step names the line of the command, which a service writes itself when it extends one.
  const starts = parts.flatMap((part) => part.strings[0]?.start ?? []);
  const { findings: found, scripts } = reading;
  const run = { unknown, findings: found, words, scripts, start: starts.at(-1) ?? 0 };
  const scalars = parts.filter((part) => !isList(part)).flatMap((part) => part.strings);
  const findings = unknownContainerFindings(run, text, locate);
  return { ...reading, findings, scripts: [], scalars };
}

interface UnknownParts {
  readonly unknown: ContainerUnknown;
  readonly parts: readonly KeyValue[];
  readonly reading: ContainerReading;
}

/** What the commands of the containers in a YAML file give. */
export interface ContainerCommands {
  /** The old names and flags of the commands. */
  readonly findings: readonly ShellTextFindings[];
  /** The items that a shell the commands start reads as command lines (`["sh", "-c", "…"]`). */
  readonly scripts: ReadonlySet<DocumentString>;
  /**
   * The offsets of the string values whose words the commands read: elsewhere only the command
   * lines that their quoted words hold are read.
   */
  readonly commandStrings: ReadonlySet<number>;
}

/** Each string where it is written: the first value at its offset (an alias comes after it). */
function writtenStrings(values: readonly DocumentValue[]): Set<DocumentString> {
  const first = new Map<number, DocumentString>();
  for (const value of values.filter(isDocumentString)) {
    if (!first.has(value.start)) {
      first.set(value.start, value);
    }
  }
  return new Set(first.values());
}

/**
 * The commands of the containers in a YAML file: their findings and their shell scripts. A
 * Compose file (`hasServices`) reads the `extends` of its services and reports the containers
 * that other files complete.
 */
export function containerCommands(
  text: string,
  values: readonly DocumentValue[],
  locate: Locate,
  reading: ComposeReading = {},
): ContainerCommands {
  const hasServices = reading.hasServices === true;
  const services = hasServices ? composeServices(values, reading) : undefined;
  const readings = yamlContainers(values, services).map((found) =>
    containerReading(found, text, locate),
  );
  const written = writtenStrings(values);
  return {
    findings: [
      textFindings([
        ...sharedPlaceFindings(readings, { text, locate, written }),
        ...(hasServices ? composeIncludeFindings(values, reading, locate) : []),
      ]),
    ],
    scripts: new Set(readings.flatMap((reading) => reading.scripts)),
    commandStrings: new Set(readings.flatMap(({ scalars }) => scalars.map(({ start }) => start))),
  };
}
