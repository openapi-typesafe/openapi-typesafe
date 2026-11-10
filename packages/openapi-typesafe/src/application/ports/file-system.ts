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
 * another letter case on a case-insensitive file system, and also when the file does not exist
 * yet. The CLI asks before it writes, so that an output path never replaces a file the run reads
 * (`CLI_OUTPUT_IS_INPUT`) nor another API's output (`CLI_OUTPUT_DUPLICATE`).
 */
export interface FileIdentity {
  isSameFile(left: URL, right: URL): boolean;
}

/**
 * Whether a `file:` location is an existing directory. An output there is no file the CLI can
 * write, so it fails with `CLI_OUTPUT_INVALID` before anything is generated.
 */
export interface DirectoryCheck {
  isDirectory(file: URL): boolean;
}

/**
 * Whether a `file:` location is an existing file. A schema argument with a `*` is a glob pattern
 * only when no file has that name.
 */
export interface FileCheck {
  isFile(file: URL): boolean;
}

/**
 * An output file that exists before its content is written: the claim created it, empty, when it
 * was missing, so the file system has given it its own identity.
 */
export interface ClaimedFile {
  /** The file system's identity of the file: equal for two paths that name one file. */
  readonly identity: string;
  /** Remove what the claim created (the file and its new directories); existing ones stay. */
  release(): void;
}

/**
 * Claim output files before writing to them. Names cannot prove that two missing files are two:
 * the file system may ignore Unicode normalization, fold `ß` to `SS`, ignore letter case where
 * nothing can be probed, or follow a link to a directory that does not exist yet. Once each file
 * exists, its identity is the file system's own. Fails with `OUTPUT_WRITE_FAILED`.
 */
export interface FileClaims {
  claimFile(file: URL): ClaimedFile;
}
