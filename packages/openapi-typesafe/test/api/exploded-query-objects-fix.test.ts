import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `exploded-query-objects` fix (ADR-021, upstream #2361). */

const GET_POSTS = {
  type: "object",
  additionalProperties: false,
  properties: { page: { type: "integer" }, limit: { type: "integer" } },
};
const POSTS_REF = { $ref: "#/components/schemas/GetPosts" };
const SORT = { name: "sort", in: "query", schema: { type: "string" } };

function documentWith(parameters: unknown[], components: object = {}): OpenAPI3 {
  return {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: { "/posts": { get: { parameters, responses: { 200: { description: "ok" } } } } },
    components: { schemas: { GetPosts: GET_POSTS }, ...components },
  } as OpenAPI3;
}

async function generate(document: OpenAPI3, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

async function fixed(parameters: unknown[], components: object = {}): Promise<string> {
  return generate(documentWith(parameters, components), { fix: ["exploded-query-objects"] });
}

const posts = (extra: object = {}) => ({ name: "GetPosts", in: "query", schema: POSTS_REF, ...extra });
const QUERY_OF = (type: string) => `query?: ${type};`;
const PARTIAL_POSTS = 'Partial<components["schemas"]["GetPosts"]>';

describe("exploded-query-objects fix", () => {
  it("openapiTS without the fix keeps the object under the parameter's name", async () => {
    const output = await generate(documentWith([posts()]));

    expect(output).toContain('GetPosts?: components["schemas"]["GetPosts"];');
  });

  it("openapiTS with the fix makes the object's keys the query keys", async () => {
    const output = await fixed([posts()]);

    expect(output).toContain(QUERY_OF(PARTIAL_POSTS));
    expect(output).not.toContain("GetPosts?:");
  });

  it("openapiTS with the fix reads explicit form and explode true the same way", async () => {
    expect(await fixed([posts({ style: "form", explode: true })])).toContain(QUERY_OF(PARTIAL_POSTS));
  });

  it("openapiTS with the fix intersects the other query parameters with the object", async () => {
    const output = await fixed([SORT, posts()]);

    expect(output).toContain(`query?: {\n                    sort?: string;\n                } & ${PARTIAL_POSTS};`);
  });

  it("openapiTS with the fix keeps a required parameter's object as it is, and query required", async () => {
    const output = await fixed([posts({ required: true })]);

    expect(output).toContain('query: components["schemas"]["GetPosts"];');
  });

  it("openapiTS with the fix types an inline object schema", async () => {
    const inline = { name: "filter", in: "query", schema: GET_POSTS };

    expect(await fixed([inline])).toContain("query?: Partial<{\n                    page?: number;");
  });

  it("openapiTS with the fix follows a referenced parameter", async () => {
    const parameters = { Posts: posts() };

    const output = await fixed([{ $ref: "#/components/parameters/Posts" }], { parameters });

    expect(output).toContain(QUERY_OF('Partial<components["parameters"]["Posts"]>'));
  });

  it("openapiTS with the fix keeps the name where it is sent", async () => {
    const deep = posts({ style: "deepObject", explode: true });
    const unexploded = posts({ explode: false });
    const array = { name: "ids", in: "query", schema: { type: "array", items: { type: "string" } } };
    const header = { ...posts(), in: "header" };

    for (const parameter of [deep, unexploded, array, SORT]) {
      expect(await fixed([parameter])).not.toContain("Partial<");
    }
    expect(await fixed([header])).toContain('GetPosts?: components["schemas"]["GetPosts"];');
  });

  it("openapiTS with the fix reads object schemas without type, with null and in compositions", async () => {
    const schemas = [
      { properties: { page: { type: "integer" } } },
      { type: ["object", "null"], properties: { page: { type: "integer" } } },
      { allOf: [POSTS_REF, { type: "object", properties: { sort: { type: "string" } } }] },
      { oneOf: [POSTS_REF, POSTS_REF] },
    ];

    for (const schema of schemas) {
      expect(await fixed([{ name: "p", in: "query", schema }])).toContain("query?: Partial<");
    }
  });

  it("openapiTS with the fix does not read a schema that may not be an object", async () => {
    const schemas = [{ type: ["object", "string"] }, { anyOf: [POSTS_REF, { type: "string" }] }, {}, true];

    for (const schema of schemas) {
      expect(await fixed([{ name: "p", in: "query", schema }])).toContain("p?:");
    }
  });

  it("openapiTS output with the fix accepts the object's keys and rejects the old shape", async () => {
    const code = `${await fixed([SORT, posts()])}
type Query = NonNullable<paths["/posts"]["get"]["parameters"]["query"]>;
const query: Query = { sort: "new", page: 1, limit: 10 };
// @ts-expect-error the parameter's name is not a query key
const old: Query = { GetPosts: { page: 1 } };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });
});
