import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--enum` enums of `prefixItems` elements wherever the tuple is: each element with other values
 * gets its own enum, so no element accepts another element's values.
 */

function documentWith(schemas: Record<string, unknown>, paths: Record<string, unknown> = {}): OpenAPI3 {
  return { openapi: "3.1.0", info: { title: "t", version: "1" }, paths, components: { schemas } } as OpenAPI3;
}

async function generate(document: OpenAPI3, options: OpenAPITSOptions = { enum: true }): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

const SORT = { type: "array", prefixItems: [{ enum: ["asc", "desc"] }, { enum: ["name", "date"] }] };
const HOLDER = { Holder: { type: "object", properties: { sort: SORT } } };

describe("--enum tuple elements outside a component root", () => {
  it("openapiTS numbers the enum of a property tuple element with other values", async () => {
    const output = await generate(documentWith(HOLDER));

    expect(output).toMatch(/sort\?: \[\n\s+HolderSort,\n\s+HolderSort_2\n\s+\];/);
    expect(output.match(/export enum HolderSort /g)).toHaveLength(1);
  });

  it("openapiTS types a property tuple so an element rejects another element's value", async () => {
    const output = await generate(documentWith(HOLDER));
    const misuse = 'const sort: components["schemas"]["Holder"]["sort"] = ["date", "asc"];';

    expect(typeErrorsOf(`${output}\n${misuse}`)).not.toEqual([]);
  });

  it("openapiTS with --dedupe-enums numbers a property tuple element with other values", async () => {
    const output = await generate(documentWith(HOLDER), { enum: true, dedupeEnums: true });

    expect(output).toMatch(/sort\?: \[\n\s+HolderSort,\n\s+HolderSort_2\n\s+\];/);
  });

  it.each([
    ["an items schema", { Nested: { type: "array", items: SORT } }, "Nested"],
    ["an anyOf member", { InAnyOf: { anyOf: [SORT, { type: "string" }] } }, "InAnyOfAnyOf0"],
  ])("openapiTS numbers the enum of a tuple element in %s", async (_shape, schemas, name) => {
    const output = await generate(documentWith(schemas));

    expect(output).toContain(`export enum ${name}_2 {`);
    expect(output.match(new RegExp(`export enum ${name} `, "g"))).toHaveLength(1);
  });

  it("openapiTS numbers the enums of tuple elements in a parameter and a response", async () => {
    const response = { description: "ok", content: { "application/json": { schema: SORT } } };
    const get = { parameters: [{ name: "sort", in: "query", schema: SORT }], responses: { 200: response } };

    const output = await generate(documentWith({}, { "/items": { get } }));

    expect(output).toContain("export enum PathsItemsGetParametersQuerySort_2 {");
    expect(output).toContain("export enum PathsItemsGetResponses200ContentApplicationJson_2 {");
  });

  it("openapiTS types a $ref to a tuple element with the element's own enum", async () => {
    const ref = "#/components/schemas/Holder/properties/sort/prefixItems/1";

    const output = await generate(documentWith({ ...HOLDER, Ref: { $ref: ref } }));

    expect(output).toContain("Ref: HolderSort_2;");
    expect(output).not.toContain("HolderSort_3");
  });

  it("openapiTS types a $ref to an element of a tuple behind a $ref with the element's enum", async () => {
    const holder = { type: "object", properties: { sort: { $ref: "#/components/schemas/Sorting" } } };
    const ref = "#/components/schemas/Holder/properties/sort/prefixItems/1";

    const output = await generate(documentWith({ Sorting: SORT, Holder: holder, Ref: { $ref: ref } }));

    expect(output).toContain("Ref: Sorting_2;");
    expect(output).not.toContain("Sorting_3");
  });

  it("openapiTS shares the element enums of a property tuple and its inline allOf item", async () => {
    const inline = { type: "object", properties: { sort: SORT } };
    const schemas = { Holder: { ...HOLDER.Holder, allOf: [inline] } };

    const output = await generate(documentWith(schemas));

    expect(output.match(/export enum HolderSort(_\d+)? /g)).toEqual([
      "export enum HolderSort ",
      "export enum HolderSort_2 ",
    ]);
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("--enum numbers next to component names", () => {
  const schemas = {
    Pair: { type: "array", prefixItems: [{ enum: ["asc", "desc"] }, { enum: ["name", "date"] }] },
    Pair_2: { enum: ["zz"] },
  };

  it("openapiTS keeps a component enum's name that a tuple element's number would take", async () => {
    const output = await generate(documentWith(schemas));

    expect(output).toContain("Pair_2: Pair_2;");
    expect(output).toMatch(/Pair: \[\n\s+Pair,\n\s+Pair_3\n\s+\];/);
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("--enum numbers next to names other locations ask for", () => {
  it("openapiTS keeps a property's enum name that a tuple element's number would take", async () => {
    const holder = { ...HOLDER.Holder, properties: { sort: SORT, sort_2: { enum: ["k1"] } } };

    const output = await generate(documentWith({ Holder: holder }));

    expect(output).toMatch(/sort\?: \[\n\s+HolderSort,\n\s+HolderSort_3\n\s+\];/);
    expect(output).toContain("sort_2?: HolderSort_2;");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS numbers tuple elements by position when a $ref meets a later one first", async () => {
    const parameter = {
      name: "sort",
      in: "query",
      schema: { $ref: "#/components/schemas/Tup/prefixItems/1" },
    };
    const paths = { "/x": { get: { parameters: [parameter], responses: {} } } };

    const output = await generate(documentWith({ Tup: SORT }, paths));

    expect(output).toMatch(/Tup: \[\n\s+Tup,\n\s+Tup_2\n\s+\];/);
    expect(output).toContain("sort?: Tup_2;");
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
