import { containerServices } from "../domain/compose-services.js";
import type { DocumentValue } from "../domain/config-documents.js";
import { baseName } from "./project-file-names.js";

/**
 * `docker compose` merges the Compose files of a folder that it is given: `compose.yaml` with
 * `compose.override.yaml` by default, and any of them with `-f`. The tool does not know which
 * files a command merges, so each Compose file may be merged with every other one of its folder,
 * and a service that two of them give an entrypoint or a command runs a container that neither
 * file shows alone.
 */

const NO_SERVICES: ReadonlySet<string> = new Set();

const folderOf = (path: string): string => path.slice(0, path.length - baseName(path).length);

/** The Compose files of `paths` that share their folder with another one, which it may merge. */
export function mergedComposeFiles(paths: readonly string[]): string[] {
  return paths.filter((path) =>
    paths.some((other) => other !== path && folderOf(other) === folderOf(path)),
  );
}

/**
 * The services of each Compose file whose entrypoint or command another Compose file of its folder
 * sets, from the values of each file where they are used.
 */
export function outsideComposeServices(
  files: ReadonlyMap<string, readonly DocumentValue[]>,
): ReadonlyMap<string, ReadonlySet<string>> {
  const services = new Map([...files].map(([path, values]) => [path, containerServices(values)]));
  const found = new Map<string, ReadonlySet<string>>();
  for (const [path, own] of services) {
    const others = [...services].filter(
      ([other]) => other !== path && folderOf(other) === folderOf(path),
    );
    const outside = [...own].filter((name) => others.some(([, set]) => set.has(name)));
    found.set(path, outside.length === 0 ? NO_SERVICES : new Set(outside));
  }
  return found;
}
