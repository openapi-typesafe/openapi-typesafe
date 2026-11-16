import type { CommandMigration } from "./command-migration.js";
import { type CalledMakefiles, NO_CALLED_MAKEFILES } from "./make-calls.js";
import { type JoinedMakefile, joinedMakefile, placeFindings } from "./makefile-reading.js";
import { agreedMigration, type MakefileRead } from "./makefile-reads.js";
import { lineLocator } from "./migration-findings.js";

/**
 * The migration of the Makefiles of a project (makefile-reading.ts reads one). A file that
 * Makefiles include is read in each Makefile that make runs and that includes it
 * (makefile-reads.ts); each such Makefile is read once for all the files it includes, so a
 * Makefile with hundreds of includes is not read again for each of them.
 */

/** Migrates the Makefiles of one project. */
export interface MakefileMigrator {
  migrate(text: string, file: string): CommandMigration;
}

/** Where the reads of one migrated file come from. */
interface ReadsContext {
  readonly called: CalledMakefiles;
  /** The Makefile at a project path read with its includes, or undefined for none. */
  readonly joinedOf: (path: string) => JoinedMakefile | undefined;
  readonly lineOf: (offset: number) => number;
}

/** The reads of the file at `file` in the Makefile `reader` that includes it. */
function readsBy(reader: string, file: string, context: ReadsContext): MakefileRead[] {
  const joined = context.joinedOf(reader);
  if (joined === undefined) {
    return [];
  }
  return joined.source.readsOf(file).map((offsetIn) => ({
    reader,
    ...placeFindings(joined, { offsetIn, file, lineOf: context.lineOf }),
  }));
}

/**
 * What each Makefile that make runs finds in the file at `file`: each read of it in the
 * Makefiles that include it, and the file read alone when make runs it or nothing includes it.
 */
function readsOfFile(text: string, file: string, context: ReadsContext): MakefileRead[] {
  const readers = context.called.readersOf(file);
  const reads = readers
    .filter((reader) => reader !== file)
    .flatMap((reader) => readsBy(reader, file, context));
  if (reads.length > 0 && !readers.includes(file)) {
    return reads;
  }
  const isPlanned = context.called.includedText(file) === text;
  const joined =
    (isPlanned ? context.joinedOf(file) : undefined) ?? joinedMakefile(text, file, context.called);
  const place = { offsetIn: joined.source.ownOffset, file, lineOf: context.lineOf };
  return [{ reader: file, ...placeFindings(joined, place) }, ...reads];
}

/** The Makefile migration of a project whose Makefiles `called` gives. */
export function makefileMigrator(called: CalledMakefiles): MakefileMigrator {
  const joined = new Map<string, JoinedMakefile | undefined>();
  const joinedOf = (path: string): JoinedMakefile | undefined => {
    if (!joined.has(path)) {
      const text = called.includedText(path);
      joined.set(path, text === undefined ? undefined : joinedMakefile(text, path, called));
    }
    return joined.get(path);
  };
  return {
    migrate: (text, file) => {
      const lineOf = lineLocator(text);
      const reads = readsOfFile(text, file, { called, joinedOf, lineOf });
      return agreedMigration(text, reads, (offset) => `${file}:${lineOf(offset)}`);
    },
  };
}

/** Migrate one Makefile; each finding names its `file:line`. */
export const migrateMakefile = (
  text: string,
  file: string,
  called: CalledMakefiles = NO_CALLED_MAKEFILES,
): CommandMigration => makefileMigrator(called).migrate(text, file);
