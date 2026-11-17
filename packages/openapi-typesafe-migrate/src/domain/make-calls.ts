import { isOwnGeneratorCommand } from "./appended-assignments.js";
import type { AppendedValue } from "./argument-findings.js";
import { commandRoles } from "./command-roles.js";
import { withoutRecipePrefix } from "./file-variables.js";
import type { IncludedFiles } from "./make-includes.js";
import { referencedName } from "./make-programs.js";
import { projectPathFrom } from "./relative-references.js";
import { argumentAssignments, assignmentValue, type ShellAssignment } from "./shell-assignments.js";
import { placedCommands, type ShellCommand } from "./shell-words.js";
import type { VariableProgram } from "./variable-programs.js";

/**
 * A recipe that runs make again (`$(MAKE) -C api GEN+=-it`). Make reads a `NAME+=text` argument
 * before the called Makefile: the text is appended to the value the sub-make gets from its
 * environment, which is the calling Makefile's value when it exports the variable, and the
 * called Makefile's plain assignments of the name are ignored. Only an `override` there changes
 * it, and one that sets the name anew drops the appended text. So the appended words are
 * arguments of the program of the exported value, or of one from outside the file.
 */

/** The Makefiles of the project that a recipe can run, and the files a Makefile can include. */
export interface CalledMakefiles extends IncludedFiles {
  /**
   * The variables that the Makefile at a project path sets by `override` in place of a value
   * from the command line, or undefined when the project has no file there.
   */
  readonly replacedNames: (path: string) => ReadonlySet<string> | undefined;
  /**
   * The Makefiles that make runs and that read the file at a project path: the file itself when
   * make runs it, and those that include it, however deep. Empty when no Makefile includes it.
   */
  readonly readersOf: (path: string) => readonly string[];
}

export const NO_CALLED_MAKEFILES: CalledMakefiles = {
  replacedNames: () => undefined,
  includedText: () => undefined,
  listedPaths: [],
  readersOf: () => [],
};

/** Where a recipe that calls make is, and what its Makefile gives the variables there. */
export interface MakeCallContext {
  readonly text: string;
  /** The project path of the calling Makefile. */
  readonly file: string;
  readonly called: CalledMakefiles;
  /** What a variable that the recipe at `offset` exports holds, or undefined for none. */
  readonly exported: (name: string, offset: number) => VariableProgram | undefined;
}

/** The programs of make, and the variable make sets to the command that runs it. */
const MAKE_PROGRAMS: ReadonlySet<string> = new Set(["make", "gmake"]);
const MAKE_VARIABLE = "MAKE";
/** `@`, `-` and `+` before a recipe line: silent, ignore errors, always run. */
const RECIPE_PREFIX_RE = /^[@+-]+/;
/** The names GNU make looks for, in its order, when no `-f` names the Makefile. */
const DEFAULT_MAKEFILES = ["GNUmakefile", "makefile", "Makefile"];
const SEPARATOR = "/";
const DIRECTORY_OPTIONS = ["-C", "--directory"];
const FILE_OPTIONS = ["-f", "--file", "--makefile"];
const LONG_OPTION_PREFIX = "--";
const LONG_VALUE = "=";

/** The value of an option among `names` at `index` (`-C dir`, `-Cdir`, `--directory=dir`). */
function optionValue(words: ShellCommand, index: number, names: readonly string[]) {
  const value = words[index]?.value ?? "";
  for (const name of names) {
    const isLong = name.startsWith(LONG_OPTION_PREFIX);
    if (value === name) {
      return { value: words[index + 1]?.value, width: 2 };
    }
    const joined = isLong ? `${name}${LONG_VALUE}` : name;
    if (value.startsWith(joined)) {
      return { value: value.slice(joined.length), width: 1 };
    }
  }
  return undefined;
}

/** Where the sub-make runs and which files `-f` names, as written. */
interface CallOptions {
  readonly folders: readonly string[];
  readonly files: readonly string[];
}

function callOptions(words: ShellCommand, from: number): CallOptions {
  const folders: string[] = [];
  const files: string[] = [];
  for (let index = from; index < words.length; ) {
    const folder = optionValue(words, index, DIRECTORY_OPTIONS);
    const file = folder === undefined ? optionValue(words, index, FILE_OPTIONS) : undefined;
    const found = folder ?? file;
    if (found?.value !== undefined) {
      (folder === undefined ? files : folders).push(found.value);
    }
    index += found?.width ?? 1;
  }
  return { folders, files };
}

/** The project path of `reference` from `folder`, or undefined for one the tool cannot place. */
const placed = (folder: string | undefined, reference: string): string | undefined =>
  folder === undefined ? undefined : projectPathFrom(folder, reference);

const joinedPath = (folder: string, name: string): string =>
  folder === "" ? name : `${folder}${SEPARATOR}${name}`;

/**
 * What the Makefiles a call reads replace by `override`, or undefined when one of them is not a
 * file of the project (a computed or absolute path, or a file the project does not have).
 */
function calledReplacements(file: string, options: CallOptions, called: CalledMakefiles) {
  let folder: string | undefined = file.split(SEPARATOR).slice(0, -1).join(SEPARATOR);
  for (const reference of options.folders) {
    folder = placed(folder, reference);
  }
  if (folder === undefined) {
    return undefined;
  }
  const inFolder = folder;
  if (options.files.length === 0) {
    const found = DEFAULT_MAKEFILES.map((name) => called.replacedNames(joinedPath(inFolder, name)));
    return found.find((names) => names !== undefined);
  }
  const named = options.files.map((reference) => placed(inFolder, reference));
  const found = named.map((path) => (path === undefined ? undefined : called.replacedNames(path)));
  return found.every((names) => names !== undefined)
    ? new Set(found.flatMap((names) => [...(names ?? [])]))
    : undefined;
}

/** What text appended on the command line runs with, or undefined when no program gets it. */
function appendedProgram(
  assignment: ShellAssignment,
  replaced: ReadonlySet<string> | undefined,
  exported: VariableProgram | undefined,
): VariableProgram | undefined {
  if (replaced?.has(assignment.name) === true) {
    return undefined;
  }
  if (exported === undefined) {
    const [first] = placedCommands(assignmentValue(assignment));
    return isOwnGeneratorCommand("after-outside", first) ? undefined : "generator-or-other";
  }
  if (replaced === undefined) {
    return exported === "other" ? "other" : "generator-or-other";
  }
  return exported;
}

/**
 * Where the arguments of a command that runs make start: after `make`, `gmake` (also by a
 * path) or the reference make sets to itself, `$(MAKE)`; undefined for another command.
 */
function makeArgumentsStart(words: ShellCommand, text: string): number | undefined {
  const { program } = commandRoles(words);
  const word = program === undefined ? undefined : words[program];
  if (program === undefined || word === undefined) {
    return undefined;
  }
  const written = text.slice(word.start, word.end).replace(RECIPE_PREFIX_RE, "");
  const isMake =
    referencedName(written) === MAKE_VARIABLE ||
    MAKE_PROGRAMS.has(written.split(SEPARATOR).at(-1) ?? "");
  return isMake ? program + 1 : undefined;
}

/** The text that one recipe command appends on a sub-make's command line, as arguments. */
function callAppends(command: ShellCommand, context: MakeCallContext): AppendedValue[] {
  const words = withoutRecipePrefix(command);
  const start = makeArgumentsStart(words, context.text);
  if (start === undefined) {
    return [];
  }
  const replaced = calledReplacements(context.file, callOptions(words, start), context.called);
  return argumentAssignments(words)
    .filter(({ isAppend }) => isAppend)
    .flatMap((assignment) => {
      const exported = context.exported(assignment.name, assignment.word.start);
      const found = appendedProgram(assignment, replaced, exported);
      const value = placedCommands(assignmentValue(assignment)).flat();
      const use = { written: `$(${assignment.name})`, program: found ?? "other" };
      return found === undefined ? [] : [{ words: value, program: use }];
    });
}

/** The text that the recipes of a Makefile append on the command lines of sub-makes. */
export const makeCallAppends = (
  commands: readonly ShellCommand[],
  context: MakeCallContext,
): AppendedValue[] => commands.flatMap((command) => callAppends(command, context));
