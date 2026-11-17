import { namesOriginalPackage } from "../domain/package-names.js";
import type { ProjectMakefiles } from "./called-makefiles.js";
import type { ProjectFiles } from "./ports.js";

/**
 * Files that make or Compose read as one: a Makefile and the files it includes, however deep,
 * and the Compose files that may merge (a folder's files, an include and the file it names, a
 * service's `extends` and the file it names). A file that names no old package is still read
 * when a file linked to it does, through any chain of links: the flags in `$(GEN) api.yaml -it`
 * are the generator's when an included file sets `GEN`, and a Compose override's `command` runs
 * with the base file's entrypoint. Each file is still changed only where its own text is known
 * to run the generator; elsewhere a manual step names it.
 */

/** Two project files that one make or Compose run reads together. */
export type FileLink = readonly [string, string];

/** The links between a Makefile that make runs and each file it includes. */
export const makefileLinks = (makefiles: ProjectMakefiles): FileLink[] =>
  [...makefiles.includedFiles].flatMap((file) =>
    makefiles.readersOf(file).map((reader): FileLink => [reader, file]),
  );

/** The files linked to each other, through any chain of links, as groups. */
function linkedGroups(links: readonly FileLink[]): Set<string>[] {
  const groupOf = new Map<string, Set<string>>();
  for (const [left, right] of links) {
    const first = groupOf.get(left) ?? new Set([left]);
    const second = groupOf.get(right) ?? new Set([right]);
    const merged = first === second ? first : new Set([...first, ...second]);
    for (const path of merged) {
      groupOf.set(path, merged);
    }
  }
  return [...new Set(groupOf.values())];
}

/** Whether the text of a listed file names an old package; false when it cannot be read. */
async function namesOldPackage(path: string, files: ProjectFiles): Promise<boolean> {
  const read = await files.read(path);
  return read.kind === "read" && namesOriginalPackage(read.text);
}

/**
 * The files linked to a file that names an old package, which are migrated whatever they name.
 * The files of `unknownLinks` are linked to files the tool does not read (a Makefile's include
 * of a variable without a known value, or of a missing file), which may run the generator, so
 * they and the files linked to them are migrated too.
 */
export async function filesLinkedToOldNames(
  links: readonly FileLink[],
  files: ProjectFiles,
  unknownLinks: ReadonlySet<string> = new Set(),
): Promise<ReadonlySet<string>> {
  const found = new Set<string>();
  const alone = [...unknownLinks].map((path): FileLink => [path, path]);
  for (const group of linkedGroups([...links, ...alone])) {
    let isNamed = [...group].some((path) => unknownLinks.has(path));
    for (const path of group) {
      isNamed ||= await namesOldPackage(path, files);
    }
    for (const path of isNamed ? group : []) {
      found.add(path);
    }
  }
  return found;
}
