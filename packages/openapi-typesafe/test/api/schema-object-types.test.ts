import { describe, expectTypeOf, it } from "vitest";
import type { SchemaObject } from "../../src/index.js";

/** The public Schema Object types callbacks receive. */

describe("SchemaObject types", () => {
  it("a string Schema Object exposes its length and pattern constraints", () => {
    const readConstraints = (schema: SchemaObject) =>
      "type" in schema && schema.type === "string" ? [schema.minLength, schema.maxLength, schema.pattern] : [];

    expectTypeOf(readConstraints).returns.toEqualTypeOf<(number | string | undefined)[]>();
  });
});
