import { isMap } from "../domain/config-documents.js";
import type { ManifestDeclarations } from "../domain/declared-packages.js";
import { importMapLocations } from "../domain/import-map-reference.js";
import type { DocumentReaders, ProjectFiles } from "./ports.js";
import { baseName, DENO_CONFIG_FILES } from "./project-file-names.js";

/** Each import map file that Deno configs name, with the paths of the configs that name it. */
export type NamedImportMaps = ReadonlyMap<string, readonly string[]>;

export const NO_NAMED_IMPORT_MAPS: NamedImportMaps = new Map();

/** The import maps in the project that one Deno config names, read as JSON. */
async function importMapsOf(
  path: string,
  files: ProjectFiles,
  readers: DocumentReaders,
): Promise<string[]> {
  const read = await files.read(path);
  const parsed = read.kind === "read" ? readers.json.read(read.text) : undefined;
  if (parsed?.kind !== "read") {
    return [];
  }
  return importMapLocations(path, parsed.documents.filter(isMap)).flatMap((location) =>
    location.kind === "in-project" ? [location.path] : [],
  );
}

/**
 * The project files that Deno configs name as their import maps (`"importMap": "./deps.json"`).
 * They are found before the plan, which reads them as import maps whatever their name. A config
 * that cannot be read names none here; its migration reports it.
 */
export async function namedImportMaps(
  paths: readonly string[],
  files: ProjectFiles,
  readers: DocumentReaders,
): Promise<NamedImportMaps> {
  const named = new Map<string, string[]>();
  for (const path of paths.filter((candidate) => DENO_CONFIG_FILES.has(baseName(candidate)))) {
    for (const map of await importMapsOf(path, files, readers)) {
      named.set(map, [...(named.get(map) ?? []), path]);
    }
  }
  return named;
}

/** All of `sets` in one; undefined (every package) when one of them is. */
function joinedNames(
  sets: readonly (ReadonlySet<string> | undefined)[],
): ReadonlySet<string> | undefined {
  return sets.some((names) => names === undefined)
    ? undefined
    : new Set(sets.flatMap((names) => [...(names ?? [])]));
}

/**
 * The declarations with the names of each named import map given to the configs that name it:
 * Deno resolves the imports of the files under a config through its map, wherever the map is.
 */
export function withNamedImportMaps(
  declarations: readonly ManifestDeclarations[],
  importMaps: NamedImportMaps,
): ManifestDeclarations[] {
  const mapNames = new Map(declarations.map(({ path, names }) => [path, names]));
  return declarations
    .filter(({ path }) => !importMaps.has(path))
    .map((declaration) => {
      const { path, names } = declaration;
      const maps = [...importMaps].filter(([, configs]) => configs.includes(path));
      const named = maps.flatMap(([map]) => (mapNames.has(map) ? [mapNames.get(map)] : []));
      return { ...declaration, names: joinedNames([names, ...named]) };
    });
}
