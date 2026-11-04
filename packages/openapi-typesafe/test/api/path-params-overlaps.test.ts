import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** `--path-params-as-types` keys that a template also matches compile (roadmap R10.2). */

const ID = { name: "id", in: "path", required: true, schema: { type: "string" } };

function operation(description: string, parameters: unknown[] = [ID]) {
  return { get: { parameters, responses: { 200: { description } } } };
}

function documentWith(paths: Record<string, unknown>): OpenAPI3 {
  return { openapi: "3.1.0", info: { title: "t", version: "1" }, paths } as OpenAPI3;
}

async function generate(paths: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(documentWith(paths), { silent: true, pathParamsAsTypes: true, ...options }));
}

const OVERLAPS = { "/apps/{id}": operation("app"), "/apps/regions": operation("regions", []) };

describe("--path-params-as-types overlaps", () => {
  it("openapiTS without an overlap keeps the paths interface", async () => {
    const output = await generate({ "/apps/{id}": operation("app"), "/users": operation("users", []) });

    expect(output).toContain("export interface paths {");
  });

  it("openapiTS moves a signature that covers a literal path into its own object", async () => {
    const output = await generate(OVERLAPS);

    expect(output).toMatch(
      /^export type paths = \{\n {4}"\/apps\/regions": \{[\s\S]*^\} & \{\n {4}\[path: `\/apps\/\$\{string\}`\]/m,
    );
  });

  it("openapiTS output with overlapping paths compiles and keeps each key's type", async () => {
    const code = `${await generate(OVERLAPS)}
const regions: paths["/apps/regions"]["get"]["parameters"]["path"] = undefined;
const app: paths[\`/apps/\${string}\`]["get"]["parameters"]["path"] = { id: "a" };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });

  it("openapiTS output with a template that covers a longer template compiles", async () => {
    const paths = { "/apps/{id}": operation("app"), "/apps/{id}/restart": operation("restart") };

    expect(typeErrorsOf(await generate(paths))).toEqual([]);
  });

  it("openapiTS keeps one object for a $ref path item, which the check cannot read", async () => {
    const paths = { "/apps/{id}": operation("app"), "/apps/latest": { $ref: "#/paths/~1apps~1{id}" } };

    const output = await generate(paths);

    expect(output).toContain("export interface paths {");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps one object when the covered type is assignable, as the original", async () => {
    const SUB = { name: "sub", in: "path", required: true, schema: { type: "string" } };
    const paths = { "/apps/{id}": operation("app"), "/apps/{id}/{sub}": operation("sub", [ID, SUB]) };

    const output = await generate(paths);

    expect(output).toContain("export interface paths {");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS moves a signature whose covered path has another method", async () => {
    const restart = { post: { parameters: [ID], responses: { 200: { description: "restart" } } } };
    const paths = { "/apps/{id}": operation("app"), "/apps/{id}/restart": restart };

    const output = await generate(paths);

    expect(output).toContain("export type paths = {");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS moves a signature that needs a method the covered path does not have", async () => {
    const both = { ...operation("app"), delete: operation("remove").get };
    const paths = { "/apps/{id}": both, "/apps/{id}/{sub}": operation("sub") };

    expect(await generate(paths)).toContain("export type paths = {");
  });

  it("openapiTS with exportType and immutable keeps readonly members in the intersection", async () => {
    const output = await generate(OVERLAPS, { exportType: true, immutable: true });

    expect(output).toContain(`readonly [path: \`/apps/\${string}\`]: {`);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS without pathParamsAsTypes keeps every path a property", async () => {
    expect(await generate(OVERLAPS, { pathParamsAsTypes: false })).toContain("export interface paths {");
  });
});
