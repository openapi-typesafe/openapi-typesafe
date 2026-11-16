import type { CalledMakefiles } from "../domain/make-calls.js";
import { folderOf, includedPaths } from "../domain/make-includes.js";
import { commandLineReplacements } from "../domain/makefile-reading.js";
import type { ProjectFiles } from "./ports.js";
import { baseName, extensionOf, MAKEFILE_EXTENSION, MAKEFILE_NAMES } from "./project-file-names.js";

/**
 * What the Makefiles of a project give one another: the text of each file a Makefile includes
 * (`include tools.mk`), the Makefiles that read each file, and what each one gives the recipes
 * that run make on it (`$(MAKE) -C api GEN+=-it`), the variables it sets by `override` in place
 * of a value from the command line. Read once before any file is migrated, as a recipe can call
 * any Makefile of the project. Only files of the project are read.
 */

/** The Makefiles of a project, and the files they include, which are Makefiles too. */
export interface ProjectMakefiles extends CalledMakefiles {
  /** The project files that a Makefile includes, whatever their name (`config.make`). */
  readonly includedFiles: ReadonlySet<string>;
}

export const NO_PROJECT_MAKEFILES: ProjectMakefiles = {
  replacedNames: () => undefined,
  includedText: () => undefined,
  readersOf: () => [],
  includedFiles: new Set(),
};

/** Whether a path names a Makefile: `Makefile`, `makefile`, `GNUmakefile` or a `.mk` file. */
export const isMakefilePath = (path: string): boolean =>
  MAKEFILE_NAMES.has(baseName(path)) || extensionOf(path) === MAKEFILE_EXTENSION;

/**
 * Read the Makefile at `path` and the project files it includes, however deep, into `texts`;
 * gives the files read. Make looks for an included path in the folder of the Makefile it runs,
 * for nested includes too.
 */
async function readWithIncludes(
  path: string,
  project: ReadonlySet<string>,
  files: ProjectFiles,
  texts: Map<string, string>,
): Promise<Set<string>> {
  const folder = folderOf(path);
  const visited = new Set<string>();
  for (let pending = [path]; pending.length > 0; ) {
    const next: string[] = [];
    for (const current of pending.filter((one) => !visited.has(one))) {
      visited.add(current);
      const read = texts.has(current) ? undefined : await files.read(current);
      if (read?.kind === "read") {
        texts.set(current, read.text);
      }
      const text = texts.get(current);
      next.push(...(text === undefined ? [] : includedPaths(text, folder)));
    }
    pending = next.filter((one) => project.has(one));
  }
  return new Set([...visited].filter((one) => texts.has(one)));
}

/**
 * The Makefiles that make runs, by the files each one reads. A Makefile that another one
 * includes is not run, unless it has a name make runs in its folder (`api/Makefile`).
 */
function readersByFile(reached: ReadonlyMap<string, ReadonlySet<string>>, included: Set<string>) {
  const readers = new Map<string, string[]>();
  for (const [path, files] of reached) {
    const isRun = !included.has(path) || MAKEFILE_NAMES.has(baseName(path));
    for (const file of isRun ? files : []) {
      readers.set(file, [...(readers.get(file) ?? []), path]);
    }
  }
  return readers;
}

/** The Makefiles of `paths`, by path, with the names they replace and the files they include. */
export async function planCalledMakefiles(
  paths: readonly string[],
  files: ProjectFiles,
): Promise<ProjectMakefiles> {
  const project = new Set(paths);
  const texts = new Map<string, string>();
  const reached = new Map<string, ReadonlySet<string>>();
  const included = new Set<string>();
  for (const path of paths.filter(isMakefilePath)) {
    const read = await readWithIncludes(path, project, files, texts);
    reached.set(path, read);
    for (const file of [...read].filter((one) => one !== path)) {
      included.add(file);
    }
  }
  const includedText = (path: string): string | undefined => texts.get(path);
  const found = new Map<string, ReadonlySet<string>>();
  for (const path of reached.keys()) {
    const text = texts.get(path);
    if (text !== undefined) {
      found.set(path, commandLineReplacements(text, path, { includedText }));
    }
  }
  const readers = readersByFile(reached, included);
  return {
    replacedNames: (path) => found.get(path),
    includedText,
    readersOf: (path) => readers.get(path) ?? [],
    includedFiles: included,
  };
}
