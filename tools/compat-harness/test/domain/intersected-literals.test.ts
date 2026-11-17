import { describe, expect, it } from "vitest";
import { enumBlocks } from "../../src/domain/enum-declarations.ts";
import { isIntersectedEnumUnified } from "../../src/domain/intersected-enums.ts";
import {
  isBeforeIntersection,
  isLiteralUnionUnified,
} from "../../src/domain/intersected-literals.ts";

// An excerpt of github.com under `--enum`: a nullable enum the golden generator keeps as literals,
// before an intersected part that types the same property by an enum.
const BODY = [
  "export interface components {",
  "    schemas: {",
  "        Job: {",
  "            job: {",
  "                /** @enum {string|null} */",
  '                conclusion: "success" | "failure" | null;',
  "            } & {",
  "                conclusion: JobConclusion;",
  "            };",
  "        };",
  "    };",
  "}",
];
const CONCLUSION = [
  "export enum JobConclusion {",
  '    success = "success",',
  '    failure = "failure"',
  "}",
];
const STATE = ["export enum State {", '    open = "open",', '    closed = "closed"', "}"];
const LITERALS = '"success" | "failure" | null';
const GOLDEN = [...BODY, ...CONCLUSION, ...STATE, ""].join("\n");
const ENUMS = enumBlocks([...CONCLUSION, ...STATE]);

const candidate = (type: string): string =>
  GOLDEN.replace(`conclusion: ${LITERALS};`, `conclusion: ${type};`);
const property = (type: string): string => `                conclusion: ${type};`;

describe("isLiteralUnionUnified", () => {
  it.each([
    ["the whole enum and null", "JobConclusion | null"],
    ["members and null", "JobConclusion.success | null"],
    ["grouped members and a literal", '(JobConclusion.success | "failure") | null'],
    ["the enum without null", "JobConclusion"],
  ])("isLiteralUnionUnified with %s of the literals returns true", (_shape, type) => {
    expect(isLiteralUnionUnified(property(LITERALS), property(type), ENUMS)).toBe(true);
  });

  it.each([
    ["an enum of other values", "State | null"],
    ["a member of another value", "State.open"],
    ["a member the enum does not have", "JobConclusion.missing"],
    ["an enum the text does not declare", "Missing | null"],
    ["only literals", '"success" | null'],
    ["a literal the golden union does not list", 'JobConclusion | "other"'],
  ])("isLiteralUnionUnified with %s returns false", (_shape, type) => {
    expect(isLiteralUnionUnified(property(LITERALS), property(type), ENUMS)).toBe(false);
  });

  it("isLiteralUnionUnified with a golden type that is no union of literals returns false", () => {
    const golden = property("string | null");

    expect(isLiteralUnionUnified(golden, property("JobConclusion | null"), ENUMS)).toBe(false);
  });

  it("isLiteralUnionUnified with another property or no property returns false", () => {
    const other = "                result: JobConclusion | null;";

    expect(isLiteralUnionUnified(property(LITERALS), other, ENUMS)).toBe(false);
    expect(isLiteralUnionUnified("            } & {", property("JobConclusion"), ENUMS)).toBe(
      false,
    );
  });

  it("isLiteralUnionUnified reads quoted, optional and readonly keys", () => {
    const quoted = (type: string) => `    readonly "a-b"?: ${type};`;

    expect(isLiteralUnionUnified(quoted('"success"'), quoted("JobConclusion.success"), ENUMS)).toBe(
      true,
    );
  });
});

describe("isBeforeIntersection", () => {
  it("isBeforeIntersection with a property of a literal closed by `} & ` returns true", () => {
    expect(isBeforeIntersection(BODY, 5)).toBe(true);
  });

  it("isBeforeIntersection with a property of a nested literal inside one returns true", () => {
    const nested = [
      "            job: {",
      "                steps: {",
      "                    name: string;",
      "                };",
      "            } & {",
    ];

    expect(isBeforeIntersection(nested, 2)).toBe(true);
  });

  it("isBeforeIntersection does not take a later sibling's intersection for its own", () => {
    const siblings = [
      "            a: {",
      "                x: string;",
      "            };",
      "            b: {",
      "                y: string;",
      "            } & {",
    ];

    expect(isBeforeIntersection(siblings, 1)).toBe(false);
  });

  it("isBeforeIntersection after the intersection or outside one returns false", () => {
    expect(isBeforeIntersection(BODY, 7)).toBe(false);
    expect(isBeforeIntersection(BODY, 2)).toBe(false);
    expect(isBeforeIntersection(["conclusion: X;", "} & {"], 0)).toBe(false);
    expect(isBeforeIntersection(BODY, BODY.length)).toBe(false);
  });
});

describe("isIntersectedEnumUnified with literals typed by an intersected enum", () => {
  it("isIntersectedEnumUnified with the literals typed by the enum returns true", () => {
    expect(isIntersectedEnumUnified(GOLDEN, candidate("JobConclusion | null"))).toBe(true);
  });

  it("isIntersectedEnumUnified with the enums reordered as well returns true", () => {
    const reordered = [
      ...BODY.map((line) => line.replace(LITERALS, "JobConclusion | null")),
      ...STATE,
      ...CONCLUSION,
      "",
    ].join("\n");

    expect(isIntersectedEnumUnified(GOLDEN, reordered)).toBe(true);
  });

  it("isIntersectedEnumUnified with literals typed by other values returns false", () => {
    expect(isIntersectedEnumUnified(GOLDEN, candidate("State | null"))).toBe(false);
  });

  it("isIntersectedEnumUnified with literals outside an intersection returns false", () => {
    const apart = (text: string) => text.replace("            } & {", "            } | {");

    expect(isIntersectedEnumUnified(apart(GOLDEN), apart(candidate("JobConclusion | null")))).toBe(
      false,
    );
  });

  it("isIntersectedEnumUnified with a declaration dropped for literals returns false", () => {
    const dropped = candidate("JobConclusion | null").replace(`${STATE.join("\n")}\n`, "");

    expect(isIntersectedEnumUnified(GOLDEN, dropped)).toBe(false);
  });
});
