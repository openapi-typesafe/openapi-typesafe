/**
 * Formatting rules of the printer as data (ENGINEERING_PLAN §4.3). The defaults reproduce the
 * TypeScript printer that the original generator used: 4-space indentation and LF line endings.
 */
export interface PrintOptions {
  /** Columns per indentation level; also the tab width used when re-indenting comment lines. */
  readonly indentSize: number;
  readonly newLine: string;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = { indentSize: 4, newLine: "\n" };
