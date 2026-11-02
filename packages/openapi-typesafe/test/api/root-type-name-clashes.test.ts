import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--root-types --root-types-no-schema-prefix` with schemas of one PascalCase name (`Void`,
 * `void`, `void-`): openapi-typescript exported only the last one as `Void`. That name keeps its
 * meaning, and the earlier schemas get numbered aliases (pre-beta test plan PB-47).
 */

const DOCUMENT: OpenAPI3 = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {},
  components: { schemas: { Void: { type: "string" }, void: { type: "number" }, "void-": { type: "boolean" } } },
};

describe("root type aliases of schemas with one PascalCase name", () => {
  it("openapiTS keeps the shared name for the last schema and numbers the earlier ones", async () => {
    const options = { silent: true, rootTypes: true, rootTypesNoSchemaPrefix: true };

    const output = astToString(await openapiTS(structuredClone(DOCUMENT), options));

    expect(output).toContain(
      "export type Void = components['schemas']['void-'];\n" +
        "export type Void_2 = components['schemas']['Void'];\n" +
        "export type Void_3 = components['schemas']['void'];\n",
    );
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
