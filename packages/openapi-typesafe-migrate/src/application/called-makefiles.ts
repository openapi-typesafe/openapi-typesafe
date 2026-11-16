import type { CalledMakefiles } from "../domain/make-calls.js";
import { folderOf, includedPaths } from "../domain/make-includes.js";
import { commandLineReplacements } from "../domain/makefile-migration.js";
import type { ProjectFiles } from "./ports.js";
import { baseName, extensionOf, MAKEFILE_EXTENSION, MAKEFILE_NAMES } from "./project-file-names.js";

/**
 * What the Makefiles of a project give one another: the text of each file a Makefile includes
 * (`include tools.mk`), and what each one gives the recipes that run make on it
 * (`$(MAKE) -C api GEN+=-it`), the variables it sets by `override` in place of a value from the
 * command line. Read once before any file is migrated, as a recipe can call any Makefile of the
 * project. Only files of the project are read.
 */

/** Whether a path names a Makefile: `Makefile`, `makefile`, `GNUmakefile` or a `.mk` file. */
export const isMakefilePath = (path: string): boolean =>
  MAKEFILE_NAMES.has(baseName(path)) || extensionOf(path) === MAKEFILE_EXTENSION;

/**
 * Read the Makefile at `path` and the project files it includes, however deep, into `texts`.
 * Make looks for an included path in the folder of the Makefile it runs, for nested includes too.
 */
async function readWithIncludes(
  path: string,
  project: ReadonlySet<string>,
  files: ProjectFiles,
  texts: Map<string, string>,
): Promise<void> {
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
}

/** The Makefiles of `paths`, by path, with the names they replace and the files they include. */
export async function planCalledMakefiles(
  paths: readonly string[],
  files: ProjectFiles,
): Promise<CalledMakefiles> {
  const project = new Set(paths);
  const texts = new Map<string, string>();
  const makefiles = paths.filter(isMakefilePath);
  for (const path of makefiles) {
    await readWithIncludes(path, project, files, texts);
  }
  const includedText = (path: string): string | undefined => texts.get(path);
  const found = new Map<string, ReadonlySet<string>>();
  for (const path of makefiles) {
    const text = texts.get(path);
    if (text !== undefined) {
      found.set(path, commandLineReplacements(text, path, { includedText }));
    }
  }
  return { replacedNames: (path) => found.get(path), includedText };
}
