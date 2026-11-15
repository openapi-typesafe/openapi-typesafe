import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * With `exploded-query-objects` the keys of an exploded object parameter are keys of `query`, so
 * every place that reads such a parameter's type in the generated types reads it there: the
 * `--enum-values` arrays of its schemas and a `$ref` to the parameter.
 */

const STATUS = { type: "string", enum: ["available", "sold"] };
const FILTER = {
  name: "filter",
  in: "query",
  schema: { type: "object", properties: { status: STATUS } },
};
const PAGE = { name: "page", in: "query", schema: { type: "integer" } };
const OK = { 200: { description: "ok" } };

function documentWith(paths: Record<string, unknown>, schemas: object = {}): OpenAPI3 {
  return { openapi: "3.1.0", info: { title: "t", version: "1" }, paths, components: { schemas } } as OpenAPI3;
}

const getWith = (parameters: unknown[]) => ({ get: { parameters, responses: OK } });

async function generate(document: OpenAPI3, options: OpenAPITSOptions): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

const EXPLODED: OpenAPITSOptions = { enumValues: true, fix: ["exploded-query-objects"] };

describe("exploded-query-objects and the places that read a parameter's type", () => {
  it("openapiTS reads an exploded object's --enum-values array under query", async () => {
    const output = await generate(documentWith({ "/a": getWith([FILTER, PAGE]) }), EXPLODED);

    expect(output).toContain('FlattenedDeepRequired<paths>["/a"]["get"]["parameters"]["query"]["status"]>');
    expect(output).not.toContain('["filter"]');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it.each([
    ["exploded-query-objects", EXPLODED],
    ["all", { enumValues: true, fix: ["all"] } as OpenAPITSOptions],
  ])("openapiTS output with --enum-values and %s compiles for a path item's parameter", async (_name, options) => {
    const output = await generate(documentWith({ "/a": { parameters: [FILTER], ...getWith([]) } }), options);

    expect(output).toContain('FlattenedDeepRequired<paths>["/a"]["parameters"]["query"]["status"]>');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps the parameter's name in the pointer without the fix", async () => {
    const output = await generate(documentWith({ "/a": getWith([FILTER]) }), { enumValues: true });

    expect(output).toContain('["query"]["filter"]["status"]>');
  });

  it("openapiTS types a $ref to an operation's exploded parameter by its schema", async () => {
    const paths = { "/a": getWith([FILTER, PAGE]), "/b": getWith([{ $ref: "#/paths/~1a/get/parameters/0" }]) };

    const output = await generate(documentWith(paths), EXPLODED);

    expect(output).toMatch(/query\?: Partial<\{\n\s+\/\*\* @enum \{string\} \*\/\n\s+status\?: "available" \| "sold";/);
    expect(output.match(/export const \w+Values/g)).toEqual([
      "export const pathsAGetParametersQueryFilterStatusValues",
    ]);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types a $ref to a path item's exploded parameter with the path item's enum", async () => {
    const paths = {
      "/a": { parameters: [FILTER], ...getWith([]) },
      "/b": getWith([{ $ref: "#/paths/~1a/parameters/0" }]),
    };

    const output = await generate(documentWith(paths), { enum: true, fix: ["exploded-query-objects"] });

    expect(output.match(/export enum \w+/g)).toEqual([
      "export enum PathsAParametersParametersQueryFilterStatus",
      "export enum PathsAGetParametersQueryFilterStatus",
    ]);
    expect(output).toContain("status?: PathsAParametersParametersQueryFilterStatus;");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS gives a schema $ref into an exploded parameter the parameter's array", async () => {
    const ref = { $ref: "#/paths/~1a/get/parameters/0/schema/properties/status" };

    const output = await generate(documentWith({ "/a": getWith([FILTER]) }, { R: ref }), EXPLODED);

    expect(output.match(/export const \w+Values/g)).toEqual([
      "export const pathsAGetParametersQueryFilterStatusValues",
    ]);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps a $ref to a parameter's location and a schema $ref's array without the fix", async () => {
    const paths = { "/a": getWith([FILTER]), "/b": getWith([{ $ref: "#/paths/~1a/get/parameters/0" }]) };
    const schemas = { R: { $ref: "#/paths/~1a/get/parameters/0/schema/properties/status" } };

    const output = await generate(documentWith(paths, schemas), { enumValues: true });

    expect(output).toContain('filter?: NonNullable<paths["/a"]["get"]["parameters"]["query"]>["filter"];');
    expect(output.match(/export const \w+Values/g)).toEqual([
      "export const pathsAGetParametersQueryFilterStatusValues",
    ]);
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
