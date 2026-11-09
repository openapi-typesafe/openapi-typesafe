// Fail when a packed tarball holds a path outside the package's `files` list, or lacks a file
// that every published package carries.
//
// Usage: node scripts/check-tarball-files.mjs <package.tgz>   (from check-exports.sh, in the
//        package directory). npm adds package.json, README and LICENSE on its own; CHANGELOG.md
//        ships only because `files` lists it, as openapi-fetch ships its changelog.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const ALWAYS_INCLUDED = /^(package\.json|README\.md|LICENSE)$/;
const REQUIRED_FILES = ["package.json", "README.md", "LICENSE", "CHANGELOG.md"];
const TARBALL_ROOT = "package/";

const [tarball] = process.argv.slice(2);
const { files = [] } = JSON.parse(readFileSync("package.json", "utf8"));
const entries = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" })
  .split("\n")
  .filter((line) => line.length > 0)
  .map((line) => line.slice(TARBALL_ROOT.length))
  // The root directory entry of a hand-made tarball is the empty path.
  .filter((path) => path.length > 0);
const isAllowed = (path) =>
  ALWAYS_INCLUDED.test(path) || files.some((entry) => path === entry || path.startsWith(`${entry}/`));
const unexpected = entries.filter((path) => !isAllowed(path));
const missing = REQUIRED_FILES.filter((path) => !entries.includes(path));

if (unexpected.length > 0) {
  const list = unexpected.join("\n");
  process.stderr.write(`check-tarball-files: ${tarball} has paths outside "files":\n${list}\n`);
  process.exit(1);
}
if (missing.length > 0) {
  process.stderr.write(`check-tarball-files: ${tarball} lacks ${missing.join(", ")}\n`);
  process.exit(1);
}
process.stdout.write(`check-tarball-files: ${entries.length} paths, all in "files"\n`);
