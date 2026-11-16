import type { Finding, Locate } from "./argument-findings.js";
import { type CommandMigration, textFindings } from "./command-migration.js";
import type { ManualStep, WordRename } from "./migration-findings.js";
import { applyTextEdits } from "./text-edits.js";

/**
 * A file that Makefiles include is read by each Makefile that make runs and that includes it,
 * with the values that Makefile gives it: `$(GEN) api.yaml -it` in `mk/gen.mk` runs the
 * generator when the including Makefile sets `GEN` to it. A file make also runs itself is read
 * alone too. An edit is made only where every read makes it; an edit that some reads make and
 * others do not is one manual step per line, naming the Makefiles that read it.
 */

/** What one Makefile that make runs finds in the migrated file, at the file's own offsets. */
export interface FileFindings {
  readonly findings: readonly Finding[];
  /** The function calls the tool does not read, in the file. */
  readonly unread: readonly ManualStep[];
}

/** The findings of one read of the migrated file, and the Makefile that reads it. */
export interface MakefileRead extends FileFindings {
  readonly reader: string;
}

const keyOf = (finding: Finding): string => JSON.stringify(finding);

/** Each value once, by its JSON text, in the order first seen. */
const uniqueByJson = <T>(values: readonly T[]): T[] => [
  ...new Map(values.map((value) => [JSON.stringify(value), value])).values(),
];

/** The edit findings of all reads, split into those every read makes and the others. */
function splitEdits(reads: readonly MakefileRead[]) {
  const counts = new Map<string, { finding: Finding; reads: Set<number> }>();
  reads.forEach((read, index) => {
    for (const finding of read.findings.filter(({ edit }) => edit !== undefined)) {
      const found = counts.get(keyOf(finding)) ?? { finding, reads: new Set() };
      found.reads.add(index);
      counts.set(keyOf(finding), found);
    }
  });
  const all = [...counts.values()];
  const isAgreed = (found: { reads: Set<number> }): boolean => found.reads.size === reads.length;
  return {
    agreed: all.filter(isAgreed).map(({ finding }) => finding),
    disputed: all.filter((found) => !isAgreed(found)).map(({ finding }) => finding),
  };
}

/** One step per line for the edits that not every read makes, with their renames. */
function disputedSteps(disputed: readonly Finding[], context: DisputeContext): Finding[] {
  const byLocation = new Map<string, { offset: number; renames: WordRename[] }>();
  for (const { edit } of disputed) {
    if (edit !== undefined) {
      const location = context.locate(edit.start);
      const found = byLocation.get(location) ?? { offset: edit.start, renames: [] };
      found.renames.push({ from: context.text.slice(edit.start, edit.end), to: edit.text });
      byLocation.set(location, found);
    }
  }
  return [...byLocation].map(([location, { offset, renames }]) => {
    const manualStep: ManualStep = {
      kind: "included-text-differs",
      location,
      readers: context.readers,
      renames: uniqueByJson(renames),
    };
    return { offset, manualStep };
  });
}

interface DisputeContext {
  readonly text: string;
  readonly locate: Locate;
  readonly readers: readonly string[];
}

/** The migration of a Makefile's text from what the Makefiles that read it find there. */
export function agreedMigration(
  text: string,
  reads: readonly MakefileRead[],
  locate: Locate,
): CommandMigration {
  const { agreed, disputed } = splitEdits(reads);
  const others = reads.flatMap(({ findings }) => findings.filter(({ edit }) => !edit));
  const readers = [...new Set(reads.map(({ reader }) => reader))];
  const steps = disputedSteps(disputed, { text, locate, readers });
  const { edits, changes, manualSteps } = textFindings([...agreed, ...others, ...steps]);
  const unread = uniqueByJson(reads.flatMap((read) => read.unread));
  return { text: applyTextEdits(text, edits), changes, manualSteps: [...manualSteps, ...unread] };
}
