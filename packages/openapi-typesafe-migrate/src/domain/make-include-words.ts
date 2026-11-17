import type { MakeWord } from "./make-line-text.js";
import { expandedText, type ValueText } from "./make-value-texts.js";
import { hasWildcard, wildcardPaths } from "./make-wildcards.js";
import { projectPathFrom } from "./relative-references.js";

/**
 * The files that an `include` line names, as make finds them: make expands the line's references
 * when it reads the line (make-value-texts.ts), splits the result into words, and expands the
 * wildcards of each word (make-wildcards.ts). A relative path is looked for in the folder make
 * runs in, the folder of the Makefile it was given. A word the tool cannot know (a reference
 * without a known text, a path outside the project) makes the whole line unknown.
 */

/** Where make reads an include line: its folder, the project's files, and the values there. */
export interface IncludePlace {
  readonly folder: string;
  readonly listedPaths: readonly string[];
  /** The values where make reads the line, computed only for a line that references one. */
  readonly valueTexts: () => ValueText;
}

const DOLLAR = "$";
const WORD_SEPARATOR = " ";
/** What make splits an expanded line at: C's `isspace`. */
const SPACES_RE = /[ \t\n\r\v\f]+/;

/** The project paths an include line names, in make's order, or undefined when one is unknown. */
export function includedProjectPaths(
  words: readonly MakeWord[],
  place: IncludePlace,
): string[] | undefined {
  const written = words.map(({ text }) => text).join(WORD_SEPARATOR);
  const expanded = written.includes(DOLLAR) ? expandedText(written, place.valueTexts()) : written;
  const paths = (expanded ?? "")
    .split(SPACES_RE)
    .filter((word) => word !== "")
    .map((word) => projectPathFrom(place.folder, word));
  if (expanded === undefined || paths.some((path) => path === undefined)) {
    return undefined;
  }
  return (paths as string[]).flatMap((path) =>
    hasWildcard(path) ? wildcardPaths(path, place.listedPaths) : [path],
  );
}
