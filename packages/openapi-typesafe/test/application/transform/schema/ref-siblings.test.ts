import { describe, expect, it } from "vitest";
import { refWithSiblingsAsAllOf } from "../../../../src/application/transform/schema/ref-siblings.js";
import { SCHEMA_DIALECTS } from "../../../../src/domain/openapi/schema-dialect.js";
import type { SchemaObject } from "../../../../src/domain/openapi/schema-object.js";
import { FIX } from "../../../../src/domain/output-fixes.js";
import { DEFAULT_TRANSFORM_OPTIONS } from "../../../fakes/transform-context.js";

const APPLIED = {
  ...DEFAULT_TRANSFORM_OPTIONS,
  fixes: new Set([FIX.REF_SIBLINGS]),
  schemaDialect: SCHEMA_DIALECTS.JSON_SCHEMA_2020_12,
};
const BASE = "#/components/schemas/Base";

function schema(value: object): SchemaObject {
  return value as SchemaObject;
}

describe("refWithSiblingsAsAllOf", () => {
  it("refWithSiblingsAsAllOf moves the $ref into allOf before the other members", () => {
    const value = schema({ $ref: BASE, required: ["id"], allOf: [{ type: "object" }] });

    expect(refWithSiblingsAsAllOf(value, APPLIED)).toEqual({
      required: ["id"],
      allOf: [{ $ref: BASE }, { type: "object" }],
    });
  });

  it("refWithSiblingsAsAllOf keeps a $ref with only annotations and extensions", () => {
    const value = schema({ $ref: BASE, description: "d", format: "uuid", "x-tag": 1 });

    expect(refWithSiblingsAsAllOf(value, APPLIED)).toBeNull();
  });

  it("refWithSiblingsAsAllOf changes nothing in OpenAPI 3.0 or without the fix", () => {
    const value = schema({ $ref: BASE, required: ["id"] });

    expect(
      refWithSiblingsAsAllOf(value, { ...APPLIED, schemaDialect: SCHEMA_DIALECTS.OPENAPI_3_0 }),
    ).toBeNull();
    expect(refWithSiblingsAsAllOf(value, { ...APPLIED, fixes: new Set() })).toBeNull();
  });

  it("refWithSiblingsAsAllOf changes nothing for a schema without $ref", () => {
    expect(refWithSiblingsAsAllOf(schema({ required: ["id"] }), APPLIED)).toBeNull();
  });
});
