import { describe, expect, it } from "vitest";
import {
  applyIntentionalDifferences,
  INTENTIONAL_DIFFERENCES,
  type IntentionalDifference,
} from "../../src/domain/intentional-differences.ts";

const UPPER: IntentionalDifference = {
  id: "upper",
  issues: ["owner/repo#1"],
  description: "lowercase a becomes A",
  golden: /^a$/gm,
  candidate: "A",
};

describe("applyIntentionalDifferences", () => {
  it("applyIntentionalDifferences rewrites the golden text and names the differences it applied", () => {
    expect(applyIntentionalDifferences("a\nb\na", [UPPER])).toEqual({
      text: "A\nb\nA",
      appliedIds: ["upper"],
    });
  });

  it("applyIntentionalDifferences leaves text without a match unchanged and applies nothing", () => {
    expect(applyIntentionalDifferences("b", [UPPER])).toEqual({ text: "b", appliedIds: [] });
  });

  it("applyIntentionalDifferences can apply the same catalog many times", () => {
    applyIntentionalDifferences("a", [UPPER]);

    expect(applyIntentionalDifferences("a", [UPPER]).appliedIds).toEqual(["upper"]);
  });
});

describe("INTENTIONAL_DIFFERENCES", () => {
  it("every entry has a unique id, an upstream issue and a global multiline pattern", () => {
    const ids = INTENTIONAL_DIFFERENCES.map((difference) => difference.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const difference of INTENTIONAL_DIFFERENCES) {
      expect(difference.issues.length).toBeGreaterThan(0);
      expect(difference.golden.flags).toContain("g");
      expect(difference.golden.flags).toContain("m");
    }
  });

  it("the empty enum member gets a quoted name", () => {
    const golden = 'export enum A {\n     = "",\n    b = "b"\n}\nexport enum B {\n     = ""\n}';

    expect(applyIntentionalDifferences(golden, INTENTIONAL_DIFFERENCES).text).toBe(
      'export enum A {\n    "" = "",\n    b = "b"\n}\nexport enum B {\n    "" = ""\n}',
    );
  });
});
