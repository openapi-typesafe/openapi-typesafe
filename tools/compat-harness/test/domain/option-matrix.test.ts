import { describe, expect, it } from "vitest";
import { HarnessErrorCode } from "../../src/domain/errors.ts";
import {
  buildOptInOptionSets,
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

  it("selectOptionSets with all and an id returns the matrix once", () => {
    expect(selectOptionSets(["all", "enum"])).toEqual(buildOptionMatrix());
  });

  it("selectOptionSets with opt-in returns the baselines first, then the opt-in sets", () => {
    const ids = selectOptionSets(["opt-in"]).map((set) => set.id);

    expect(ids).toEqual([
      "default",
      "enum",
      "immutable",
      "additional-properties",
      "empty-objects-unknown",
      "properties-required-by-default",
      "array-length",
      "read-write-markers",
      "root-types+root-types-no-schema-prefix",
      "binary-as-blob",
      "binary-as-blob+immutable",
      "binary-as-blob+read-write-markers",
      "binary-as-blob+array-length",
      "fix=allof-required",
      "fix=allof-required+immutable",
      "fix=allof-required+properties-required-by-default",
      "fix=allof-required+empty-objects-unknown",
      "fix=anyof-properties",
      "fix=anyof-properties+empty-objects-unknown",
      "fix=array-length-tuples+array-length",
      "fix=unevaluated-properties",
      "fix=unevaluated-properties+immutable",
      "fix=unevaluated-properties+additional-properties",
      "fix=discriminator-values",
      "fix=discriminator-values+enum",
      "fix=root-type-numbering+root-types+root-types-no-schema-prefix",
      "fix=all",
      "fix=all+array-length",
    ]);
  });

  it("selectOptionSets with an opt-in id returns that option set only", () => {
    expect(selectOptionSets(["binary-as-blob+immutable"])).toEqual([
      {
        id: "binary-as-blob+immutable",
        flags: ["--binary-as-blob", "--immutable"],
        baselineOptionSetId: "immutable",
      },
    ]);
  });

  it("selectOptionSets with an unknown id throws UNKNOWN_OPTION_SET", () => {
    expect(() => selectOptionSets(["no-such-flag"])).toThrow(
      expect.objectContaining({ code: HarnessErrorCode.UnknownOptionSet }),
    );
  });
});

describe("buildOptInOptionSets", () => {
  it("buildOptInOptionSets has a matrix option set as every baseline and no matrix id", () => {
    const matrixIds = new Set(buildOptionMatrix().map((set) => set.id));

    for (const optInSet of buildOptInOptionSets()) {
      expect(matrixIds.has(optInSet.baselineOptionSetId)).toBe(true);
      expect(matrixIds.has(optInSet.id)).toBe(false);
    }
  });
});
