import { describe, expect, it } from "vitest";
import {
  NOTHING_ELSE_FOUND,
  NOTHING_FOUND,
  SKIPPED_HEADING,
  skippedMessage,
} from "../../src/application/messages.js";
import type {
  FileReport,
  ProjectMigration,
  WriteOutcome,
} from "../../src/application/migrate-project.js";
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
  { path: "vendor/lib/../../outside/a.ts", reason: { kind: "outside-root" } },
];

function migration(
  files: readonly FileReport[],
  skipped: ProjectMigration["skipped"] = [],
  write: WriteOutcome = { kind: "dry-run" },
): ProjectMigration {
  return { files, skipped, write };
}

const WRITTEN: WriteOutcome = { kind: "written", paths: ["package.json"] };
const OUTSIDE_MESSAGE = skippedMessage({ kind: "outside-root" });

describe("renderReport", () => {
  it("renderReport says when nothing was found", () => {
    expect(renderReport(migration([]))).toBe(`${NOTHING_FOUND}\n`);
  });

  it("renderReport shows the control characters of a file name as escapes", () => {
    const forged = { ...REPORTS[1], path: "a\u001b[2K\n::error::forged.ts" } as FileReport;

    const report = renderReport(migration([forged]));

    expect(report).toContain("  a\\u001b[2K\\n::error::forged.ts: ");
    expect(report.split("\n").some((line) => line.startsWith("::error"))).toBe(false);
  });

  it("renderReport lists changes, manual steps and next steps of a dry run", () => {
    expect(renderReport(migration(REPORTS))).toMatchSnapshot();
  });

  it("renderReport ends a written run with the written note", () => {
    const changesOnly = REPORTS.slice(0, 1).map((report) => ({ ...report, manualSteps: [] }));

    expect(renderReport(migration(changesOnly, [], WRITTEN))).toMatchSnapshot();
  });

  it("renderReport omits the changes section when there are only manual steps", () => {
    expect(renderReport(migration(REPORTS.slice(1)))).not.toContain("Changes:");
  });

  it("renderReport lists the skipped paths before the next steps", () => {
    const report = renderReport(migration(REPORTS, SKIPPED));

    expect(report).toContain(
      `${SKIPPED_HEADING}\n  vendor/lib/../../outside/a.ts: ${OUTSIDE_MESSAGE}\n`,
    );
    expect(report.indexOf(SKIPPED_HEADING)).toBeLessThan(report.indexOf("Next steps:"));
  });

  it("renderReport lists the skipped paths when nothing was found", () => {
    expect(renderReport(migration([], SKIPPED))).toBe(
      `${SKIPPED_HEADING}\n  vendor/lib/../../outside/a.ts: ${OUTSIDE_MESSAGE}\n` +
        `\n${NOTHING_FOUND}\n`,
    );
  });

  it("renderReport does not say nothing was found when a bug of the tool skipped a file", () => {
    const bug: ProjectMigration["skipped"] = [
      { path: "ci.yml", reason: { kind: "migration-bug", message: "edits overlap at offset 1" } },
    ];

    const report = renderReport(migration([], bug));

    expect(report).not.toContain(NOTHING_FOUND);
    expect(report.endsWith(`\n${NOTHING_ELSE_FOUND}\n`)).toBe(true);
  });

  it("renderReport names where the writing stopped, what was written and what was not", () => {
    const write: WriteOutcome = {
      kind: "failed",
      written: ["a/package.json"],
      failed: { path: "b/package.json", reason: { kind: "io-error", code: "EACCES" } },
      notWritten: ["c/package.json"],
    };

    const report = renderReport(migration(REPORTS, [], write));

    expect(
      report.endsWith(
        "Writing stopped: b/package.json could not be written (EACCES).\n" +
          "Written before it:\n  a/package.json\n" +
          "Not written (still as they were):\n  c/package.json\n",
      ),
    ).toBe(true);
  });

  it("renderReport says when the first write failed and it was the last file", () => {
    const write: WriteOutcome = {
      kind: "failed",
      written: [],
      failed: { path: "package.json", reason: { kind: "outside-root" } },
      notWritten: [],
    };

    expect(
      renderReport(migration(REPORTS, [], write)).endsWith(
        "Writing stopped: package.json could not be written (it leads outside the project folder).\n" +
          "Nothing was written before it.\n",
      ),
    ).toBe(true);
  });
});
