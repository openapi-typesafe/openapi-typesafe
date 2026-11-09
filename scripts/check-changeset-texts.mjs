// Fail when a changeset text names an internal reference that changelog readers cannot look up.
//
// Usage: node scripts/check-changeset-texts.mjs   (root `lint:changesets`, run by `pnpm lint`).
// ADR-040 rule 8: the changelog is read on npm and on GitHub releases, so a changeset names no
// ADR, audit finding or hunt item; the pull request and the commit carry those references.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CHANGESET_DIRECTORIES = [".changeset", join(".changeset", "pre")];
// The changesets README is not a changeset; Changesets itself skips it the same way.
const NOT_A_CHANGESET = "README.md";
const INTERNAL_REFERENCES = [
  { name: "an ADR", pattern: /\bADR-\d+/ },
  { name: "an audit finding", pattern: /\baudit findings?\b/i },
  { name: "a hunt item", pattern: /\bhunt (items?|findings?)\b/i },
];

function listChangesets(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .filter((entry) => entry.name !== NOT_A_CHANGESET)
    .map((entry) => join(directory, entry.name));
}

function findViolations(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .flatMap((line, index) =>
      INTERNAL_REFERENCES.filter(({ pattern }) => pattern.test(line)).map(
        ({ name }) => `${path}:${index + 1}: names ${name}: ${line.trim()}`,
      ),
    );
}

const violations = CHANGESET_DIRECTORIES.flatMap(listChangesets).flatMap(findViolations);
if (violations.length > 0) {
  const list = violations.join("\n");
  process.stderr.write(`check-changeset-texts: changesets name internal references:\n${list}\n`);
  process.exit(1);
}
process.stdout.write("check-changeset-texts: no internal references\n");
