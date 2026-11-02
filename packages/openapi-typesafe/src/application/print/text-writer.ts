import type { PrintOptions } from "./print-options.js";

const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const LINE_SEPARATOR = 0x2028;
const PARAGRAPH_SEPARATOR = 0x2029;

/** Line breaks as the TypeScript scanner defines them (`isLineBreak`). */
export function isLineBreak(code: number): boolean {
  return (
    code === LINE_FEED ||
    code === CARRIAGE_RETURN ||
    code === LINE_SEPARATOR ||
    code === PARAGRAPH_SEPARATOR
  );
}

/**
 * Output buffer with indentation, modeled on the TypeScript printer's text writer: `write` indents
 * text that starts a line, `rawWrite` never does, and `writeLine` does nothing at the start of a
 * line. Matching these rules is what makes comment re-indentation byte-identical to the original.
 */
export class TextWriter {
  readonly #options: PrintOptions;
  #output = "";
  #indent = 0;
  #isAtLineStart = true;

  constructor(options: PrintOptions) {
    this.#options = options;
  }

  get indent(): number {
    return this.#indent;
  }

  get options(): PrintOptions {
    return this.#options;
  }

  get text(): string {
    return this.#output;
  }

  increaseIndent(): void {
    this.#indent++;
  }

  decreaseIndent(): void {
    this.#indent--;
  }

  /** Write text, indenting it first when it starts a line. */
  write(text: string): void {
    if (text.length === 0) {
      return;
    }
    const prefix = this.#isAtLineStart ? this.indentString(this.#indent) : "";
    this.rawWrite(prefix + text);
  }

  /** Write text exactly as given. */
  rawWrite(text: string): void {
    this.#output += text;
    this.#updateLineStart(text);
  }

  /** End the current line; does nothing when nothing has been written on it yet. */
  writeLine(): void {
    if (!this.#isAtLineStart) {
      this.rawWrite(this.#options.newLine);
    }
  }

  indentString(level: number): string {
    return " ".repeat(level * this.#options.indentSize);
  }

  // Like TypeScript: any write leaves the writer mid-line unless the text ends with a line break.
  #updateLineStart(text: string): void {
    this.#isAtLineStart = text.length > 0 && isLineBreak(text.charCodeAt(text.length - 1));
  }
}
