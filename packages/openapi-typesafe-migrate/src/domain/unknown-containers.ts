import type { Finding, Locate } from "./argument-findings.js";
import { commandLineRenames } from "./command-line-items.js";
import type { DocumentString } from "./config-documents.js";
import type { ContainerUnknown, ManualStep, WordRename } from "./migration-findings.js";
import { FLAG_RENAMES } from "./package-names.js";
import { renamesOf } from "./shared-container-places.js";
import type { ShellWord } from "./shell-words.js";

/**
 * A container whose program the file does not name is not edited: the image's own program runs
 * `args` alone, and another Compose file may set the entrypoint or command of a service. Its
 * renames, as the tool reads the container as written, become one manual step. Where another
 * file may give the entrypoint, the old flags of the generator in the container are named too:
 * that entrypoint may be the generator.
 */

/** What an unknown container was read as, with the program it names. */
export interface UnknownContainerRun {
  readonly unknown: ContainerUnknown;
  readonly findings: readonly Finding[];
  readonly words: readonly ShellWord[];
  /**
   * The shell scripts it would start (`["sh", "-c", "…"]`) and its items that hold a command line
   * (command-line-items.ts), read for their renames.
   */
  readonly scripts: readonly DocumentString[];
  /** The offset of the container's first string, where the step is reported. */
  readonly start: number;
}

/** The old flags of the generator among the words, each with its new name. */
const flagRenames = (words: readonly ShellWord[]): WordRename[] =>
  words.flatMap(({ value }) => {
    const to = FLAG_RENAMES.get(value);
    return to === undefined ? [] : [{ from: value, to }];
  });

/** The step of an unknown container, or none when reading it renames nothing. */
export function unknownContainerFindings(
  run: UnknownContainerRun,
  text: string,
  locate: Locate,
): Finding[] {
  const found = [
    ...renamesOf(run.findings, text),
    ...run.scripts.flatMap((script) => commandLineRenames(script, locate)),
    ...(run.unknown === "other-file" ? flagRenames(run.words) : []),
  ];
  const renames = [...new Map(found.map((rename) => [JSON.stringify(rename), rename])).values()];
  if (renames.length === 0) {
    return [];
  }
  const location = locate(run.start);
  const { unknown } = run;
  const manualStep: ManualStep = { kind: "container-not-known", location, unknown, renames };
  return [{ offset: run.start, manualStep }];
}
