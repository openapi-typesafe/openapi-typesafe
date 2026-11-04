import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--root-types --root-types-no-schema-prefix` with schemas of one PascalCase name (`Void`,
 * `void`, `void-`): openapi-typescript exports only the last one, as `Void`. That output is valid,
 * so it stays the same (pre-beta test plan PB-47, backlog 30); the `root-type-numbering` fix numbers
 * the earlier ones (ADR-021, roadmap R13).
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

  it("openapiTS with the root-type-numbering fix exports every schema, the earlier ones numbered", async () => {
    const options = {
      silent: true,
      rootTypes: true,
      rootTypesNoSchemaPrefix: true,
      fix: ["root-type-numbering" as const],
    };

    const output = astToString(await openapiTS(structuredClone(DOCUMENT), options));
    const code = `${output}
const later: Void = true;
const first: Void_2 = "a";
const second: Void_3 = 1;
// @ts-expect-error the shared name keeps the later schema
const wrong: Void = "a";`;

    expect(output).toContain("export type Void_2 = components['schemas']['Void'];\n");
    expect(output).toContain("export type Void_3 = components['schemas']['void'];\n");
    expect(typeErrorsOf(code)).toEqual([]);
  });
});
