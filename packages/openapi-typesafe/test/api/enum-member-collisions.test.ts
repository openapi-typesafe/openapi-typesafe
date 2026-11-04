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
