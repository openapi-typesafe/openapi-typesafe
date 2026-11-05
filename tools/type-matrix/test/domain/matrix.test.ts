import { describe, expect, it } from "vitest";
import {
  type CellResult,
  CONSUMER_PROJECTS,
  hasBlockingFailure,
  matrixCells,
  selectVersions,
  TYPESCRIPT_VERSIONS,
  type TypeScriptVersion,
  UnknownVersionError,
} from "../../src/domain/matrix.ts";

const STABLE: TypeScriptVersion = { id: "5.4", packageName: "typescript-5.4", isBlocking: true };
const BETA: TypeScriptVersion = { id: "7.1-beta", packageName: "ts-beta", isBlocking: false };
const PROJECT = { id: "strict", tsconfig: "tsconfig.json" };

function result(version: TypeScriptVersion, isPassed: boolean): CellResult {
  return { cell: { version, project: PROJECT }, isPassed, output: "", durationMs: 1 };
}

describe("selectVersions", () => {
  it("selectVersions without ids returns every version", () => {
    expect(selectVersions(TYPESCRIPT_VERSIONS, [])).toBe(TYPESCRIPT_VERSIONS);
  });

  it("selectVersions with ids keeps matrix order", () => {
    expect(selectVersions([STABLE, BETA], ["7.1-beta", "5.4"])).toEqual([STABLE, BETA]);
  });

  it("selectVersions with an unknown id throws UnknownVersionError naming the known ids", () => {
    expect(() => selectVersions([STABLE], ["4.9"])).toThrow(UnknownVersionError);
    expect(() => selectVersions([STABLE], ["4.9"])).toThrow(/known: 5\.4/);
  });
});

describe("matrixCells", () => {
  it("matrixCells pairs every version with every project, version by version", () => {
    const cells = matrixCells([STABLE, BETA], CONSUMER_PROJECTS);

    expect(cells.map((cell) => `${cell.version.id}/${cell.project.id}`)).toEqual([
      "5.4/strict",
      "5.4/strict-flags",
      "5.4/commonjs",
      "7.1-beta/strict",
      "7.1-beta/strict-flags",
      "7.1-beta/commonjs",
    ]);
  });
});

describe("hasBlockingFailure", () => {
  it("hasBlockingFailure is true when a blocking version failed", () => {
    expect(hasBlockingFailure([result(STABLE, false), result(BETA, true)])).toBe(true);
  });

  it("hasBlockingFailure ignores failures of non-blocking versions", () => {
    expect(hasBlockingFailure([result(STABLE, true), result(BETA, false)])).toBe(false);
  });
});

describe("TYPESCRIPT_VERSIONS", () => {
  it("TYPESCRIPT_VERSIONS starts at the lowest supported version 5.4 (ADR-006)", () => {
    expect(TYPESCRIPT_VERSIONS[0]?.id).toBe("5.4");
    expect(TYPESCRIPT_VERSIONS.filter((version) => !version.isBlocking).map((v) => v.id)).toEqual([
      "7.1-beta",
    ]);
  });
});
