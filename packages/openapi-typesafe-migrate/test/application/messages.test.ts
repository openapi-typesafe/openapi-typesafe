import { describe, expect, it } from "vitest";
import {
  changeMessage,
  manualStepMessage,
  skippedMessage,
  writeFailedMessage,
} from "../../src/application/messages.js";
import type { FileProblem } from "../../src/application/ports.js";
import type { Change, ManualStep } from "../../src/domain/migration-findings.js";

const CHANGES: readonly Change[] = [
  { kind: "dependency-renamed", field: "dependencies", from: "a", to: "b", spec: "^1.0.0" },
  { kind: "catalog-entry-renamed", catalog: "catalogs.legacy", from: "a", to: "b", spec: "1.0.0" },
  { kind: "package-name-renamed", location: "peerDependenciesMeta", from: "a", to: "b" },
  { kind: "import-renamed", field: "imports", from: "a/", to: "b/", target: "npm:/b@^1.0.0/" },
  { kind: "alias-renamed", field: "dependencies", name: "my-fetch", spec: "npm:b@^1.0.0" },
  { kind: "command-renamed", location: "scripts.gen" },
  { kind: "flag-renamed", location: "scripts.gen", from: "-it", to: "--immutable" },
  { kind: "package-name-renamed", location: "ci.yml:4", from: "a", to: "b" },
  { kind: "specifier-renamed", line: 3, from: "a", to: "b" },
  { kind: "transform-rewritten", line: 7 },
  { kind: "declaration-removed", line: 2, name: "DATE" },
];

const STEPS: readonly ManualStep[] = [
  { kind: "config-unreadable", position: { line: 3, column: 7 } },
  { kind: "config-unreadable", position: undefined },
  { kind: "entry-not-edited", field: "catalog", name: "a" },
  { kind: "name-collision", field: "dependencies", from: "a", to: "b" },
  { kind: "catalog-reference-kept", field: "dependencies", name: "a", catalog: "default" },
  { kind: "catalog-entry-in-use", catalog: "catalogs.legacy", name: "a" },
  { kind: "peer-dependency-renamed", name: "b" },
  { kind: "spec-kept", name: "b", spec: "latest" },
  { kind: "override-names-package", field: "overrides", name: "a" },
  { kind: "versioned-command", location: "ci.yml:3" },
  { kind: "flags-in-variable", location: "Makefile:4", variable: "$(FLAGS)", flags: ["-it"] },
  { kind: "pinned-package", location: "scripts.setup", name: "openapi-fetch" },
  {
    kind: "old-package-file",
    location: "Makefile:2",
    path: "node_modules/openapi-typescript/x.js",
  },
  { kind: "command-string", line: 8, to: "npx openapi-typesafe a.yaml" },
  { kind: "options-not-inspected", line: 9 },
  { kind: "deep-import", line: 2, specifier: "b/x" },
  { kind: "string-names-package", line: 6, value: "openapi-fetch", to: "openapi-typesafe-fetch" },
  { kind: "old-peer-needed", dependent: "swr-openapi", peer: "openapi-fetch", range: ">=0.15" },
  { kind: "transform-not-rewritten", line: 4, reason: "other-callbacks" },
  { kind: "transform-not-rewritten", line: 4, reason: "not-a-function" },
  { kind: "transform-not-rewritten", line: 4, reason: "shared-function" },
  { kind: "transform-not-rewritten", line: 4, reason: "shared-options" },
  { kind: "transform-not-rewritten", line: 4, reason: "unknown-return" },
  { kind: "legacy-callback", line: 5, callback: "postTransform" },
  {
    kind: "package-not-declared",
    line: 1,
    name: "openapi-typesafe-helpers",
    installers: ["openapi-fetch", "openapi-react-query"],
  },
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

const PROBLEMS: readonly FileProblem[] = [
  { kind: "outside-root" },
  { kind: "not-utf-8" },
  { kind: "io-error", code: "EACCES" },
];

describe("skippedMessage", () => {
  it("skippedMessage describes every reason a file was not read", () => {
    expect(PROBLEMS.map(skippedMessage)).toMatchSnapshot();
  });
});

describe("writeFailedMessage", () => {
  it("writeFailedMessage describes every reason a file was not written", () => {
    expect(PROBLEMS.map((problem) => writeFailedMessage("a.ts", problem))).toMatchSnapshot();
  });
});
