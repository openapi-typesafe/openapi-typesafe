import type { Finding, Locate } from "./argument-findings.js";
import { type DocumentString, type DocumentValue, isDocumentString } from "./config-documents.js";
import type { IncludeProblem, ManualStep } from "./migration-findings.js";

/**
 * Compose's top-level `include` loads other Compose files into the project: a path, or a map
 * whose `path` is one file or a list of files that are merged like `-f` files
 * (`project_directory` and `env_file` change neither which files are read nor their containers).
 * A path is relative to the file that includes it. Compose rejects a service that the project
 * already has from an included file, and an include cycle. The application layer reads the files
 * (application/compose-file-sets.ts); here a Compose file reports what it could not include and
 * the services it defines again.
 */

const INCLUDE_KEY = "include";
const PATH_KEY = "path";
const SERVICES_KEY = "services";
/** `include: [a.yaml]` is `include.0`; `include: [{ path: a.yaml }]` is `include.0.path`. */
const ENTRY_PATH_LENGTH = 2;

/** The written paths of each include entry of a Compose file, in the order of the text. */
export function composeIncludes(values: readonly DocumentValue[]): DocumentString[][] {
  const entries = new Map<string, DocumentString[]>();
  for (const value of values.filter(isDocumentString)) {
    const [key, index, field] = value.path;
    const isShort = value.path.length === ENTRY_PATH_LENGTH;
    if (key === INCLUDE_KEY && typeof index === "number" && (isShort || field === PATH_KEY)) {
      entries.set(String(index), [...(entries.get(String(index)) ?? []), value]);
    }
  }
  return [...entries.values()];
}

/** The services a Compose file defines, each with the first value that it holds. */
export function serviceValues(
  values: readonly DocumentValue[],
): ReadonlyMap<string, DocumentValue> {
  const found = new Map<string, DocumentValue>();
  for (const value of values) {
    const name = value.path[0] === SERVICES_KEY ? value.path[1] : undefined;
    if (name !== undefined && !found.has(String(name))) {
      found.set(String(name), value);
    }
  }
  return found;
}

/** What the project gives a Compose file about the files it includes. */
export interface ComposeIncludeReading {
  /** The services that the files it includes define, also through their own includes. */
  readonly includedServices?: ReadonlySet<string>;
  /** The written include paths that the tool did not read, and why. */
  readonly unreadIncludes?: ReadonlyMap<string, IncludeProblem>;
}

const NO_PROBLEMS: ReadonlyMap<string, IncludeProblem> = new Map();
const NO_SERVICES: ReadonlySet<string> = new Set();

/** One step for each written include path that the tool did not read. */
function unreadIncludeSteps(
  values: readonly DocumentValue[],
  unread: ReadonlyMap<string, IncludeProblem>,
  locate: Locate,
): Finding[] {
  return composeIncludes(values)
    .flat()
    .flatMap((path) => {
      const problem = unread.get(path.value);
      if (problem === undefined) {
        return [];
      }
      const location = locate(path.start);
      const manualStep: ManualStep = {
        kind: "compose-include-not-read",
        location,
        path: path.value,
        problem,
      };
      return [{ offset: path.start, manualStep }];
    });
}

/** One step for each service that the file defines again after a file it includes. */
function conflictSteps(
  values: readonly DocumentValue[],
  included: ReadonlySet<string>,
  locate: Locate,
): Finding[] {
  return [...serviceValues(values)].flatMap(([service, value]) => {
    const location = locate(value.start);
    const manualStep: ManualStep = { kind: "compose-service-conflict", location, service };
    return included.has(service) ? [{ offset: value.start, manualStep }] : [];
  });
}

/** The steps for the includes a Compose file could not read and the services it redefines. */
export function composeIncludeFindings(
  values: readonly DocumentValue[],
  reading: ComposeIncludeReading,
  locate: Locate,
): Finding[] {
  return [
    ...unreadIncludeSteps(values, reading.unreadIncludes ?? NO_PROBLEMS, locate),
    ...conflictSteps(values, reading.includedServices ?? NO_SERVICES, locate),
  ];
}
