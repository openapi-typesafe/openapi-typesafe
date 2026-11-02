/** Read a generated file, for `--check` (ENGINEERING_PLAN 4.5). Fails with `OUTPUT_READ_FAILED`. */
export interface FileReader {
  readText(file: URL): string;
}

/**
 * Write a generated file, creating its directory first (ENGINEERING_PLAN 4.5). Fails with
 * `OUTPUT_WRITE_FAILED`.
 */
export interface FileWriter {
  writeText(file: URL, contents: string): void;
}
