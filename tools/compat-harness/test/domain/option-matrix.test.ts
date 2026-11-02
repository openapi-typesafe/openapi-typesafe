import { describe, expect, it } from "vitest";
import { HarnessErrorCode } from "../../src/domain/errors.ts";
import {
  buildOptionMatrix,
  DEFAULT_OPTION_SET_ID,
  selectOptionSets,
} from "../../src/domain/option-matrix.ts";

describe("buildOptionMatrix", () => {
  it("buildOptionMatrix starts with the defaults and has unique ids", () => {
    const matrix = buildOptionMatrix();

    expect(matrix[0]).toEqual({ id: DEFAULT_OPTION_SET_ID, flags: [] });
    expect(new Set(matrix.map((set) => set.id)).size).toBe(matrix.length);
    expect(matrix).toHaveLength(28);
  });

  it("buildOptionMatrix names combined flags with a plus sign", () => {
    const combined = buildOptionMatrix().find((set) => set.flags.length === 2);

    expect(combined).toEqual({
      id: "root-types+root-types-no-schema-prefix",
      flags: ["--root-types", "--root-types-no-schema-prefix"],
    });
  });
});

describe("selectOptionSets", () => {
  it("selectOptionSets with all returns the whole matrix", () => {
    expect(selectOptionSets(["all"])).toEqual(buildOptionMatrix());
  });

  it("selectOptionSets with ids returns them in the given order", () => {
    expect(selectOptionSets(["enum", "default"]).map((set) => set.id)).toEqual(["enum", "default"]);
  });

  it("selectOptionSets with an unknown id throws UNKNOWN_OPTION_SET", () => {
    expect(() => selectOptionSets(["no-such-flag"])).toThrow(
      expect.objectContaining({ code: HarnessErrorCode.UnknownOptionSet }),
    );
  });
});
