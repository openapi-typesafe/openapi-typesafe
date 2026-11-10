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

describe("--path-params-as-types references into a boolean path", () => {
  const flag = { name: "enabled", in: "path", required: true, schema: { type: "boolean" } };
  const json = (type: string) => ({ "application/json": { schema: { type } } });
  const response = (type: string) => ({ 200: { description: "ok", content: json(type) } });
  const SCHEMA_REF = "#/paths/~1flags~1{enabled}/get/responses/200/content/application~1json/schema";

  async function generateWith(paths: Record<string, unknown>, ref = SCHEMA_REF): Promise<string> {
    const document = {
      openapi: "3.1.0",
      info: { title: "t", version: "1" },
      paths,
      components: { schemas: { A: { $ref: ref } } },
    } as unknown as OpenAPI3;
    return astToString(await openapiTS(document, { silent: true, pathParamsAsTypes: true }));
  }

  it("openapiTS indexes paths by both keys of a boolean path", async () => {
    const output = await generateWith({
      "/flags/{enabled}": { get: { parameters: [flag], responses: response("integer") } },
    });

    expect(output).toContain('A: paths["/flags/true" | "/flags/false"]["get"]');
  });

  it("openapiTS leaves out the key that a path of the document takes", async () => {
    const output = await generateWith({
      "/flags/true": { get: { responses: response("string") } },
      "/flags/{enabled}": { get: { parameters: [flag], responses: response("integer") } },
    });

    expect(output).toContain('A: paths["/flags/false"]["get"]');
    expect(typeErrorsOf(`${output}\nconst a: components["schemas"]["A"] = 1;`)).toEqual([]);
    expect(typeErrorsOf(`${output}\nconst a: components["schemas"]["A"] = "text";`)).not.toEqual([]);
  });

  it("openapiTS leaves out the keys that an earlier boolean path takes", async () => {
    const named = (name: string) => ({ ...flag, name });
    const output = await generateWith(
      {
        "/x/{a}/true": { get: { parameters: [named("a")], responses: response("string") } },
        "/x/{b}/{c}": { get: { parameters: [named("b"), named("c")], responses: response("integer") } },
      },
      "#/paths/~1x~1{b}~1{c}/get/responses/200/content/application~1json/schema",
    );

    expect(output).toContain('A: paths["/x/true/false" | "/x/false/false"]["get"]');
  });
});
