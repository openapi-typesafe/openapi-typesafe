import { composeIncludes, serviceValues } from "../domain/compose-includes.js";
import { containerServices } from "../domain/compose-services.js";
import type { DocumentValue } from "../domain/config-documents.js";
import type { IncludeProblem } from "../domain/migration-findings.js";
import { referencedProjectPath } from "../domain/relative-references.js";
import { baseName } from "./project-file-names.js";

/**
 * The Compose files that a project merges. `docker compose` merges the Compose files of a folder
 * that it is given (`compose.yaml` with `compose.override.yaml` by default, any of them with
 * `-f`), and the files that a top-level `include` names, also those that an include's `path`
 * list merges. The tool does not know which files a command merges, so each Compose file may be
 * merged with every other one of its folder, and with the files they include. A service that two
 * merged files give an entrypoint or a command runs a container that neither file shows alone.
 */

/** What a Compose file is read with: the services others complete, and its includes. */
export interface ComposeFileReading {
  readonly outsideServices: ReadonlySet<string>;
  readonly includedServices: ReadonlySet<string>;
  readonly unreadIncludes: ReadonlyMap<string, IncludeProblem>;
}

export interface ComposeReach {
  readonly readings: ReadonlyMap<string, ComposeFileReading>;
  /** The files that an include reads, which are Compose files whatever their name. */
  readonly includedFiles: ReadonlySet<string>;
}

/** How the planner reads the project's files. */
export interface ComposeSource {
  readonly listed: ReadonlySet<string>;
  /** The values of a YAML file where they are used; none when it does not parse. */
  valuesOf(path: string): Promise<readonly DocumentValue[]>;
  /** Whether the text of a file may have a top-level `include`, before it is parsed. */
  mayInclude(path: string): Promise<boolean>;
}

/** One include of a file: the path as written, and the project file it names. */
interface IncludeEdge {
  readonly written: string;
  readonly target: string;
}

/** The Compose files read, the includes between them, and those that were not read. */
interface ReadFiles {
  readonly values: Map<string, readonly DocumentValue[]>;
  readonly edges: Map<string, IncludeEdge[]>;
  readonly unread: Map<string, Map<string, IncludeProblem>>;
  /** The files of each include whose `path` lists several, which Compose merges. */
  readonly groups: string[][];
}

const folderOf = (path: string): string => path.slice(0, path.length - baseName(path).length);

/** The Compose files of `paths` that share their folder with another one, which it may merge. */
export function mergedComposeFiles(paths: readonly string[]): string[] {
  return paths.filter((path) =>
    paths.some((other) => other !== path && folderOf(other) === folderOf(path)),
  );
}

/** The project file an include path names, or undefined for one the tool cannot read. */
function includedPath(from: string, written: string, listed: ReadonlySet<string>) {
  // A path with a variable (`${DIR}/a.yaml`) names no listed file as written, so it is not read.
  const path = referencedProjectPath(from, written);
  return path !== undefined && listed.has(path) ? path : undefined;
}

/** Reads the includes of one file: the files they name, or why they were not read. */
function readIncludes(path: string, found: ReadFiles, listed: ReadonlySet<string>): string[] {
  const edges: IncludeEdge[] = [];
  const unread = new Map<string, IncludeProblem>();
  for (const entry of composeIncludes(found.values.get(path) ?? [])) {
    const targets = entry.flatMap(({ value: written }) => {
      const target = includedPath(path, written, listed);
      if (target === undefined) {
        unread.set(written, "not-in-project");
      }
      return target === undefined ? [] : [{ written, target }];
    });
    edges.push(...targets);
    found.groups.push(...(targets.length > 1 ? [targets.map(({ target }) => target)] : []));
  }
  found.edges.set(path, edges);
  found.unread.set(path, unread);
  return edges.map(({ target }) => target);
}

/** The Compose files of `roots` and every file their includes reach, each read once. */
async function readFiles(roots: readonly string[], source: ComposeSource): Promise<ReadFiles> {
  const found: ReadFiles = { values: new Map(), edges: new Map(), unread: new Map(), groups: [] };
  const pending = [...roots];
  for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
    if (!found.values.has(path)) {
      found.values.set(path, await source.valuesOf(path));
      pending.push(...readIncludes(path, found, source.listed));
    }
  }
  return found;
}

/**
 * The services that the files a file includes define, through their own includes too. An include
 * that leads back to a file on the way is a cycle, recorded as not read.
 */
function includedServices(path: string, found: ReadFiles, stack: readonly string[]): Set<string> {
  const services = new Set<string>();
  for (const { written, target } of found.edges.get(path) ?? []) {
    if (stack.includes(target)) {
      found.unread.get(path)?.set(written, "cycle");
    } else {
      const names = serviceValues(found.values.get(target) ?? []).keys();
      const deeper = includedServices(target, found, [...stack, target]);
      for (const name of [...names, ...deeper]) {
        services.add(name);
      }
    }
  }
  return services;
}

/** The files that a file includes, through their own includes too. */
function includedFiles(path: string, found: ReadFiles, seen: Set<string> = new Set()): Set<string> {
  for (const { target } of found.edges.get(path) ?? []) {
    if (!seen.has(target)) {
      seen.add(target);
      includedFiles(target, found, seen);
    }
  }
  return seen;
}

/** The sets of files that may be merged: a folder's files, or an include's `path` list. */
function mergedSets(composePaths: readonly string[], found: ReadFiles): Set<string>[] {
  const byFolder = new Map<string, string[]>();
  for (const path of mergedComposeFiles(composePaths)) {
    byFolder.set(folderOf(path), [...(byFolder.get(folderOf(path)) ?? []), path]);
  }
  return [...byFolder.values(), ...found.groups].map(
    (members) => new Set(members.flatMap((member) => [member, ...includedFiles(member, found)])),
  );
}

/** The container services of a file that another file of one of its merged sets also sets. */
function outsideServices(path: string, sets: readonly Set<string>[], found: ReadFiles) {
  const servicesOf = (file: string) => containerServices(found.values.get(file) ?? []);
  const others = sets
    .filter((set) => set.has(path))
    .flatMap((set) => [...set].filter((other) => other !== path))
    .map(servicesOf);
  return new Set([...servicesOf(path)].filter((name) => others.some((set) => set.has(name))));
}

/** What the Compose files of a project give each other. */
export async function planComposeReach(
  composePaths: readonly string[],
  source: ComposeSource,
): Promise<ComposeReach> {
  const including: string[] = [];
  for (const path of composePaths) {
    including.push(...((await source.mayInclude(path)) ? [path] : []));
  }
  const roots = [...new Set([...mergedComposeFiles(composePaths), ...including])];
  const found = await readFiles(roots, source);
  const sets = mergedSets(composePaths, found);
  const readings = new Map<string, ComposeFileReading>();
  for (const path of found.values.keys()) {
    const included = includedServices(path, found, [path]);
    readings.set(path, {
      outsideServices: outsideServices(path, sets, found),
      includedServices: included,
      unreadIncludes: found.unread.get(path) ?? new Map(),
    });
  }
  const reached = [...found.values.keys()].filter((path) => !composePaths.includes(path));
  return { readings, includedFiles: new Set(reached) };
}
