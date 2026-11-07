import { describe, expect, it } from "vitest";
import {
  NOTHING_FOUND,
  SKIPPED_HEADING,
  skipReasonMessage,
} from "../../src/application/messages.js";
import type { FileReport, ProjectMigration } from "../../src/application/migrate-project.js";
import { renderReport } from "../../src/application/report.js";

const REPORTS: readonly FileReport[] = [
  {
    path: "package.json",
    isChanged: true,
    changes: [{ kind: "command-renamed", location: "scripts.gen" }],
    manualSteps: [{ kind: "peer-dependency-renamed", name: "openapi-typesafe-fetch" }],
  },
  {
    path: "ci.yml",
    isChanged: false,
    changes: [],
    manualSteps: [{ kind: "versioned-command", location: "ci.yml:1" }],
  },
];

const SKIPPED: ProjectMigration["skipped"] = [
  { path: "vendor/lib/../../outside/a.ts", reason: "outside-root" },
];

function migration(
  files: readonly FileReport[],
  skipped: ProjectMigration["skipped"] = [],
): ProjectMigration {
  return { files, skipped };
}

describe("renderReport", () => {
  it("renderReport says when nothing was found", () => {
    expect(renderReport(migration([]), false)).toBe(`${NOTHING_FOUND}\n`);
  });

  it("renderReport lists changes, manual steps and next steps of a dry run", () => {
    expect(renderReport(migration(REPORTS), false)).toMatchSnapshot();
  });

  it("renderReport ends a written run with the written note", () => {
    const changesOnly = REPORTS.slice(0, 1).map((report) => ({ ...report, manualSteps: [] }));

    expect(renderReport(migration(changesOnly), true)).toMatchSnapshot();
  });

  it("renderReport omits the changes section when there are only manual steps", () => {
    expect(renderReport(migration(REPORTS.slice(1)), false)).not.toContain("Changes:");
  });

  it("renderReport lists the skipped paths before the next steps", () => {
    const report = renderReport(migration(REPORTS, SKIPPED), false);

    expect(report).toContain(
      `${SKIPPED_HEADING}\n  vendor/lib/../../outside/a.ts: ${skipReasonMessage("outside-root")}\n`,
    );
    expect(report.indexOf(SKIPPED_HEADING)).toBeLessThan(report.indexOf("Next steps:"));
  });

  it("renderReport lists the skipped paths when nothing was found", () => {
    expect(renderReport(migration([], SKIPPED), false)).toBe(
      `${SKIPPED_HEADING}\n  vendor/lib/../../outside/a.ts: ${skipReasonMessage("outside-root")}\n` +
        `\n${NOTHING_FOUND}\n`,
    );
  });
});
