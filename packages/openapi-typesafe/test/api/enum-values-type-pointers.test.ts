import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--enum-values` arrays are typed by an indexed access into the generated types. Each test is a
 * location whose index did not match the generated shape, so the output did not compile.
 */

const FORMAT = { name: "format", in: "path", required: true, schema: { type: "string", enum: ["json", "xml"] } };

function documentWithPaths(paths: OpenAPI3["paths"]): OpenAPI3 {
  return { openapi: "3.1.0", info: { title: "Test", version: "1.0.0" }, paths } as OpenAPI3;
}

async function generate(document: OpenAPI3): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, enumValues: true }));
}

describe("--enum-values type of a path item parameter", () => {
  it("openapiTS indexes the parameters of a webhook and a component path item once", async () => {
    const pathItem = { parameters: [FORMAT], post: { responses: { 200: { description: "OK" } } } };
    const document = {
      ...documentWithPaths({}),
      webhooks: { created: pathItem },
      components: { pathItems: { Files: pathItem } },
    } as OpenAPI3;

    const output = await generate(document);

    expect(output).toContain('FlattenedDeepRequired<webhooks>["created"]["parameters"]["path"]');
    expect(output).toContain('FlattenedDeepRequired<components>["pathItems"]["Files"]["parameters"]["path"]');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS indexes the parameters of a path item once", async () => {
    const document = documentWithPaths({
      "/files.{format}": {
        parameters: [FORMAT],
        get: { responses: { 200: { description: "OK" } } },
      },
    } as OpenAPI3["paths"]);

    const output = await generate(document);

    expect(output).toContain(
      'ReadonlyArray<FlattenedDeepRequired<paths>["/files.{format}"]["parameters"]["path"]["format"]>',
    );
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps the index of an operation parameter", async () => {
    const document = documentWithPaths({
      "/files.{format}": {
        get: { parameters: [FORMAT], responses: { 200: { description: "OK" } } },
      },
    } as OpenAPI3["paths"]);

    const output = await generate(document);

    expect(output).toContain('FlattenedDeepRequired<paths>["/files.{format}"]["get"]["parameters"]["path"]["format"]>');
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
