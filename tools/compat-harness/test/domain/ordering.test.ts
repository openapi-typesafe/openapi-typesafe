import { describe, expect, it } from "vitest";
import { compareOrdinal } from "../../src/domain/ordering.ts";

describe("compareOrdinal", () => {
  it("compareOrdinal orders by code unit, so uppercase sorts before lowercase", () => {
    expect(["b", "a", "B", "a"].sort(compareOrdinal)).toEqual(["B", "a", "a", "b"]);
  });
});
