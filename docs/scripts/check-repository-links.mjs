// Check the links of the built site that point into this repository against the working tree.
// The repository is private until release, so these links cannot be fetched (they return 404);
// linkinator skips them and this script checks that each named file or directory exists.
//
// Usage: node scripts/check-repository-links.mjs <built site directory>
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPOSITORY_URL = "https://github.com/openapi-typesafe/openapi-typesafe";
const REPOSITORY_ROOT = resolve(import.meta.dirname, "../..");
const LINK_RE = new RegExp(`href="${REPOSITORY_URL}([^"#?]*)`, "g");
/** Repository pages that exist for any repository, so there is no file to check. */
const REPOSITORY_PAGES = new Set(["", "/", "/pulls", "/issues", "/releases"]);
/** `/blob/main/<path>` and `/tree/main/<path>` name a file or directory; `/edit/` is a page. */
const FILE_LINK_RE = /^\/(?:blob|tree|edit)\/main\/(.+?)\/?$/;

function htmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Why a repository link is broken, or undefined when it is fine. */
function problemOf(path) {
  if (REPOSITORY_PAGES.has(path)) {
    return undefined;
  }
  const file = FILE_LINK_RE.exec(path)?.[1];
  if (file === undefined) {
    return "not a repository page or a file on main";
  }
  return existsSync(join(REPOSITORY_ROOT, decodeURIComponent(file))) ? undefined : "no such path";
}

const siteDirectory = process.argv[2];
if (siteDirectory === undefined) {
  process.stderr.write("usage: check-repository-links.mjs <built site directory>\n");
  process.exit(2);
}
const problems = new Map();
let linkCount = 0;
for (const page of htmlFiles(siteDirectory)) {
  for (const [, path] of readFileSync(page, "utf8").matchAll(LINK_RE)) {
    linkCount++;
    const problem = problemOf(path);
    if (problem !== undefined) {
      problems.set(`${REPOSITORY_URL}${path}`, problem);
    }
  }
}
for (const [url, problem] of problems) {
  process.stderr.write(`broken: ${url} (${problem})\n`);
}
process.stdout.write(`repository links: ${linkCount} checked, ${problems.size} broken\n`);
process.exitCode = problems.size === 0 ? 0 : 1;
