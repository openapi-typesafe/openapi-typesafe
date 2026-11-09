import { describe, expect, it } from "vitest";
import { SCHEMA_DIALECTS, schemaDialectOf } from "../../../src/domain/openapi/schema-dialect.js";

describe("schemaDialectOf", () => {
  it.each([
    ["3.0.3", SCHEMA_DIALECTS.OPENAPI_3_0],
    ["3.0", SCHEMA_DIALECTS.OPENAPI_3_0],
    [undefined, SCHEMA_DIALECTS.OPENAPI_3_0],
    ["3.1.0", SCHEMA_DIALECTS.JSON_SCHEMA_2020_12],
    ["3.2.0", SCHEMA_DIALECTS.JSON_SCHEMA_2020_12],
    ["3.00.1", SCHEMA_DIALECTS.JSON_SCHEMA_2020_12],
  ])("schemaDialectOf(%s) is %s", (version, dialect) => {
    expect(schemaDialectOf(version)).toBe(dialect);
  });
});
