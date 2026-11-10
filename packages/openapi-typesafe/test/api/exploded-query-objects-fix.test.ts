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

describe("exploded-query-objects fix with index signatures", () => {
  const LABELS = { type: "object", additionalProperties: { type: "string" } };
  const PAGE = { name: "page", in: "query", schema: { type: "integer" } };
  const labels = (schema: object = LABELS) => ({ name: "labels", in: "query", schema });
  const QUERY = 'type Query = NonNullable<paths["/posts"]["get"]["parameters"]["query"]>;';

  it("openapiTS widens the index signature by the types of the other query keys", async () => {
    const output = await fixed([PAGE, labels()]);

    expect(output).toContain("} & Partial<{\n                    [key: string]: string | number | undefined;");
  });

  it("openapiTS output accepts the other parameters next to the object's keys", async () => {
    const code = `${await fixed([PAGE, labels()])}
${QUERY}
const query: Query = { page: 2, team: "red" };
// @ts-expect-error a key of the object still takes only the value types of query
const wrong: Query = { team: true };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });

  it("openapiTS keeps an index signature as it is without other query keys", async () => {
    expect(await fixed([labels()])).toContain("query?: Partial<{\n                    [key: string]: string;");
  });

  it("openapiTS writes out a referenced schema with an index signature next to other keys", async () => {
    const schemas = { GetPosts: GET_POSTS, Labels: LABELS };
    const code = `${await fixed([PAGE, labels({ $ref: "#/components/schemas/Labels" })], { schemas })}
${QUERY}
const query: Query = { page: 2, team: "red" };`;

    expect(code).toContain("} & Partial<{\n                    [key: string]: string | number | undefined;");
    expect(typeErrorsOf(code)).toEqual([]);
  });

  it("openapiTS writes out a referenced parameter with an index signature next to other keys", async () => {
    const parameters = { Labels: labels() };
    const code = `${await fixed([PAGE, { $ref: "#/components/parameters/Labels" }], { parameters })}
${QUERY}
const query: Query = { page: 2, team: "red" };`;

    expect(code).toContain("} & Partial<{\n                    [key: string]: string | number | undefined;");
    expect(typeErrorsOf(code)).toEqual([]);
  });

  it("openapiTS keeps a referenced object without an index signature as a reference", async () => {
    expect(await fixed([PAGE, posts()])).toContain(`} & ${PARTIAL_POSTS};`);
  });

  it("openapiTS widens each of two exploded objects by the keys of the other", async () => {
    const code = `${await fixed([labels(), { name: "filter", in: "query", schema: GET_POSTS }])}
${QUERY}
const query: Query = { team: "red", page: 1 };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });

  it("openapiTS keeps a referenced object with an index signature as a reference without other keys", async () => {
    const schemas = { GetPosts: GET_POSTS, Labels: LABELS };

    const output = await fixed([labels({ $ref: "#/components/schemas/Labels" })], { schemas });

    expect(output).toContain(QUERY_OF('Partial<components["schemas"]["Labels"]>'));
  });

  it("openapiTS writes out a referenced object next to another exploded object only", async () => {
    const schemas = { GetPosts: GET_POSTS, Labels: LABELS };
    const exploded = [labels({ $ref: "#/components/schemas/Labels" }), posts()];

    const output = await fixed(exploded, { schemas });

    expect(output).toContain("query?: Partial<{\n                    [key: string]: string | PropertyValues<");
  });

  it("openapiTS widens the index signature of a composed object", async () => {
    const composed = { allOf: [{ properties: { tag: { type: "string" } } }, LABELS] };
    const code = `${await fixed([PAGE, labels(composed)])}
${QUERY}
const query: Query = { page: 2, tag: "a", team: "red" };`;

    expect(code).toContain("[key: string]: string | number | undefined;");
    expect(typeErrorsOf(code)).toEqual([]);
  });

  it("openapiTS writes out a referenced composed object with an index signature", async () => {
    const schemas = { GetPosts: GET_POSTS, Labels: { allOf: [{ properties: { tag: { type: "string" } } }, LABELS] } };

    const output = await fixed([PAGE, labels({ $ref: "#/components/schemas/Labels" })], { schemas });

    expect(output).toContain("[key: string]: string | number | undefined;");
  });

  it("openapiTS widens the index signature of each object of a union", async () => {
    const union = { oneOf: [LABELS, { type: "object", additionalProperties: { type: "boolean" } }] };

    const output = await fixed([PAGE, labels(union)]);

    expect(output).toContain("[key: string]: boolean | number | undefined;");
  });

  it("openapiTS leaves an index signature of unknown values as it is", async () => {
    const output = await fixed([PAGE, labels({ type: "object", additionalProperties: true })]);

    expect(output).toContain("[key: string]: unknown;");
  });
});
