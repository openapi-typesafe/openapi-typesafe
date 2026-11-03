import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--root-types --root-types-no-schema-prefix` with schemas of one PascalCase name (`Void`,
 * `void`, `void-`): openapi-typescript exports only the last one, as `Void`. That output is valid,
 * so it stays the same (pre-beta test plan PB-47, backlog 30).
 */

const DOCUMENT: OpenAPI3 = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {},
  components: { schemas: { Void: { type: "string" }, void: { type: "number" }, "void-": { type: "boolean" } } },
};

describe("root type aliases of schemas with one PascalCase name", () => {
  it("openapiTS exports only the last schema under the shared name", async () => {
    const options = { silent: true, rootTypes: true, rootTypesNoSchemaPrefix: true };

    const output = astToString(await openapiTS(structuredClone(DOCUMENT), options));

    expect(output).toContain("export type Void = components['schemas']['void-'];\n");
    expect(output).not.toMatch(/export type Void_\d/);
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
