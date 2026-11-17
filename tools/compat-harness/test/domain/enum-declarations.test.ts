import { describe, expect, it } from "vitest";
import { enumBlocks, wholeNameReference } from "../../src/domain/enum-declarations.ts";

describe("enumBlocks", () => {
  it("enumBlocks reads each declaration with its trimmed members", () => {
    const lines = [
      "export enum Kind {",
      '    a = "a",',
      '    b = "b"',
      "}",
      "export enum Empty {}",
    ];

    expect([...enumBlocks(lines).values()]).toEqual([
      { name: "Kind", members: 'a = "a",\nb = "b"', firstLine: 0, lastLine: 3 },
      { name: "Empty", members: "", firstLine: 4, lastLine: 4 },
    ]);
  });

  it("enumBlocks ends an empty declaration on its own line", () => {
    const lines = ["export const enum Empty {}", "export enum Kind {", '    a = "a"', "}"];

    expect(enumBlocks(lines).get("Empty")?.lastLine).toBe(0);
  });

  it("enumBlocks skips a declaration that no closing line ends", () => {
    const lines = ["export enum Kind {", '    a = "a",', '    b = "b"'];

    expect(enumBlocks(lines).has("Kind")).toBe(false);
  });
});

describe("wholeNameReference", () => {
  it("wholeNameReference matches only the whole name", () => {
    const reference = wholeNameReference("$Kind");

    expect(reference.test("a: $Kind;")).toBe(true);
    expect(reference.test("a: $KindOld;")).toBe(false);
    expect(reference.test("a: Old$Kind;")).toBe(false);
  });
});
