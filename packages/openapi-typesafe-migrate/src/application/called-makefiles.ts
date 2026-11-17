import type { CalledMakefiles } from "../domain/make-calls.js";
import {
  folderOf,
  type IncludedFiles,
  type MakefileSource,
  withIncludedFiles,
} from "../domain/make-includes.js";
import { commandLineReplacements } from "../domain/makefile-reading.js";
import type { ProjectFiles } from "./ports.js";
import { baseName, extensionOf, MAKEFILE_EXTENSION, MAKEFILE_NAMES } from "./project-file-names.js";

/**
 * What the Makefiles of a project give one another: the text of each file a Makefile includes
 * (`include tools.mk`), the Makefiles that read each file, and what each one gives the recipes
 * that run make on it (`$(MAKE) -C api GEN+=-it`), the variables it sets by `override` in place
 * of a value from the command line. Read once before any file is migrated, as a recipe can call
 * any Makefile of the project. Only files of the project are read. The files a Makefile includes
 * are found by the rule its migration reads them with (make-includes.ts), so an include of a
 * wildcard or a variable reaches the same files in both.
 */

/** The Makefiles of a project, and the files they include, which are Makefiles too. */
export interface ProjectMakefiles extends CalledMakefiles {
  /** The project files that a Makefile includes, whatever their name (`config.make`). */
  readonly includedFiles: ReadonlySet<string>;
  /**
   * The Makefiles that include a file the tool does not read: one it cannot know (a variable
   * without a known value), or one outside the project or missing from it. Such a file may set
   * any variable, so these Makefiles are read whatever they name.
   */
  readonly unreadIncludes: ReadonlySet<string>;
}

export const NO_PROJECT_MAKEFILES: ProjectMakefiles = {
  replacedNames: () => undefined,
  includedText: () => undefined,
  listedPaths: [],
  readersOf: () => [],
  includedFiles: new Set(),
  unreadIncludes: new Set(),
};

/** Whether a path names a Makefile: `Makefile`, `makefile`, `GNUmakefile` or a `.mk` file. */
export const isMakefilePath = (path: string): boolean =>
  MAKEFILE_NAMES.has(baseName(path)) || extensionOf(path) === MAKEFILE_EXTENSION;

/** What reading the project's Makefiles needs: its files, and the texts read so far. */
interface ReadContext {
  readonly project: ReadonlySet<string>;
  readonly listedPaths: readonly string[];
  readonly files: ProjectFiles;
  readonly texts: Map<string, string>;
  /** The paths read so far, whether the read gave a text or not. */
  readonly tried: Set<string>;
}

/** The files make reads with the Makefile at `path`, and whether it includes unread files. */
interface MakefileReach {
  readonly files: ReadonlySet<string>;
  readonly hasUnreadInclude: boolean;
}

/** Read the text of a project file into the context, once. */
async function readText(path: string, context: ReadContext): Promise<void> {
  if (context.tried.has(path)) {
    return;
  }
  context.tried.add(path);
  const read = await context.files.read(path);
  if (read.kind === "read") {
    context.texts.set(path, read.text);
  }
}

/** Whether a path names a project file that is not read yet. */
const isPending = (path: string, context: ReadContext): boolean =>
  context.project.has(path) && !context.tried.has(path);

/**
 * The sources make reads from the Makefile at `path`: the Makefile with the files it includes,
 * and each project file an include line names that it does not put in (a line with another file
 * the tool cannot read), whose own include lines still name files make may read. A project file
 * not read yet is read as empty, so the values after it are those before it: one round then
 * finds every file those values name, not one file a round. Once every named file is read, no
 * file is read as empty, and the sources are what make reads.
 */
function sourcesOf(path: string, context: ReadContext): MakefileSource[] {
  const included: IncludedFiles = {
    includedText: (one) => context.texts.get(one) ?? (isPending(one, context) ? "" : undefined),
    listedPaths: context.listedPaths,
  };
  const folder = folderOf(path);
  const sourceOf = (one: string, text = context.texts.get(one)): MakefileSource[] =>
    text === undefined ? [] : [withIncludedFiles(text, one, included, folder)];
  const [main] = sourceOf(path);
  const sources = main === undefined ? [] : [main];
  const named = new Set([path]);
  for (const source of sources) {
    const others = [...source.requestedPaths].filter((one) => !named.has(one));
    for (const one of others) {
      named.add(one);
      sources.push(...(main?.readsOf(one).length === 0 ? sourceOf(one) : []));
    }
  }
  return sources;
}

/**
 * Read the Makefile at `path` and the project files it includes, however deep, into the texts.
 * Each round reads the files that the include lines of the sources name and are not read yet; a
 * variable that an included file sets can name the next file.
 */
async function readWithIncludes(path: string, context: ReadContext): Promise<MakefileReach> {
  await readText(path, context);
  for (;;) {
    const sources = sourcesOf(path, context);
    const named = new Set(sources.flatMap((source) => [...source.requestedPaths]));
    const pending = [...named].filter((one) => isPending(one, context));
    if (pending.length === 0) {
      const files = new Set([path, ...named].filter((one) => context.texts.has(one)));
      return { files, hasUnreadInclude: sources.some((source) => source.hasUnreadInclude) };
    }
    for (const one of pending) {
      await readText(one, context);
    }
  }
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

/** The names that each Makefile replaces by `override` in place of a command-line value. */
function replacedNamesOf(reached: Iterable<string>, files: IncludedFiles) {
  const found = new Map<string, ReadonlySet<string>>();
  for (const path of reached) {
    const text = files.includedText(path);
    if (text !== undefined) {
      found.set(path, commandLineReplacements(text, path, files));
    }
  }
  return found;
}

/** The Makefiles of `paths`, by path, with the names they replace and the files they include. */
export async function planCalledMakefiles(
  paths: readonly string[],
  files: ProjectFiles,
): Promise<ProjectMakefiles> {
  const context: ReadContext = {
    project: new Set(paths),
    listedPaths: paths,
    files,
    texts: new Map(),
    tried: new Set(),
  };
  const reached = new Map<string, ReadonlySet<string>>();
  const included = new Set<string>();
  const unreadIncludes = new Set<string>();
  for (const path of paths.filter(isMakefilePath)) {
    const reach = await readWithIncludes(path, context);
    reached.set(path, reach.files);
    for (const file of [...reach.files].filter((one) => one !== path)) {
      included.add(file);
    }
    if (reach.hasUnreadInclude) {
      unreadIncludes.add(path);
    }
  }
  const includedText = (path: string): string | undefined => context.texts.get(path);
  const found = replacedNamesOf(reached.keys(), { includedText, listedPaths: paths });
  const readers = readersByFile(reached, included);
  return {
    replacedNames: (path) => found.get(path),
    includedText,
    listedPaths: paths,
    readersOf: (path) => readers.get(path) ?? [],
    includedFiles: included,
    unreadIncludes,
  };
}
