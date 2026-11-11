import type { CatalogPlan } from "../domain/catalog-plan.js";
import { planCatalogs } from "../domain/catalogs.js";
import { isMap, type TreeMap, valuesAt } from "../domain/config-documents.js";
import {
  declaredNames,
  localPackageNames,
  type ManifestDeclarations,
  namesUninstalledPackage,
} from "../domain/declared-packages.js";
import { importMapNames } from "../domain/import-map-migration.js";
import { namesOriginalPackage, WORKSPACES_FIELD } from "../domain/package-names.js";
import { type SuccessorAliases, successorAliasedPackages } from "../domain/successor-aliases.js";
import { type NamedImportMaps, namedImportMaps, withNamedImportMaps } from "./named-import-maps.js";
import { type PlanSource, planSourceOf } from "./plan-sources.js";
import type { DocumentReaders, ProjectFiles } from "./ports.js";
import { MANIFEST_FILE, WORKSPACE_FILE, YARNRC_FILE_NAME } from "./project-file-names.js";

/**
 * The project plan: what the manifests, catalog files and import maps of a project say, read once
 * before any file is migrated, so that each file is migrated in step with the others.
 */

/** What the plan reads files with. */
export interface PlanDependencies {
  readonly files: ProjectFiles;
  readonly readers: DocumentReaders;
}

/**
 * What every file of a project is migrated with: the tool's version, the catalog plan and what the
 * manifests declare.
 */
export interface ProjectTarget {
  readonly version: string;
  readonly catalogs: CatalogPlan;
  readonly manifests: readonly ManifestDeclarations[];
  /** The manifests and workspace files whose overrides alias original packages. */
  readonly aliases: readonly SuccessorAliases[];
  /** The files that Deno configs name as their import maps. */
  readonly importMaps: NamedImportMaps;
}

/**
 * A manifest, catalog or import map file as the plan reads it: whether it names an original
 * package, and its parsed roots; `roots` is undefined when the file cannot be read or parsed.
 */
interface PlanRead {
  readonly namesOriginal: boolean;
  readonly roots: readonly TreeMap[] | undefined;
}

async function readForPlan(
  path: string,
  source: PlanSource,
  dependencies: PlanDependencies,
): Promise<PlanRead> {
  const read = await dependencies.files.read(path);
  if (read.kind !== "read") {
    return { namesOriginal: false, roots: undefined };
  }
  const namesOriginal = namesOriginalPackage(read.text);
  // A file that names none of the packages adds nothing, so it is not parsed (the same gate as
  // the migration's own, which keeps large YAML files fast). The root manifest is parsed: its
  // `workspaces` field tells whether the root is a workspace root.
  const isNeeded = namesOriginal || namesUninstalledPackage(read.text) || path === MANIFEST_FILE;
  if (!isNeeded) {
    return { namesOriginal, roots: [] };
  }
  const parsed = source.read?.(read.text, dependencies.readers);
  const roots = parsed?.kind === "read" ? parsed.documents.filter(isMap) : undefined;
  return { namesOriginal, roots };
}

/** The files at a workspace root where pnpm and yarn keep the workspace's catalogs. */
const ROOT_WORKSPACE_FILES: ReadonlySet<string> = new Set([WORKSPACE_FILE, YARNRC_FILE_NAME]);

/**
 * Whether a file of the root makes it a workspace root: a pnpm or yarn workspace file, or a
 * root manifest with `workspaces` (bun keeps its catalogs there).
 */
function marksWorkspaceRoot(path: string, roots: readonly TreeMap[] | undefined): boolean {
  if (ROOT_WORKSPACE_FILES.has(path)) {
    return true;
  }
  const manifests = path === MANIFEST_FILE ? (roots ?? []) : [];
  return manifests.some((manifest) => valuesAt(manifest, WORKSPACES_FIELD).length > 0);
}

/** The names that a manifest or an import map declares, by the role of its file. */
const DECLARED_NAMES: Readonly<
  Record<PlanSource["role"], ((root: TreeMap) => string[]) | undefined>
> = { manifest: declaredNames, "import-map": importMapNames, catalogs: undefined };

/** What a manifest or an import map declares; nothing for a file of another role. */
function declarationsOf(
  path: string,
  role: PlanSource["role"],
  roots: readonly TreeMap[] | undefined,
): ManifestDeclarations[] {
  const names = DECLARED_NAMES[role];
  if (names === undefined) {
    return [];
  }
  const local = role === "manifest" ? (roots ?? []).flatMap(localPackageNames) : [];
  return [{ path, names: roots && new Set(roots.flatMap(names)), localPackages: new Set(local) }];
}

/** The successor aliases in the overrides of a manifest or a workspace file. */
function aliasesOf(path: string, roots: readonly TreeMap[] | undefined): SuccessorAliases[] {
  const names = (roots ?? []).flatMap(successorAliasedPackages);
  return names.length === 0 ? [] : [{ path, names: new Set(names) }];
}

/**
 * The catalog plan of the project and what its manifests and import maps declare, from the files
 * of the listing. A file that cannot be read or parsed adds no catalogs, and is reported when it
 * is migrated; such a manifest or import map counts as declaring every package.
 */
export async function planProjectTarget(
  paths: readonly string[],
  dependencies: PlanDependencies,
  version: string,
): Promise<ProjectTarget> {
  const documents: Record<"manifest" | "catalogs", TreeMap[]> = { manifest: [], catalogs: [] };
  const manifests: ManifestDeclarations[] = [];
  const aliases: SuccessorAliases[] = [];
  let isWorkspaceRoot = false;
  const importMaps = await namedImportMaps(paths, dependencies.files, dependencies.readers);
  for (const path of paths) {
    const source = planSourceOf(path, importMaps);
    if (source === undefined) {
      continue;
    }
    const { namesOriginal, roots } = await readForPlan(path, source, dependencies);
    isWorkspaceRoot ||= marksWorkspaceRoot(path, roots);
    if (namesOriginal && source.role !== "import-map") {
      documents[source.role].push(...(roots ?? []));
    }
    manifests.push(...declarationsOf(path, source.role, roots));
    aliases.push(...aliasesOf(path, roots));
  }
  const catalogs = planCatalogs({
    manifests: documents.manifest,
    catalogFiles: documents.catalogs,
    isWorkspaceRoot,
  });
  const declarations = withNamedImportMaps(manifests, importMaps);
  return { version, catalogs, manifests: declarations, aliases, importMaps };
}
