import { describe, expect, it } from "vitest";
import { isEnumMergeFixed, mergedEnumNames } from "../../src/domain/merged-enums.ts";

const MERGED = [
  "export enum Status {",
  '    a = "a"',
  "}",
  "export const enum Kind {}",
  "export enum Status {",
  '    b = "b"',
  "}",
  "export const enum Kind {}",
].join("\n");

const APART = MERGED.replace(/(export enum Status)( \{\n {4}b)/, "$1_2$2").replace(
  /(export const enum Kind)( \{\}$)/,
  "$1_2$2",
);

describe("mergedEnumNames", () => {
  it("mergedEnumNames with repeated enum declarations lists each name once", () => {
    expect(mergedEnumNames(`${MERGED}\nexport enum Status {}`)).toEqual(["Status", "Kind"]);
  });

  it("mergedEnumNames with distinct names and other declarations returns none", () => {
    expect(mergedEnumNames(`${APART}\nexport type Status = string;`)).toEqual([]);
  });
});

describe("isEnumMergeFixed", () => {
  it("isEnumMergeFixed with a merge only in the golden text returns true", () => {
    expect(isEnumMergeFixed(MERGED, APART)).toBe(true);
  });

  it("isEnumMergeFixed with a merge in both or in neither returns false", () => {
    expect(isEnumMergeFixed(MERGED, MERGED)).toBe(false);
    expect(isEnumMergeFixed(APART, APART)).toBe(false);
  });
});
