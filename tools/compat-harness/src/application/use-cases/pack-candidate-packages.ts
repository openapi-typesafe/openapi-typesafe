import { HarnessError, HarnessErrorCode } from "../../domain/errors.ts";
import {
  PACKAGE_RENAMES,
  pinSwitchedDependencies,
  type SwitchedPackage,
  type SwitchedPackageSpecs,
} from "../../domain/package-switch.ts";
import { runRequired } from "../commands.ts";
import { DEPENDENTS_WORK_PATHS, joinPath } from "../layout.ts";
import type { CommandRunner, DirectoryEraser, FileStore, Logger } from "../ports.ts";

export interface PackCandidatePackagesDependencies {
  readonly runner: CommandRunner;
  readonly eraser: DirectoryEraser;
  /** The repository `packages/` directory; each package lives in a directory of its own name. */
  readonly sources: FileStore;
  /** The dependents work directory. */
  readonly work: FileStore;
  readonly logger: Logger;
}

/** Directory a tarball is unpacked into while its dependencies are pinned. */
const UNPACK_DIRECTORY = "unpacked";
/** `npm pack` and `pnpm pack` put every file under this top-level directory of the tarball. */
const TARBALL_ROOT = "package";

const SWITCHED_PACKAGES = Object.values(PACKAGE_RENAMES);

async function readVersion(sources: FileStore, name: SwitchedPackage): Promise<string> {
  const text = await sources.readText(`${name}/package.json`);
  const version: unknown = text === undefined ? undefined : JSON.parse(text).version;
  if (typeof version !== "string") {
    throw new HarnessError(
      HarnessErrorCode.StoredFileInvalid,
      `No version in ${name}/package.json`,
    );
  }
  return version;
}

/** Work-store path of the tarball `pnpm pack` writes for a package. */
async function tarballPath(sources: FileStore, name: SwitchedPackage): Promise<string> {
  return joinPath(
    DEPENDENTS_WORK_PATHS.packages,
    `${name}-${await readVersion(sources, name)}.tgz`,
  );
}

/** The entry points a manifest names (`main`, `types`), relative to the package root. */
function entryPoints(manifest: string): string[] {
  const { main, types } = JSON.parse(manifest) as { main?: unknown; types?: unknown };
  return [main, types].filter((entry): entry is string => typeof entry === "string");
}

/**
 * Fail when an entry point is missing from the tarball. `pnpm pack` packs a package that was
 * never built without a word, and the dependents then lose its types: every candidate check
 * fails as a regression, though the package is not at fault.
 */
async function assertEntryPointsPacked(
  work: FileStore,
  tarball: string,
  manifest: string,
): Promise<void> {
  const root = joinPath(DEPENDENTS_WORK_PATHS.packages, UNPACK_DIRECTORY, TARBALL_ROOT);
  for (const entry of entryPoints(manifest)) {
    if (!(await work.exists(joinPath(root, entry)))) {
      throw new HarnessError(
        HarnessErrorCode.StoredFileInvalid,
        `${tarball} has no ${entry}: build the package before the dependents check`,
      );
    }
  }
}

/** Unpack a tarball, pin its sibling dependencies to the other tarballs and pack it again. */
async function pinTarball(
  dependencies: PackCandidatePackagesDependencies,
  tarball: string,
  specs: SwitchedPackageSpecs,
  timeoutMs: number,
): Promise<void> {
  const { runner, work } = dependencies;
  const unpacked = work.resolve(joinPath(DEPENDENTS_WORK_PATHS.packages, UNPACK_DIRECTORY));
  await dependencies.eraser.erase(unpacked);
  const manifestPath = joinPath(
    DEPENDENTS_WORK_PATHS.packages,
    UNPACK_DIRECTORY,
    TARBALL_ROOT,
    "package.json",
  );
  const run = (command: readonly string[]) =>
    runRequired(runner, { cwd: work.resolve("."), command, timeoutMs });
  await run(["mkdir", "-p", unpacked]);
  await run(["tar", "-xzf", work.resolve(tarball), "-C", unpacked]);
  const manifest = await work.readText(manifestPath);
  if (manifest === undefined) {
    throw new HarnessError(HarnessErrorCode.StoredFileInvalid, `No package.json in ${tarball}`);
  }
  await assertEntryPointsPacked(work, tarball, manifest);
  await work.writeText(manifestPath, pinSwitchedDependencies(manifest, specs).text);
  await run(["tar", "-czf", work.resolve(tarball), "-C", unpacked, TARBALL_ROOT]);
  await dependencies.eraser.erase(unpacked);
}

/**
 * Pack every openapi-typesafe package with pnpm (which resolves `workspace:` and `catalog:`
 * versions as on publish) and return the `file:` spec each candidate run installs it from.
 */
export async function packCandidatePackages(
  dependencies: PackCandidatePackagesDependencies,
  timeoutMs: number,
): Promise<SwitchedPackageSpecs> {
  const { runner, sources, work } = dependencies;
  const destination = work.resolve(DEPENDENTS_WORK_PATHS.packages);
  await dependencies.eraser.erase(destination);
  const tarballs = new Map<SwitchedPackage, string>();
  for (const name of SWITCHED_PACKAGES) {
    const command = ["pnpm", "pack", "--pack-destination", destination];
    await runRequired(runner, { cwd: sources.resolve(name), command, timeoutMs });
    tarballs.set(name, await tarballPath(sources, name));
  }
  // Object.fromEntries loses the key type; the map holds every switched package by construction.
  const specs = Object.fromEntries(
    [...tarballs].map(([name, tarball]) => [name, `file:${work.resolve(tarball)}`]),
  ) as SwitchedPackageSpecs;
  for (const tarball of tarballs.values()) {
    await pinTarball(dependencies, tarball, specs, timeoutMs);
  }
  dependencies.logger.info("candidate_packages_packed", { destination });
  return specs;
}
