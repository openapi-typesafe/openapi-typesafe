import { migrateCommand } from "./command-migration.js";
import {
  type Change,
  type FileMigration,
  type ManualStep,
  unchanged,
} from "./migration-findings.js";
import { DEPENDENCY_FIELDS, OVERRIDE_FIELDS, PACKAGE_RENAMES } from "./package-names.js";
import { migrateVersionSpec } from "./version-spec.js";

type JsonObject = Record<string, unknown>;

interface Findings {
  readonly changes: Change[];
  readonly manualSteps: ManualStep[];
}

const INDENT_RE = /^[ \t]+(?=")/m;
const DEFAULT_INDENT = "  ";

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The manifest as written again: same indentation, and a final newline only if it had one. */
function formatLike(original: string, manifest: JsonObject): string {
  const indent = INDENT_RE.exec(original)?.[0] ?? DEFAULT_INDENT;
  const ending = original.endsWith("\n") ? "\n" : "";
  return `${JSON.stringify(manifest, null, indent)}${ending}`;
}

function renameDependencies(
  field: string,
  dependencies: JsonObject,
  version: string,
  findings: Findings,
): JsonObject {
  // Rebuilt key by key, so a renamed dependency keeps its place in the list.
  return Object.fromEntries(
    Object.entries(dependencies).map(([name, spec]) => {
      const renamed = PACKAGE_RENAMES.get(name);
      if (renamed === undefined || typeof spec !== "string") {
        return [name, spec];
      }
      const decision = migrateVersionSpec(spec, version);
      findings.changes.push({
        kind: "dependency-renamed",
        field,
        from: name,
        to: renamed,
        spec: decision.spec,
      });
      if (decision.kind === "kept" && decision.isReported) {
        findings.manualSteps.push({ kind: "spec-kept", name: renamed, spec });
      }
      if (field === "peerDependencies") {
        findings.manualSteps.push({ kind: "peer-dependency-renamed", name: renamed });
      }
      return [renamed, decision.spec];
    }),
  );
}

function migrateScripts(scripts: JsonObject, findings: Findings): JsonObject {
  return Object.fromEntries(
    Object.entries(scripts).map(([name, script]) => {
      if (typeof script !== "string") {
        return [name, script];
      }
      const migrated = migrateCommand(script, `scripts.${name}`);
      findings.changes.push(...migrated.changes);
      findings.manualSteps.push(...migrated.manualSteps);
      return [name, migrated.text];
    }),
  );
}

/** Overrides and resolutions can pin the old packages; changing them needs the user's intent. */
function reportOverrides(manifest: JsonObject, findings: Findings): void {
  for (const field of OVERRIDE_FIELDS) {
    const text = JSON.stringify(manifest[field] ?? null);
    for (const name of PACKAGE_RENAMES.keys()) {
      if (text.includes(`"${name}`)) {
        findings.manualSteps.push({ kind: "override-names-package", field, name });
      }
    }
  }
}

function migrateFields(manifest: JsonObject, version: string, findings: Findings): JsonObject {
  const migrated: JsonObject = { ...manifest };
  for (const field of DEPENDENCY_FIELDS) {
    const dependencies = manifest[field];
    if (isObject(dependencies)) {
      migrated[field] = renameDependencies(field, dependencies, version, findings);
    }
  }
  if (isObject(manifest.scripts)) {
    migrated.scripts = migrateScripts(manifest.scripts, findings);
  }
  reportOverrides(manifest, findings);
  return migrated;
}

/**
 * Migrate a package.json: rename the original packages in the dependency fields (with
 * `version` as the new version), rename the generator command and its renamed flags in scripts,
 * and report overrides that name the original packages. Text that is not a JSON object is left.
 */
export function migratePackageManifest(text: string, version: string): FileMigration {
  let manifest: unknown;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    // A package.json that does not parse is not ours to fix; the user is told where it is.
    const reason = error instanceof Error ? error.message : String(error);
    return { ...unchanged(text), manualSteps: [{ kind: "manifest-unreadable", reason }] };
  }
  if (!isObject(manifest)) {
    return unchanged(text);
  }
  const findings: Findings = { changes: [], manualSteps: [] };
  const migrated = migrateFields(manifest, version, findings);
  const isChanged = findings.changes.length > 0;
  return { text: isChanged ? formatLike(text, migrated) : text, ...findings };
}
