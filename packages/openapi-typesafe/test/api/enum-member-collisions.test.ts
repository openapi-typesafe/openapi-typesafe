import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** `--enum` member names that come out the same are numbered (roadmap R10.1, backlog 27). */

function documentWith(schemas: Record<string, unknown>, paths: Record<string, unknown> = {}): OpenAPI3 {
  return { openapi: "3.1.0", info: { title: "t", version: "1" }, paths, components: { schemas } } as OpenAPI3;
}

async function generate(document: OpenAPI3, options: OpenAPITSOptions = { enum: true }): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

const REACTIONS = { Reaction: { type: "string", enum: ["reactions-+1", "reactions--1", "laugh"] } };

describe("--enum member collisions", () => {
  it("openapiTS numbers a member name that two values share", async () => {
    const output = await generate(documentWith(REACTIONS));

    expect(output).toContain(
      '    reactions_1 = "reactions-+1",\n    reactions_1_2 = "reactions--1",\n    laugh = "laugh"',
    );
  });

  it("openapiTS output with shared member names compiles", async () => {
    expect(typeErrorsOf(await generate(documentWith(REACTIONS)))).toEqual([]);
  });

  it("openapiTS skips a number whose name another member already has", async () => {
    const output = await generate(documentWith({ Keys: { type: "string", enum: ["a-b", "a+b", "a_b_2", "a b"] } }));

    expect(output).toContain('    a_b = "a-b",\n    aPlusb = "a+b",\n    a_b_2 = "a_b_2",\n    a_b_3 = "a b"');
  });

  it("openapiTS numbers a quoted name inside the quotes", async () => {
    const schemas = { Signs: { type: "string", enum: ["x", "y"], "x-enum-varnames": ["+", "+"] } };

    const output = await generate(documentWith(schemas));

    expect(output).toContain('    "+" = "x",\n    "+_2" = "y"');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS numbers ApiPaths members that sanitizing makes the same", async () => {
    const operation = (operationId: string) => ({ get: { operationId, responses: {} } });
    const document = documentWith({}, { "/a": operation("get-user"), "/b": operation("get_user") });

    const output = await generate(document, { makePathsEnum: true });

    expect(output).toContain('    get_user = "/a",\n    get_user_2 = "/b"');
  });
});

describe("--enum declarations of one name", () => {
  const enumOf = (values: string[]) => ({ type: "string", enum: values });
  /** A property and an inline `allOf` item of one schema are typed at one location, `IssueState`. */
  function issueWith(own: string[], inline: string[]) {
    return {
      Issue: {
        type: "object",
        properties: { state: enumOf(own) },
        allOf: [{ type: "object", properties: { state: enumOf(inline) } }],
      },
    };
  }

  it("openapiTS declares a member that an earlier declaration of the name has once", async () => {
    const output = await generate(documentWith(issueWith(["open", "closed"], ["closed", "open"])));

    expect(output.match(/export enum IssueState /g)).toHaveLength(1);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS adds only the new members to a later declaration of the name", async () => {
    const output = await generate(documentWith(issueWith(["open", "closed"], ["closed", "draft"])));

    expect(output).toContain('export enum IssueState {\n    open = "open",\n    closed = "closed"\n}');
    expect(output).toContain('export enum IssueState {\n    draft = "draft"\n}');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS numbers a member whose name an earlier declaration gives another value", async () => {
    const output = await generate(documentWith(issueWith(["a-b"], ["a b"])));

    expect(output).toContain('export enum IssueState {\n    a_b_2 = "a b"\n}');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps later declarations whose members do not repeat", async () => {
    const output = await generate(documentWith(issueWith(["open"], ["closed"])));

    expect(output).toContain(
      'export enum IssueState {\n    open = "open"\n}\nexport enum IssueState {\n    closed = "closed"\n}',
    );
  });
});

describe("--enum tuple elements", () => {
  const enumOf = (values: string[]) => ({ type: "string", enum: values });
  const tuple = (...elements: string[][]) => ({ type: "array", prefixItems: elements.map(enumOf) });

  it("openapiTS numbers the enum of a prefixItems element with other values", async () => {
    const output = await generate(documentWith({ Pair: tuple(["asc", "desc"], ["name", "date"]) }));

    expect(output).toContain("Pair: [\n            Pair,\n            Pair_2\n        ];");
    expect(output).toContain('export enum Pair_2 {\n    name = "name",\n    date = "date"\n}');
    expect(output.match(/export enum Pair /g)).toHaveLength(1);
    const misuse = 'const sort: components["schemas"]["Pair"][0] = Pair_2.name;';
    expect(typeErrorsOf(`${output}\n${misuse}`)).not.toEqual([]);
  });

  it("openapiTS shares one enum among elements of the same values", async () => {
    const output = await generate(documentWith({ Same: tuple(["x", "y"], ["y", "x"]) }));

    expect(output).toContain("Same: [\n            Same,\n            Same\n        ];");
    expect(output.match(/export enum Same/g)).toHaveLength(1);
  });

  it("openapiTS with prefix-items numbers the enum of an element with other values", async () => {
    const document = documentWith({ Pair: tuple(["asc"], ["name"]) });

    const output = await generate(document, { enum: true, fix: ["prefix-items"] });

    expect(output).toMatch(/Pair: \[\n\s+Pair\?,\n\s+Pair_2\?,/);
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
