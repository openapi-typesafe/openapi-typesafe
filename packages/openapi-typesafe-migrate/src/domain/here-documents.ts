import { readWord } from "./shell-word-parts.js";

/**
 * Here-documents (POSIX 2.7.4): the lines after a command line that are the input of a command.
 * Their body is data, so its quotes do not open a word (shell-words.ts reads the commands).
 */

/** `<<WORD`, `<<'WORD'`, `<<-WORD`: a here-document (POSIX 2.7.4); `<<<` is a here-string. */
const HEREDOC_OPERATOR = "<<";
const HERE_STRING_OPERATOR = "<<<";
const STRIP_TABS = "-";
const LINE_BREAK = "\n";
const LEADING_TABS_RE = /^\t+/;
const CARRIAGE_RETURN_RE = /\r$/;

/** A here-document waiting for its body: the lines after the line of its operator. */
export interface PendingHeredoc {
  readonly delimiter: string;
  readonly isTabStripped: boolean;
  /** The index of the command whose input the body is. */
  readonly command: number;
  /** Spaces at the start of each line that the shell does not see (shellCommands). */
  readonly indent: number;
}

/** The body of a here-document, and the command whose input it is. */
export interface HeredocBody {
  readonly command: number;
  readonly start: number;
  readonly text: string;
}

/**
 * The here-document operator at `index` and where its delimiter word ends, or undefined. A
 * here-string operator gives no here-document, and ends where its `<<<` ends.
 */
export function heredocAt(
  text: string,
  index: number,
  where: { readonly command: number; readonly indent: number },
): { pending?: PendingHeredoc; end: number } | undefined {
  if (text.startsWith(HERE_STRING_OPERATOR, index)) {
    return { end: index + HERE_STRING_OPERATOR.length };
  }
  if (!text.startsWith(HEREDOC_OPERATOR, index)) {
    return undefined;
  }
  let start = index + HEREDOC_OPERATOR.length;
  const isTabStripped = text[start] === STRIP_TABS;
  start += isTabStripped ? 1 : 0;
  while (text[start] === " " || text[start] === "\t") {
    start++;
  }
  const word = readWord(text, start);
  // The quotes of the delimiter only turn off expansion in the body; its value ends the body.
  const pending: PendingHeredoc = { delimiter: word.value, isTabStripped, ...where };
  return word.value === "" ? undefined : { pending, end: word.end };
}

/** Whether the line from `lineStart` to `end` is the delimiter line of a here-document. */
function isDelimiterLine(text: string, lineStart: number, end: number, heredoc: PendingHeredoc) {
  let first = lineStart;
  while (first < lineStart + heredoc.indent && text[first] === " ") {
    first++;
  }
  const line = text.slice(first, end).replace(CARRIAGE_RETURN_RE, "");
  const compared = heredoc.isTabStripped ? line.replace(LEADING_TABS_RE, "") : line;
  return compared === heredoc.delimiter;
}

/** The body of one here-document from `start`, and where its delimiter line ends. */
function readBody(text: string, start: number, heredoc: PendingHeredoc) {
  let lineStart = start;
  while (lineStart < text.length) {
    const lineEnd = text.indexOf(LINE_BREAK, lineStart);
    const end = lineEnd === -1 ? text.length : lineEnd;
    if (isDelimiterLine(text, lineStart, end, heredoc)) {
      const body = { command: heredoc.command, start, text: text.slice(start, lineStart) };
      return { body, end: Math.min(end + 1, text.length) };
    }
    lineStart = end + 1;
  }
  // No delimiter line: the body runs to the end of the text, as the shell reads it.
  return { body: { command: heredoc.command, start, text: text.slice(start) }, end: text.length };
}

/** The bodies of the pending here-documents from `start`, one after another, and their end. */
export function readBodies(text: string, start: number, pending: readonly PendingHeredoc[]) {
  const bodies: HeredocBody[] = [];
  let end = start;
  for (const heredoc of pending) {
    const read = readBody(text, end, heredoc);
    bodies.push(read.body);
    end = read.end;
  }
  return { bodies, end };
}
