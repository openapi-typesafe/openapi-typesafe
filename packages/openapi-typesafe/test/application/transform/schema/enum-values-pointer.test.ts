import { describe, expect, it } from "vitest";
import { enumValuesPointer } from "../../../../src/application/transform/schema/enum-values-pointer.js";

/** The pointer of an `--enum-values` array in the generated types. */

const PLACEMENT = {
  locationPath: "#/paths/~1a/get/parameters/query/filter",
  typePath: "#/paths/~1a/get/parameters/query",
};

describe("enumValuesPointer", () => {
  it("enumValuesPointer reads a location under a placement at its type path", () => {
    const { ref } = enumValuesPointer("#/paths/~1a/get/parameters/query/filter/status", PLACEMENT);

    expect(ref).toBe("#/paths/~1a/get/parameters/query/status");
  });

  it("enumValuesPointer keeps a location outside the placement", () => {
    const path = "#/paths/~1a/get/parameters/query/filterx/status";

    expect(enumValuesPointer(path, PLACEMENT).ref).toBe(path);
    expect(enumValuesPointer("#/components/schemas/A/status", PLACEMENT).ref).toBe(
      "#/components/schemas/A/status",
    );
  });

  it("enumValuesPointer leaves out union positions and narrows the properties after them", () => {
    const result = enumValuesPointer("#/components/schemas/A/oneOf/0/kind");

    expect(result).toEqual({ ref: "#/components/schemas/A/kind", extract: ["kind"] });
  });
});
