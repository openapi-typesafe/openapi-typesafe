import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * `<name> <version>` of the package that owns a `bin/cli.js`, read from its `package.json`, so
 * the report names exactly what was measured.
 */
export async function packageLabelOf(cliPath: string): Promise<string> {
  const manifestPath = join(dirname(dirname(cliPath)), "package.json");
  const manifest: { name?: unknown; version?: unknown } = JSON.parse(
    await readFile(manifestPath, "utf8"),
  );
  const { name, version } = manifest;
  if (typeof name !== "string" || typeof version !== "string") {
    throw new TypeError(`${manifestPath} has no name and version`);
  }
  return `${name} ${version}`;
}
