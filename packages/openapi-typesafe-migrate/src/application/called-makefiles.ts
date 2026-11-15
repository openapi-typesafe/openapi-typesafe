import type { CalledMakefiles } from "../domain/make-calls.js";
import { commandLineReplacements } from "../domain/makefile-migration.js";
import type { ProjectFiles } from "./ports.js";
import { baseName, extensionOf, MAKEFILE_EXTENSION, MAKEFILE_NAMES } from "./project-file-names.js";

/**
 * What the Makefiles of a project give the recipes that run make on them
 * (`$(MAKE) -C api GEN+=-it`): the variables each one sets by `override` in place of a value
 * from the command line. Read once before any file is migrated, as a recipe can call any
 * Makefile of the project.
 */

/** Whether a path names a Makefile: `Makefile`, `makefile`, `GNUmakefile` or a `.mk` file. */
export const isMakefilePath = (path: string): boolean =>
  MAKEFILE_NAMES.has(baseName(path)) || extensionOf(path) === MAKEFILE_EXTENSION;

/** The Makefiles of `paths`, by path, with the names they replace for a sub-make. */
export async function planCalledMakefiles(
  paths: readonly string[],
  files: ProjectFiles,
): Promise<CalledMakefiles> {
  const found = new Map<string, ReadonlySet<string>>();
  for (const path of paths.filter(isMakefilePath)) {
    const read = await files.read(path);
    if (read.kind === "read") {
      found.set(path, commandLineReplacements(read.text));
    }
  }
  return { replacedNames: (path) => found.get(path) };
}
