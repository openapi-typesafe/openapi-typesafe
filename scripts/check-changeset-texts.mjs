// Fail when a changeset text names an internal reference that changelog readers cannot look up.
//
// Usage: node scripts/check-changeset-texts.mjs   (root `lint:changesets`, run by `pnpm lint`).
// ADR-040 rule 8; the references it looks for are in `changeset-texts.mjs`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findInternalReferences } from "./changeset-texts.mjs";

const CHANGESET_DIRECTORIES = [".changeset", join(".changeset", "pre")];
// The changesets README is not a changeset; Changesets itself skips it the same way.
const NOT_A_CHANGESET = "README.md";

function listChangesets(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .filter((entry) => entry.name !== NOT_A_CHANGESET)
    .map((entry) => join(directory, entry.name));
}

function findViolations(path) {
  return findInternalReferences(readFileSync(path, "utf8")).map(
    ({ line, name, text }) => `${path}:${line}: names ${name}: ${text}`,
  );
}

const violations = CHANGESET_DIRECTORIES.flatMap(listChangesets).flatMap(findViolations);
if (violations.length > 0) {
  const list = violations.join("\n");
  process.stderr.write(`check-changeset-texts: changesets name internal references:\n${list}\n`);
  process.exit(1);
}
process.stdout.write("check-changeset-texts: no internal references\n");
