import path from "node:path";

/**
 * The identity of a file path, also of one that does not exist yet (an output before the first
 * run). Two paths are one file when their keys are equal: the real path of the nearest existing
 * ancestor (links resolved, letter case as stored on disk) followed by the segments that do not
 * exist yet, compared in the letter case rules of the file system that will hold them. Equal keys
 * prove one file; different keys do not prove two (Unicode normalization, full case folding):
 * the CLI claims every output before writing to decide those (ADR-043, decision 1).
 */

/** A device and a file number: one file, also through a hard link. */
export interface FileNumber {
  readonly device: bigint;
  readonly file: bigint;
}

/** The file-system queries the identity needs; Node's `fs` in production, a fake in tests. */
export interface PathQueries {
  /** The file number of a path, following links; undefined when it cannot be read. */
  status(filePath: string): FileNumber | undefined;
  /** The path with every link resolved, in the letter case stored on disk. */
  realPath(filePath: string): string;
  /** The names in a directory; empty when it cannot be listed. */
  entries(directory: string): readonly string[];
  /** The target of a symbolic link as written in it; undefined for a path that is no link. */
  linkTarget(filePath: string): string | undefined;
}

/**
 * The most links followed for one path. Linux follows at most 40 (MAXSYMLINKS) and macOS 32
 * before it fails with ELOOP; a longer chain is a loop, and the path is taken as missing.
 */
const MAX_LINK_HOPS = 40;

/** Whether two file numbers name one file. */
export function isSameFileNumber(left: FileNumber, right: FileNumber): boolean {
  // Some file systems (FAT, some network shares) report no file number: 0 then proves nothing.
  return left.file !== 0n && left.file === right.file && left.device === right.device;
}

function hasLetters(text: string): boolean {
  return text.toLowerCase() !== text.toUpperCase();
}

function flipCase(text: string): string {
  return [...text]
    .map((character) => {
      const upper = character.toUpperCase();
      return character === upper ? character.toLowerCase() : upper;
    })
    .join("");
}

/** Whether a directory entry is also found under its name in the other letter case. */
function isFoundInOtherCase(entryPath: string, queries: PathQueries): boolean | undefined {
  const status = queries.status(entryPath);
  if (!status) {
    return undefined;
  }
  const flipped = path.join(path.dirname(entryPath), flipCase(path.basename(entryPath)));
  const flippedStatus = queries.status(flipped);
  return flippedStatus !== undefined && isSameFileNumber(status, flippedStatus);
}

/**
 * Whether new names in `directory` ignore letter case. It is asked of the file system, not
 * assumed from the OS: macOS and Windows volumes can be case-sensitive, and Linux mounts can
 * ignore case. An entry of the directory is looked up in the other case; without one with
 * letters, the directory itself is. With nothing to look up, names are taken as case-sensitive.
 */
function ignoresCase(directory: string, queries: PathQueries): boolean {
  const candidates = [
    ...queries
      .entries(directory)
      .filter(hasLetters)
      .map((name) => path.join(directory, name)),
    ...(hasLetters(path.basename(directory)) ? [directory] : []),
  ];
  for (const candidate of candidates) {
    const answer = isFoundInOtherCase(candidate, queries);
    if (answer !== undefined) {
      return answer;
    }
  }
  return false;
}

/**
 * The nearest ancestor of `filePath` that exists (or the path itself), and the rest below it. A
 * link to a missing file or directory is followed to its target, which a write would create: so
 * `link/x.ts` with `link -> missing` is `missing/x.ts`. A relative target is read from the real
 * directory of the link, as the system does: with `a -> real/sub` and
 * `real/sub/link -> ../missing`, `a/link` is `real/missing`, not `missing`.
 */
function nearestExisting(filePath: string, queries: PathQueries): [string, string[]] {
  const missing: string[] = [];
  let current = path.resolve(filePath);
  let hops = 0;
  while (queries.status(current) === undefined) {
    const target = hops < MAX_LINK_HOPS ? queries.linkTarget(current) : undefined;
    if (target !== undefined) {
      current = path.resolve(queries.realPath(path.dirname(current)), target);
      hops += 1;
      continue;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    missing.unshift(path.basename(current));
    current = parent;
  }
  return [current, missing];
}

/**
 * The path that a write to `filePath` creates, with links followed also where their target is
 * missing: `link/x.ts` with `link -> missing` is the real path of `missing/x.ts`. `mkdir` does not
 * follow a link to a missing directory on Linux and Windows, so the directories are created here.
 */
export function creationPath(filePath: string, queries: PathQueries): string {
  const [existing, missing] = nearestExisting(filePath, queries);
  return path.join(queries.realPath(existing), ...missing);
}

/** The key of a path: equal keys are one file, whether or not it exists yet. */
export function fileIdentityKey(filePath: string, queries: PathQueries): string {
  const [existing, missing] = nearestExisting(filePath, queries);
  const realExisting = queries.realPath(existing);
  if (missing.length === 0) {
    return realExisting;
  }
  const isCaseIgnored = ignoresCase(realExisting, queries);
  const rest = isCaseIgnored ? missing.map((segment) => segment.toLowerCase()) : missing;
  return path.join(realExisting, ...rest);
}
