/**
 * The line ends of a Makefile as GNU make reads them. Make's `readline` (read.c) drops the CR of
 * a line that ends with CR LF on every system, so a file written with Windows line ends reads as
 * one with LF: `include tools.mk` names `tools.mk`, a recipe's last word is `-it`, and a
 * backslash before CR LF continues the line. The tool reads the text without those CRs and puts
 * every offset it finds back where the file writes it, so edits keep the file's line ends.
 */

const CRLF_RE = /\r\n/g;
const LINE_BREAK = "\n";

/** A Makefile's text as make reads it, and where each of its offsets is written in the file. */
export interface MakeText {
  readonly text: string;
  readonly writtenOffset: (offset: number) => number;
}

/** How many of the sorted `offsets` are at or before `offset`. */
function countUpTo(offsets: readonly number[], offset: number): number {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if ((offsets[middle] as number) <= offset) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

/** The text of a Makefile without the CR of each CR LF line end. */
export function makeText(written: string): MakeText {
  // The offset in `text` of each line break whose CR was dropped, in order.
  const breaks: number[] = [];
  const text = written.replace(CRLF_RE, (_, at: number) => {
    breaks.push(at - breaks.length);
    return LINE_BREAK;
  });
  return { text, writtenOffset: (offset) => offset + countUpTo(breaks, offset) };
}
