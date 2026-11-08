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

/**
 * Whether two `file:` locations name one file: also through a symbolic link, a hard link, or
 * another letter case on a case-insensitive file system. The CLI asks before it writes, so that
 * an output path never replaces the schema it reads (`CLI_OUTPUT_IS_INPUT`).
 */
export interface FileIdentity {
  isSameFile(left: URL, right: URL): boolean;
}
