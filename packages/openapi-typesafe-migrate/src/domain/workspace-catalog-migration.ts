import {
  type Change,
  type FileMigration,
  type ManualStep,
  unchanged,
} from "./migration-findings.js";
import { PACKAGE_RENAMES } from "./package-names.js";
import { migrateVersionSpec } from "./version-spec.js";

/**
 * pnpm catalogs (`pnpm-workspace.yaml`): a project whose package.json says `"openapi-fetch":
 * "catalog:"` keeps its version here. The file is edited line by line, not parsed and written
 * again, so comments and formatting stay. Only entries under `catalog:` or `catalogs:` are renamed.
 */

/** `  openapi-fetch: ^0.13.1`, `  "openapi-fetch": "0.13"`; groups: indent, quote, name, spec. */
const ENTRY_RE = /^(\s+)(["']?)([\w@./-]+)\2:\s*(["']?)([^"'#\s]+)\4(.*)$/;
const TOP_LEVEL_KEY_RE = /^([\w-]+):/;
const CATALOG_SECTIONS: ReadonlySet<string> = new Set(["catalog", "catalogs"]);

interface LineResult {
  readonly line: string;
  readonly change?: Change;
  readonly manualStep?: ManualStep;
}

function migrateEntry(line: string, version: string): LineResult {
  const entry = ENTRY_RE.exec(line);
  const renamed = entry === null ? undefined : PACKAGE_RENAMES.get(entry[3] as string);
  if (entry === null || renamed === undefined) {
    return { line };
  }
  const [, indent, keyQuote, name, specQuote, spec, rest] = entry as unknown as string[];
  const decision = migrateVersionSpec(spec as string, version);
  const key = `${keyQuote}${renamed}${keyQuote}`;
  const migrated = `${indent}${key}: ${specQuote}${decision.spec}${specQuote}${rest}`;
  const change: Change = { kind: "catalog-entry-renamed", from: name as string, to: renamed };
  if (decision.kind === "kept" && decision.isReported) {
    return {
      line: migrated,
      change,
      manualStep: { kind: "spec-kept", name: renamed, spec: spec as string },
    };
  }
  return { line: migrated, change };
}

/** Rename the original packages in the catalogs of a pnpm-workspace.yaml. */
export function migrateWorkspaceCatalogs(text: string, version: string): FileMigration {
  const changes: Change[] = [];
  const manualSteps: ManualStep[] = [];
  let isInCatalog = false;
  const lines = text.split("\n").map((line) => {
    const topLevelKey = TOP_LEVEL_KEY_RE.exec(line)?.[1];
    if (topLevelKey !== undefined) {
      isInCatalog = CATALOG_SECTIONS.has(topLevelKey);
      return line;
    }
    if (!isInCatalog) {
      return line;
    }
    const result = migrateEntry(line, version);
    changes.push(...(result.change ? [result.change] : []));
    manualSteps.push(...(result.manualStep ? [result.manualStep] : []));
    return result.line;
  });
  return changes.length === 0 ? unchanged(text) : { text: lines.join("\n"), changes, manualSteps };
}
