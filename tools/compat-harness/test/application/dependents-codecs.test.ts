import { describe, expect, it } from "vitest";
import {
  decodeDependentResults,
  decodeDependentsManifest,
} from "../../src/application/dependents-codecs.ts";
import { HarnessErrorCode } from "../../src/domain/errors.ts";

const PROJECT = {
  id: "demo",
  repository: "https://github.com/owner/demo.js",
  commit: "0123456789abcdef0123456789abcdef01234567",
  packageManager: "npm",
  directory: "packages/app",
  steps: [{ name: "typecheck", command: ["npm", "run", "check"] }],
  generatedFiles: ["src/schema.ts"],
  notes: "",
};

const manifestText = (projects: readonly unknown[]): string =>
  JSON.stringify({ schemaVersion: 1, projects });

const decodeProject = (overrides: Record<string, unknown>) =>
  decodeDependentsManifest(manifestText([{ ...PROJECT, ...overrides }]));

describe("decodeDependentsManifest", () => {
  it("decodeDependentsManifest accepts a valid manifest", () => {
    expect(decodeDependentsManifest(manifestText([PROJECT])).projects).toEqual([PROJECT]);
  });

  it.each([
    ["a non-GitHub repository", { repository: "https://gitlab.com/o/r" }],
    ["a branch instead of a commit", { commit: "main" }],
    ["an unknown package manager", { packageManager: "yarn" }],
    ["a directory outside the checkout", { directory: "../other" }],
    ["an absolute generated file", { generatedFiles: ["/etc/passwd"] }],
    ["no steps", { steps: [] }],
    ["an empty command", { steps: [{ name: "x", command: [] }] }],
    ["a reserved step name", { steps: [{ name: "install", command: ["npm", "ci"] }] }],
    [
      "duplicate step names",
      {
        steps: [
          { name: "x", command: ["a"] },
          { name: "x", command: ["b"] },
        ],
      },
    ],
  ])("decodeDependentsManifest rejects %s", (_case, overrides) => {
    expect(() => decodeProject(overrides)).toThrow(
      expect.objectContaining({ code: HarnessErrorCode.StoredFileInvalid }),
    );
  });

  it("decodeDependentsManifest rejects duplicate project ids", () => {
    expect(() => decodeDependentsManifest(manifestText([PROJECT, PROJECT]))).toThrow(
      /project ids must be unique/,
    );
  });
});

describe("decodeDependentResults", () => {
  it("decodeDependentResults round-trips stored results", () => {
    const results = [
      {
        projectId: "demo",
        repository: PROJECT.repository,
        commit: PROJECT.commit,
        status: "regressed",
        failedStep: "test",
        baseline: [{ name: "test", status: "passed", durationMs: 1, outputExcerpt: "" }],
        candidate: [{ name: "test", status: "failed", durationMs: 2, outputExcerpt: "x" }],
        generatedFiles: [
          {
            path: "a.ts",
            status: "different",
            firstDifferentLine: 4,
            differentLineCount: 1,
            intentionalDifferenceIds: [],
          },
        ],
      },
    ];

    expect(decodeDependentResults(JSON.stringify(results))).toEqual(results);
  });

  it("decodeDependentResults rejects an unknown status", () => {
    const text = JSON.stringify([{ projectId: "x", status: "flaky" }]);

    expect(() => decodeDependentResults(text)).toThrow(/dependent results is invalid/);
  });
});
