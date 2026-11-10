import { documentStrings, type TreeMap, valuesAt } from "./config-documents.js";
import type { Findings } from "./dependency-map.js";
import { renamedSpecifier } from "./package-names.js";
import { replaceScalar } from "./tree-entries.js";

/**
 * Node's subpath imports: `"imports": { "#client": "openapi-fetch" }` maps a private name to a
 * target, a string under any nesting of conditions and fallback lists. The dependencies get the
 * new names, so a target that names an original package (or a subpath of it) would no longer
 * resolve: it gets the new name too. The `#` keys are the project's own names and stay.
 */

const IMPORTS_FIELD = "imports";
const PATH_SEPARATOR = ".";

export function migrateSubpathImports(manifest: TreeMap, findings: Findings): void {
  for (const imports of valuesAt(manifest, IMPORTS_FIELD)) {
    for (const target of documentStrings([imports])) {
      const renamed = renamedSpecifier(target.value);
      if (renamed === undefined) {
        continue;
      }
      const location = [IMPORTS_FIELD, ...target.path].join(PATH_SEPARATOR);
      if (target.encode === undefined) {
        findings.manualSteps.push({
          kind: "entry-not-edited",
          field: location,
          name: target.value,
        });
        continue;
      }
      findings.edits.push(replaceScalar({ ...target, encode: target.encode }, renamed.to));
      findings.changes.push({
        kind: "package-name-renamed",
        location,
        from: target.value,
        to: renamed.to,
      });
      // A deep target reaches into the package's files, whose layout is not part of the contract.
      if (renamed.isDeep) {
        findings.manualSteps.push({ kind: "deep-target", location, specifier: renamed.to });
      }
    }
  }
}
