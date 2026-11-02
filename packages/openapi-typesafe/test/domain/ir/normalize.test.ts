import { describe, expect, it } from "vitest";
import { irKeyword, irReference, irString } from "../../../src/domain/ir/constructors.js";
import { dedupeTypes, sortEntriesByKey } from "../../../src/domain/ir/normalize.js";

describe("dedupeTypes", () => {
  it("dedupeTypes with repeated primitive keywords keeps the first of each in order", () => {
    const types = ["string", "null", "string", "number", "null", "boolean", "boolean"] as const;

    expect(dedupeTypes(types.map(irKeyword))).toEqual(
      ["string", "null", "number", "boolean"].map((keyword) => irKeyword(keyword as "string")),
    );
  });

  it("dedupeTypes keeps repeated never and undefined only once", () => {
    const types = [irKeyword("never"), irKeyword("undefined"), irKeyword("never")];

    expect(dedupeTypes([...types, irKeyword("undefined")])).toEqual(types.slice(0, 2));
  });

  it("dedupeTypes keeps repeated unknown, literals and references", () => {
    const types = [
      irKeyword("unknown"),
      irKeyword("unknown"),
      irString("a", "json"),
      irString("a", "json"),
      irReference("A"),
      irReference("A"),
    ];

    expect(dedupeTypes(types)).toEqual(types);
  });
});

describe("sortEntriesByKey", () => {
  const keys = ["b", "a10", "A", "a2", "_x", "a", "10", "9", "Zeta"];

  it("sortEntriesByKey orders keys like the original localeCompare(en-us, numeric)", () => {
    const entries = keys.map((key, index) => [key, index] as const);
    const original = [...keys].sort((a, b) => a.localeCompare(b, "en-us", { numeric: true }));

    expect(sortEntriesByKey(entries).map(([key]) => key)).toEqual(original);
  });

  it("sortEntriesByKey is stable for equal keys and does not change its input", () => {
    const entries = [
      ["a", 1],
      ["a", 2],
      ["0", 3],
    ] as const;

    expect(sortEntriesByKey(entries)).toEqual([
      ["0", 3],
      ["a", 1],
      ["a", 2],
    ]);
    expect(entries[0]).toEqual(["a", 1]);
  });
});
