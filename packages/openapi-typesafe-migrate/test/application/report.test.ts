import { describe, expect, it } from "vitest";
import { NOTHING_FOUND } from "../../src/application/messages.js";
import type { FileReport } from "../../src/application/migrate-project.js";
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

describe("renderReport", () => {
  it("renderReport says when nothing was found", () => {
    expect(renderReport([], false)).toBe(`${NOTHING_FOUND}\n`);
  });

  it("renderReport lists changes, manual steps and next steps of a dry run", () => {
    expect(renderReport(REPORTS, false)).toMatchSnapshot();
  });

  it("renderReport ends a written run with the written note", () => {
    const changesOnly = REPORTS.slice(0, 1).map((report) => ({ ...report, manualSteps: [] }));

    expect(renderReport(changesOnly, true)).toMatchSnapshot();
  });

  it("renderReport omits the changes section when there are only manual steps", () => {
    expect(renderReport(REPORTS.slice(1), false)).not.toContain("Changes:");
  });
});
