import type { Finding, Locate } from "./argument-findings.js";
import { shellTextFindings } from "./command-migration.js";
import type { DocumentString } from "./config-documents.js";
import type { ManualStep, WordRename } from "./migration-findings.js";
import { renamesOf } from "./shared-container-places.js";
import { shellCommands } from "./shell-words.js";
import { isList, type KeyValue } from "./yaml-container-keys.js";

/**
 * An item of an exec-form list is one word that no shell splits: `args: ["npx openapi-typescript
 * api.yaml -it"]` gives the program one argument, which is a command line only where a shell
 * reads it (the image's program, or `sh -c` before it). The tool cannot tell, so an item of
 * several words that runs the generator as a command line is kept and reported with the renames
 * that reading it so gives. An item that a shell of the container reads (`["sh", "-c", "…"]`)
 * is a script, which is read as commands, and the code of an interpreter (`["node", "-e", "…"]`)
 * is no command line.
 */

/** The renames that reading a string's value as shell commands gives. */
export function commandLineRenames(string: DocumentString, locate: Locate): WordRename[] {
  const { edits } = shellTextFindings(string.value, locate);
  return renamesOf(
    edits.map((edit) => ({ offset: edit.start, edit })),
    string.value,
  );
}

/**
 * Whether an item's first command has more than one word: a single word is read as the word it
 * is, and code (`require('…')`) is no command of words.
 */
const holdsSeveralWords = (item: DocumentString): boolean =>
  (shellCommands(item.value)[0]?.length ?? 0) > 1;

/**
 * The list items of a container's parts that hold a command line of the generator;
 * `isReadOtherwise` tells the items that the container's commands read as a script or as code.
 */
export function commandLineItems(
  parts: readonly KeyValue[],
  isReadOtherwise: (item: DocumentString) => boolean,
  locate: Locate,
): DocumentString[] {
  return parts
    .filter(isList)
    .flatMap((part) => part.strings)
    .filter((item) => !isReadOtherwise(item) && holdsSeveralWords(item))
    .filter((item) => commandLineRenames(item, locate).length > 0);
}

/** One step for each item that holds a command line of the generator. */
export const commandLineItemFindings = (
  items: readonly DocumentString[],
  locate: Locate,
): Finding[] =>
  items.map((item) => {
    const location = locate(item.start);
    const renames = commandLineRenames(item, locate);
    const manualStep: ManualStep = { kind: "command-line-in-item", location, renames };
    return { offset: item.start, manualStep };
  });
