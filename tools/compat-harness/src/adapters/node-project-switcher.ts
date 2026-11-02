import type { Dirent } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import type { ProjectSwitcher, ProjectSwitchSummary } from "../application/ports.ts";
import {
  pinUpstreamVersions,
  SOURCE_FILE_EXTENSIONS,
  type SwitchedPackageSpecs,
  type SwitchedText,
  switchModuleSpecifiers,
  switchPackageManifest,
} from "../domain/package-switch.ts";

const PACKAGE_MANIFEST_NAME = "package.json";
/** Installed packages and git metadata belong to no project source. */
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git"]);
const SOURCE_EXTENSIONS: ReadonlySet<string> = new Set(SOURCE_FILE_EXTENSIONS);

/** Every file of a project tree, without installed packages and git metadata. */
async function listFiles(directory: string): Promise<string[]> {
  const entries: Dirent[] = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return SKIPPED_DIRECTORIES.has(entry.name) ? [] : listFiles(path);
      }
      return entry.isFile() ? [path] : [];
    }),
  );
  return nested.flat();
}

export type TextSwitch = (text: string) => SwitchedText;

export const isPackageManifest = (path: string): boolean =>
  path.endsWith(`/${PACKAGE_MANIFEST_NAME}`);

/** Apply the switch chosen for each file of a project tree and count the changes. */
export async function rewriteTree(
  projectRoot: string,
  switchFor: (path: string) => TextSwitch | undefined,
): Promise<ProjectSwitchSummary> {
  let changedFileCount = 0;
  let replacementCount = 0;
  for (const path of await listFiles(projectRoot)) {
    const switchText = switchFor(path);
    if (switchText === undefined) {
      continue;
    }
    const switched = switchText(await readFile(path, "utf8"));
    if (switched.replacementCount > 0) {
      await writeFile(path, switched.text, "utf8");
      changedFileCount++;
      replacementCount += switched.replacementCount;
    }
  }
  return { changedFileCount, replacementCount };
}

/**
 * The in-harness rewrites of ENGINEERING_PLAN 8.4: `package.json` files and module specifiers are
 * changed in place with the pure functions of `domain/package-switch.ts`.
 */
export class NodeProjectSwitcher implements ProjectSwitcher {
  switchProject(projectRoot: string, specs: SwitchedPackageSpecs): Promise<ProjectSwitchSummary> {
    return rewriteTree(projectRoot, (path) => {
      if (isPackageManifest(path)) {
        return (text) => switchPackageManifest(text, specs);
      }
      return SOURCE_EXTENSIONS.has(extname(path)) ? switchModuleSpecifiers : undefined;
    });
  }

  pinUpstreamVersions(projectRoot: string): Promise<ProjectSwitchSummary> {
    return rewriteTree(projectRoot, (path) =>
      isPackageManifest(path) ? pinUpstreamVersions : undefined,
    );
  }
}
