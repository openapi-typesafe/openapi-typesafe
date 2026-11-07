import type { SourceStringScanner } from "../../src/application/ports.js";
import type { SourceString } from "../../src/domain/source-migration.js";

const QUOTED_RE = /(["'`])([^"'`\n]*)\1/g;

/**
 * A scanner without a parser: every quoted string on a line is a module specifier. Enough for
 * tests of the layers above the scanner; the parser adapter has its own tests.
 */
export class QuotedStringScanner implements SourceStringScanner {
  scan(text: string): SourceString[] {
    return [...text.matchAll(QUOTED_RE)].map((match) => {
      const value = match[2] as string;
      const start = match.index + 1;
      return { start, end: start + value.length, value, isModuleSpecifier: true };
    });
  }
}
