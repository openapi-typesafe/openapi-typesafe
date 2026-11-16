import { type MakeInclude, readMakeLines } from "./make-lines.js";
import { projectPathFrom } from "./relative-references.js";

/**
 * The files that a Makefile includes (`include tools.mk`, `-include`, `sinclude`). Make reads an
 * included file in place of the directive, so its assignments come between those before and
 * after it. The tool reads a Makefile with the text of each file it includes put after the
 * directive, also of the files those include, as one text; the parts of the Makefile itself
 * keep their offsets through `ownOffset`, and each read of an included file through `readsOf`,
 * so that file is migrated with the values of the Makefile that includes it. Make looks for a
 * relative path in the folder it runs in, the folder of the Makefile it was given, for nested
 * includes too. A path with a reference
 * or a wildcard, outside the project, or of a file the project does not have is not read: such
 * a file may set any variable, so the values after it may come from outside (make-values.ts).
 */

/** The text of the project files a Makefile can include. */
export interface IncludedFiles {
  readonly includedText: (path: string) => string | undefined;
}

const SEPARATOR = "/";
const LINE_BREAK = "\n";
/** A reference or a wildcard: make expands it to paths the tool does not know. */
const COMPUTED_PATH_RE = /[$*?[\]]/;
const NOT_LINE_BREAK_RE = /[^\n]/g;
const BLANK = " ";

/** The folder of a project path, `""` for the project folder. */
export const folderOf = (path: string): string =>
  path.split(SEPARATOR).slice(0, -1).join(SEPARATOR);

/** The project path that an included path names from `folder`, or undefined. */
function includedPath(folder: string, written: string): string | undefined {
  return COMPUTED_PATH_RE.test(written) ? undefined : projectPathFrom(folder, written);
}

/** The project paths that the `include` lines of a text name, from the folder make runs in. */
export const includedPaths = (text: string, folder: string): string[] =>
  readMakeLines(text).includes.flatMap(({ paths }) =>
    paths.flatMap(({ text: written }) => includedPath(folder, written) ?? []),
  );

/** A part of the joined text: from the Makefile itself, or from a file it includes. */
interface TextPart {
  readonly text: string;
  /** Where the part starts in the text of the file it comes from. */
  readonly originStart: number;
  /** The file the part comes from: the Makefile is `""`. */
  readonly origin: string;
  /** Which read of a file the part belongs to: a file included twice is read twice. */
  readonly read: number;
}

interface SpliceContext {
  readonly folder: string;
  readonly files: IncludedFiles;
  /** The number of included files read so far; the Makefile itself is read 0. */
  readonly reads: { count: number };
}

/** The texts an include line reads, or undefined when one of its files is not read. */
function includedTexts(include: MakeInclude, context: SpliceContext, seen: readonly string[]) {
  const found = include.paths.map(({ text: written }) => {
    const path = includedPath(context.folder, written);
    const text =
      path === undefined || seen.includes(path) ? undefined : context.files.includedText(path);
    return text === undefined ? undefined : { path: path as string, text };
  });
  return found.every((one) => one !== undefined) ? found : undefined;
}

/** The parts of a text with its read includes put in; `seen` stops a file including itself. */
function splicedParts(text: string, context: SpliceContext, seen: readonly string[]): TextPart[] {
  const origin = seen.at(-1) ?? "";
  const read = seen.length === 0 ? 0 : ++context.reads.count;
  const own = (start: number, end: number, written = text.slice(start, end)): TextPart => ({
    text: written,
    originStart: start,
    origin,
    read,
  });
  const parts: TextPart[] = [];
  let copiedUpTo = 0;
  for (const include of readMakeLines(text).includes) {
    const files = includedTexts(include, context, seen);
    if (files === undefined) {
      continue;
    }
    const lineEnd = Math.min(include.end + 1, text.length);
    const directive = text.slice(include.start, lineEnd).replace(NOT_LINE_BREAK_RE, BLANK);
    parts.push(own(copiedUpTo, include.start), own(include.start, lineEnd, directive));
    for (const file of files) {
      const ended = file.text.endsWith(LINE_BREAK) ? file.text : `${file.text}${LINE_BREAK}`;
      parts.push(...splicedParts(ended, context, [...seen, file.path]));
    }
    copiedUpTo = lineEnd;
  }
  return [...parts, own(copiedUpTo, text.length)];
}

/** The offset in one read of a file of an offset of the joined text, or undefined. */
export type OffsetIn = (offset: number) => number | undefined;

/** A Makefile read with the files it includes: the joined text, and where each file's parts are. */
export interface MakefileSource {
  readonly text: string;
  /** Where the text of another file starts, or the Makefile's own text goes on. */
  readonly fileStarts: ReadonlySet<number>;
  /** The offset in the Makefile itself of an offset of the joined text, or undefined. */
  readonly ownOffset: OffsetIn;
  /** Each read of the included file at a project path, as the offsets of its text. */
  readonly readsOf: (path: string) => readonly OffsetIn[];
}

/** Where a part is in the joined text. */
interface Segment {
  readonly start: number;
  readonly end: number;
  readonly part: TextPart;
}

/** The offsets that the segments of one read give, in the text of the file it reads. */
function offsetsOfRead(segments: readonly Segment[], read: number): OffsetIn {
  const ofRead = segments.filter(({ part }) => part.read === read);
  return (at) => {
    const found = ofRead.find(({ start, end }) => start <= at && at < end);
    return found === undefined ? undefined : found.part.originStart + at - found.start;
  };
}

/** The reads of the file at `path` among the segments, each as its offsets. */
function readsOf(segments: readonly Segment[], path: string): OffsetIn[] {
  const reads = new Set(segments.flatMap(({ part }) => (part.origin === path ? [part.read] : [])));
  return [...reads].map((read) => offsetsOfRead(segments, read));
}

/** A Makefile at the project path `file` with the files it includes put in. */
export function withIncludedFiles(
  text: string,
  file: string,
  files: IncludedFiles,
): MakefileSource {
  const parts = splicedParts(text, { folder: folderOf(file), files, reads: { count: 0 } }, []);
  const fileStarts = new Set<number>();
  const segments: Segment[] = [];
  let offset = 0;
  parts.forEach((part, index) => {
    if (index > 0 && parts[index - 1]?.origin !== part.origin) {
      fileStarts.add(offset);
    }
    segments.push({ start: offset, end: offset + part.text.length, part });
    offset += part.text.length;
  });
  return {
    text: parts.map((part) => part.text).join(""),
    fileStarts,
    ownOffset: offsetsOfRead(segments, 0),
    readsOf: (path) => readsOf(segments, path),
  };
}
