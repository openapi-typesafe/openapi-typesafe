import {
  type Change,
  type FileMigration,
  type ManualStep,
  unchanged,
} from "./migration-findings.js";
import { overriddenPackages } from "./override-targets.js";
import { PACKAGE_RENAMES } from "./package-names.js";
import { hideUrlCredentials } from "./url-credentials.js";
import { migrateVersionSpec } from "./version-spec.js";

/**
 * pnpm catalogs (`pnpm-workspace.yaml`): a project whose package.json says `"openapi-fetch":
 * "catalog:"` keeps its version here. The file is edited line by line, not parsed and written
 * again, so comments and formatting stay. Only entries under `catalog:` or `catalogs:` are renamed;
 * `overrides:` and `patchedDependencies:` entries that name an original package are reported, like
 * the same fields of package.json.
 */

/*
 * The patterns below run on every line of a file from the project, so each must stay linear in
 * the line length. A trailing `(.*)$` (the rest of an entry) and a key that could start inside the
 * indent before it made them quadratic: seconds on a crafted line of 160 kB.
 */
/**
 * `  openapi-fetch: ^0.13.1`, `  "openapi-fetch": "0.13"`; groups: indent, quote, name, spec. The
 * rest of the line (a comment) is what follows the match.
 */
const ENTRY_RE = /^(\s+)(["']?)([\w@./-]+)\2:\s*(["']?)([^"'#\s]+)\4/;
const TOP_LEVEL_KEY_RE = /^([\w-]+):/;
/** `  "app>openapi-fetch": 1.0.0`; groups: quote, key. The key starts after the indent. */
const KEY_RE = /^\s+(["']?)(\S.*?)\1:(?:\s|$)/;
const CATALOG_SECTIONS: ReadonlySet<string> = new Set(["catalog", "catalogs"]);
const REPORTED_SECTIONS: ReadonlySet<string> = new Set(["overrides", "patchedDependencies"]);

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
  const [whole, indent, keyQuote, name, specQuote, spec] = entry as unknown as string[];
  const rest = line.slice((whole as string).length);
  const decision = migrateVersionSpec(spec as string, version);
  const key = `${keyQuote}${renamed}${keyQuote}`;
  const migrated = `${indent}${key}: ${specQuote}${decision.spec}${specQuote}${rest}`;
  const change: Change = { kind: "catalog-entry-renamed", from: name as string, to: renamed };
  if (decision.kind === "kept" && decision.isReported) {
    return {
      line: migrated,
      change,
      manualStep: { kind: "spec-kept", name: renamed, spec: hideUrlCredentials(spec as string) },
    };
  }
  return { line: migrated, change };
}

/** The manual step for an override or patch entry that names an original package. */
function reportEntry(line: string, field: string): ManualStep[] {
  const key = KEY_RE.exec(line)?.[2];
  return key === undefined
    ? []
    : overriddenPackages({ [key]: null }).map((name) => ({
        kind: "override-names-package",
        field,
        name,
      }));
}

const LINE_FEED = "\n";
const CARRIAGE_RETURN = "\r";

/**
 * A line without its carriage return, and a function that puts it back. Lines are split at LF,
 * so a CRLF line keeps its CR; the patterns see the line without it, and each line keeps its own
 * ending when the file is written again.
 */
function withoutCarriageReturn(line: string): { body: string; restore: (body: string) => string } {
  if (!line.endsWith(CARRIAGE_RETURN)) {
    return { body: line, restore: (body) => body };
  }
  return {
    body: line.slice(0, -CARRIAGE_RETURN.length),
    restore: (body) => `${body}${CARRIAGE_RETURN}`,
  };
}

/** Rename the original packages in the catalogs of a pnpm-workspace.yaml; report its overrides. */
export function migrateWorkspaceCatalogs(text: string, version: string): FileMigration {
  const changes: Change[] = [];
  const manualSteps: ManualStep[] = [];
  let section: string | undefined;
  const lines = text.split(LINE_FEED).map((rawLine) => {
    const { body: line, restore } = withoutCarriageReturn(rawLine);
    const topLevelKey = TOP_LEVEL_KEY_RE.exec(line)?.[1];
    if (topLevelKey !== undefined) {
      section = topLevelKey;
      return rawLine;
    }
    if (section !== undefined && REPORTED_SECTIONS.has(section)) {
      manualSteps.push(...reportEntry(line, section));
      return rawLine;
    }
    if (section === undefined || !CATALOG_SECTIONS.has(section)) {
      return rawLine;
    }
    const result = migrateEntry(line, version);
    changes.push(...(result.change ? [result.change] : []));
    manualSteps.push(...(result.manualStep ? [result.manualStep] : []));
    return restore(result.line);
  });
  return changes.length === 0
    ? { ...unchanged(text), manualSteps }
    : { text: lines.join(LINE_FEED), changes, manualSteps };
}
