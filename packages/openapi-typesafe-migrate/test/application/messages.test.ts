import { describe, expect, it } from "vitest";
import {
  changeMessage,
  skippedMessage,
  writeFailedMessage,
} from "../../src/application/messages.js";
import type { FileProblem } from "../../src/application/ports.js";
import type { Change } from "../../src/domain/migration-findings.js";

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

describe("changeMessage", () => {
  it("changeMessage describes every kind of change", () => {
    expect(CHANGES.map(changeMessage)).toMatchSnapshot();
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
