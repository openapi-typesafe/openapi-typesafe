import { describe, expect, it } from "vitest";
import { changeMessage, manualStepMessage } from "../../src/application/messages.js";
import type { Change, ManualStep } from "../../src/domain/migration-findings.js";

const CHANGES: readonly Change[] = [
  { kind: "dependency-renamed", field: "dependencies", from: "a", to: "b", spec: "^1.0.0" },
  { kind: "catalog-entry-renamed", from: "a", to: "b" },
  { kind: "command-renamed", location: "scripts.gen" },
  { kind: "flag-renamed", location: "scripts.gen", from: "-it", to: "--immutable" },
  { kind: "specifier-renamed", line: 3, from: "a", to: "b" },
  { kind: "transform-rewritten", line: 7 },
];

const STEPS: readonly ManualStep[] = [
  { kind: "manifest-unreadable", reason: "Unexpected token" },
  { kind: "peer-dependency-renamed", name: "b" },
  { kind: "spec-kept", name: "b", spec: "latest" },
  { kind: "override-names-package", field: "overrides", name: "a" },
  { kind: "versioned-command", location: "ci.yml:3" },
  { kind: "deep-import", line: 2, specifier: "b/x" },
  { kind: "string-names-package", line: 6, value: "openapi-fetch", to: "openapi-typesafe-fetch" },
  { kind: "old-peer-needed", dependent: "swr-openapi", peer: "openapi-fetch", range: ">=0.15" },
  { kind: "transform-not-rewritten", line: 4, reason: "other-callbacks" },
  { kind: "transform-not-rewritten", line: 4, reason: "not-a-function" },
  { kind: "transform-not-rewritten", line: 4, reason: "shared-function" },
  { kind: "transform-not-rewritten", line: 4, reason: "unknown-return" },
  { kind: "legacy-callback", line: 5, callback: "postTransform" },
];

describe("changeMessage", () => {
  it("changeMessage describes every kind of change", () => {
    expect(CHANGES.map(changeMessage)).toMatchSnapshot();
  });
});

describe("manualStepMessage", () => {
  it("manualStepMessage describes every kind of manual step", () => {
    expect(STEPS.map(manualStepMessage)).toMatchSnapshot();
  });
});
