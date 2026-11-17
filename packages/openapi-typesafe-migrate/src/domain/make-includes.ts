import type { MakefileText } from "./make-file-lines.js";
import { type IncludeValues, includeValues } from "./make-include-values.js";
import { includedProjectPaths } from "./make-include-words.js";
import { makeText } from "./make-line-ends.js";
import { type MakeInclude, readMakeLines } from "./make-lines.js";

/**
 * The files that a Makefile includes (`include tools.mk`, `-include`, `sinclude`). Make reads an
 * included file in place of the directive, so its assignments come between those before and
 * after it. The tool reads a Makefile with the text of each file it includes put after the
 * directive, also of the files those include, as one text; the parts of the Makefile itself
 * keep their offsets through `ownOffset`, and each read of an included file through `readsOf`,
 * so that file is migrated with the values of the Makefile that includes it. The files of a line
 * are found as make finds them (make-include-words.ts): its references expanded with the values
 * of the text before it, its wildcards matched against the project's files. A line with a word
 * the tool cannot know, a path outside the project, or a file the project does not have is not
 * read: such a file may set any variable, so the values after it may come from outside
 * (make-values.ts), and the Makefile reads files the tool does not know (`hasUnreadInclude`).
 */

/** The project files a Makefile can include: their text, and the paths a wildcard matches. */
export interface IncludedFiles {
  readonly includedText: (path: string) => string | undefined;
  readonly listedPaths: readonly string[];
}

const SEPARATOR = "/";
const LINE_BREAK = "\n";
const NOT_LINE_BREAK_RE = /[^\n]/g;
const BLANK = " ";

/** The folder of a project path, `""` for the project folder. */
export const folderOf = (path: string): string =>
  path.split(SEPARATOR).slice(0, -1).join(SEPARATOR);

/** A part of the joined text: from the Makefile itself, or from a file it includes. */
interface TextPart {
  readonly text: string;
  /** Where the part starts in the text of the file it comes from, as make reads that text. */
  readonly originStart: number;
  /** Where an offset of the file's text as make reads it is written in the file. */
  readonly writtenOffset: (offset: number) => number;
  /** The file the part comes from: the Makefile is `""`. */
  readonly origin: string;
  /** Which read of a file the part belongs to: a file included twice is read twice. */
  readonly read: number;
}

/** What splicing the includes of a Makefile builds, in the order make reads it. */
interface SpliceContext {
  readonly folder: string;
  readonly files: IncludedFiles;
  /** The number of included files read so far; the Makefile itself is read 0. */
  readonly reads: { count: number };
  readonly parts: TextPart[];
  readonly joined: JoinedText;
  /** The project paths that the include lines name, read or not. */
  readonly requested: Set<string>;
  readonly unread: { hasInclude: boolean };
  readonly values: IncludeValues;
}

/** The joined text of the parts so far, and where the text of another file starts in it. */
interface JoinedText {
  text: string;
  readonly fileStarts: Set<number>;
}

/** Put a part after the others, in the parts and in their joined text. */
function addPart(context: SpliceContext, part: TextPart): void {
  const { joined, parts } = context;
  if (parts.length > 0 && parts.at(-1)?.origin !== part.origin) {
    joined.fileStarts.add(joined.text.length);
  }
  parts.push(part);
  joined.text += part.text;
}

/** The texts an include line reads, or undefined when one of its files is not read. */
function includedTexts(include: MakeInclude, context: SpliceContext, seen: readonly string[]) {
  const paths = includedProjectPaths(include.paths, {
    folder: context.folder,
    listedPaths: context.files.listedPaths,
    valueTexts: () => context.values(context.joined),
  });
  const found = (paths ?? []).map((path) => {
    context.requested.add(path);
    const text = seen.includes(path) ? undefined : context.files.includedText(path);
    return text === undefined ? undefined : { path, text };
  });
  return paths !== undefined && found.every((one) => one !== undefined) ? found : undefined;
}

/** Put the parts of a text, with its read includes, in `context`; `seen` stops a cycle. */
function spliceParts(written: string, context: SpliceContext, seen: readonly string[]): void {
  const { text, writtenOffset } = makeText(written);
  const origin = seen.at(-1) ?? "";
  const read = seen.length === 0 ? 0 : ++context.reads.count;
  const own = (start: number, end: number, partText = text.slice(start, end)): TextPart => ({
    ...{ text: partText, originStart: start, writtenOffset },
    ...{ origin, read },
  });
  let copiedUpTo = 0;
  for (const include of readMakeLines(text).includes) {
    addPart(context, own(copiedUpTo, include.start));
    copiedUpTo = include.start;
    const files = includedTexts(include, context, seen);
    context.unread.hasInclude ||= files === undefined;
    if (files === undefined) {
      continue;
    }
    const lineEnd = Math.min(include.end + 1, text.length);
    const directive = text.slice(include.start, lineEnd).replace(NOT_LINE_BREAK_RE, BLANK);
    addPart(context, own(include.start, lineEnd, directive));
    for (const file of files) {
      const ended = file.text.endsWith(LINE_BREAK) ? file.text : `${file.text}${LINE_BREAK}`;
      spliceParts(ended, context, [...seen, file.path]);
    }
    copiedUpTo = lineEnd;
  }
  addPart(context, own(copiedUpTo, text.length));
}

/** The offset in one read of a file of an offset of the joined text, or undefined. */
export type OffsetIn = (offset: number) => number | undefined;

/** A Makefile read with the files it includes: the joined text, and where each file's parts are. */
export interface MakefileSource extends MakefileText {
  /** The offset in the Makefile itself of an offset of the joined text, or undefined. */
  readonly ownOffset: OffsetIn;
  /** Each read of the included file at a project path, as the offsets of its text. */
  readonly readsOf: (path: string) => readonly OffsetIn[];
  /** The project paths that the include lines read name, whether the project has them or not. */
  readonly requestedPaths: ReadonlySet<string>;
  /** Whether an include line names a file the tool does not read, or one it cannot know. */
  readonly hasUnreadInclude: boolean;
}

/** Where a part is in the joined text. */
interface Segment {
  readonly start: number;
  readonly end: number;
  readonly part: TextPart;
}

/** The offsets that the segments of one read give, in the text of the file it reads. */
function offsetsOfRead(ofRead: readonly Segment[]): OffsetIn {
  return (at) => {
    const found = ofRead.find(({ start, end }) => start <= at && at < end);
    if (found === undefined) {
      return undefined;
    }
    const { part, start } = found;
    return part.writtenOffset(part.originStart + at - start);
  };
}

/** The segments of each read, by the file it reads, in the order of the joined text. */
function segmentsByRead(segments: readonly Segment[]) {
  const byOrigin = new Map<string, Map<number, Segment[]>>();
  for (const segment of segments) {
    const { origin, read } = segment.part;
    const reads = byOrigin.get(origin) ?? new Map<number, Segment[]>();
    const ofRead = reads.get(read) ?? [];
    ofRead.push(segment);
    byOrigin.set(origin, reads.set(read, ofRead));
  }
  return byOrigin;
}

/**
 * A Makefile at the project path `file` with the files it includes put in. Make looks for a
 * relative path in `folder`, where it runs: the Makefile's folder, for nested includes too.
 */
export function withIncludedFiles(
  text: string,
  file: string,
  files: IncludedFiles,
  folder = folderOf(file),
): MakefileSource {
  const context: SpliceContext = {
    ...{
      folder,
      files,
      reads: { count: 0 },
      parts: [],
      joined: { text: "", fileStarts: new Set() },
    },
    ...{ requested: new Set(), unread: { hasInclude: false }, values: includeValues() },
  };
  spliceParts(text, context, []);
  const { parts } = context;
  const segments: Segment[] = [];
  let offset = 0;
  for (const part of parts) {
    segments.push({ start: offset, end: offset + part.text.length, part });
    offset += part.text.length;
  }
  const byOrigin = segmentsByRead(segments);
  const readsOf = (origin: string) => [...(byOrigin.get(origin)?.values() ?? [])];
  return {
    ...context.joined,
    ownOffset: offsetsOfRead(readsOf("").flat()),
    readsOf: (path) => readsOf(path).map(offsetsOfRead),
    requestedPaths: context.requested,
    hasUnreadInclude: context.unread.hasInclude,
  };
}
