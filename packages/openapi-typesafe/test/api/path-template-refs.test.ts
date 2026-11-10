import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** `--path-params-as-types` and `$ref`s into a templated path. */

const pathParameter = (type: string) => ({ name: "id", in: "path", required: true, schema: { type } });
const NAMED = { "application/json": { schema: { type: "object", properties: { name: { type: "string" } } } } };

function documentWith(type: string): OpenAPI3 {
  return {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {
      "/pets/{id}": {
        get: { parameters: [pathParameter(type)], responses: { 200: { description: "ok", content: NAMED } } },
      },
      "/animals/{id}": { $ref: "#/paths/~1pets~1%7Bid%7D" },
      "/pets": { get: { responses: { 200: { $ref: "#/paths/~1pets~1%7Bid%7D/get/responses/200" } } } },
      "/owners": {
        get: { operationId: "listOwners", responses: { 200: { $ref: "#/paths/~1pets~1%7Bid%7D/get/responses/200" } } },
      },
    },
  } as unknown as OpenAPI3;
}

async function generate(type: string, options: OpenAPITSOptions = { pathParamsAsTypes: true }): Promise<string> {
  return astToString(await openapiTS(documentWith(type), { silent: true, ...options }));
}

describe("--path-params-as-types references into templated paths", () => {
  it("openapiTS indexes paths by the template of a number path", async () => {
    const output = await generate("integer");

    expect(output).toContain(`"/animals/{id}": paths[\`/pets/\${number}\`];`);
    expect(output).toContain(`200: paths[\`/pets/\${number}\`]["get"]["responses"]["200"];`);
  });

  it("openapiTS indexes paths by the template in the operations interface too", async () => {
    const operations = (await generate("integer")).split("export interface operations")[1];

    expect(operations).toContain(`200: paths[\`/pets/\${number}\`]["get"]["responses"]["200"];`);
  });

  it("openapiTS output with a reference into a number path compiles", async () => {
    const code = `${await generate("integer")}
type Pet = paths["/pets"]["get"]["responses"][200]["content"]["application/json"];
const pet: Pet = { name: "Rex" };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });

  it("openapiTS keeps the URL of a string path, which the template matches", async () => {
    expect(await generate("string")).toContain('"/animals/{id}": paths["/pets/{id}"];');
  });

  it("openapiTS with paths that are no object has no templated paths", async () => {
    const document = { openapi: "3.1.0", info: { title: "t", version: "1" }, paths: null } as unknown as OpenAPI3;

    const output = astToString(await openapiTS(document, { silent: true, pathParamsAsTypes: true }));

    expect(output).toContain("export type paths = Record<string, never>;");
  });

  it("openapiTS keeps the URL without --path-params-as-types", async () => {
    expect(await generate("integer", {})).toContain('"/animals/{id}": paths["/pets/{id}"];');
  });
});
