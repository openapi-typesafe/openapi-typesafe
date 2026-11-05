import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** `--path-params-as-types` keys that a template also matches compile (roadmap R10.2). */

const ID = { name: "id", in: "path", required: true, schema: { type: "string" } };

function operation(description: string, parameters: unknown[] = [ID]) {
  return { get: { parameters, responses: { 200: { description } } } };
}

function documentWith(paths: Record<string, unknown>, components: object = {}): OpenAPI3 {
  return { openapi: "3.1.0", info: { title: "t", version: "1" }, paths, components } as OpenAPI3;
}

async function generate(
  paths: Record<string, unknown>,
  options: OpenAPITSOptions = {},
  components: object = {},
): Promise<string> {
  const document = documentWith(paths, components);
  return astToString(await openapiTS(document, { silent: true, pathParamsAsTypes: true, ...options }));
}

/** An operation with an ID whose 200 response is a component schema (upstream #1752). */
function operationOf(operationId: string, schema: string) {
  const content = { "application/json": { schema: { $ref: `#/components/schemas/${schema}` } } };
  return { get: { operationId, parameters: [ID], responses: { 200: { description: "ok", content } } } };
}

const objectWith = (name: string) => ({
  type: "object",
  required: [name],
  properties: { [name]: { type: "string" } },
});

/** Two nested paths whose operations differ only in a referenced response schema. */
const NESTED = {
  "/cases/{id}": operationOf("getCase", "CaseDetail"),
  "/cases/{id}/summary": operationOf("getCaseSummary", "CaseSummary"),
};

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

  it("openapiTS output with nested paths that differ in a referenced schema compiles", async () => {
    const schemas = { CaseDetail: objectWith("case_name"), CaseSummary: objectWith("case_summary") };

    const output = await generate(NESTED, {}, { schemas });

    expect(output).toContain("export type paths = {");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps one object when the referenced schemas are assignable", async () => {
    const detail = objectWith("case_name");
    const summary = { ...detail, properties: { ...detail.properties, extra: { type: "string" } } };

    const output = await generate(NESTED, {}, { schemas: { CaseDetail: detail, CaseSummary: summary } });

    expect(output).toContain("export interface paths {");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps the paths interface when the check cannot read a covered type", async () => {
    // `Record<string, never>` fits `{ [key: string]: unknown }`; the check does not model it, so
    // the output stays the original, which compiles.
    const schemas = {
      CaseDetail: { type: "object", additionalProperties: true },
      CaseSummary: { type: "object" },
    };

    const output = await generate(NESTED, {}, { schemas });

    expect(output).toContain("export interface paths {");
    expect(output).toContain("Record<string, never>");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS output with nested paths of recursive schemas terminates and compiles", async () => {
    const tree = (name: string) => ({
      type: "object",
      properties: { child: { $ref: `#/components/schemas/${name}` } },
    });

    const output = await generate(
      NESTED,
      {},
      { schemas: { CaseDetail: tree("CaseDetail"), CaseSummary: tree("CaseSummary") } },
    );

    expect(output).toContain("export interface paths {");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS output with paths that differ only in parameter names compiles", async () => {
    // Same types, so no cover check rejects them; still one object would repeat the signature.
    const code = `${await generate({ "/apps/{id}": operation("same"), "/apps/{key}": operation("same") })}
const app: paths["/apps/a"]["get"]["parameters"]["path"] = { id: "a" };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });

  it("openapiTS output with an array response under an object response compiles (magento)", async () => {
    const item = { type: "object", properties: { code: { type: "string" } } };
    const schemas = { CaseDetail: item, CaseSummary: { type: "array", items: item } };

    const output = await generate(NESTED, {}, { schemas });

    expect(output).toContain("export type paths = {");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS output with an open prefixItems tuple under an array response compiles", async () => {
    // `[string?, ...string[]]` may start with undefined, so it is no `string[]` (TS2413).
    const list = { type: "array", items: { type: "string" } };
    const schemas = { CaseDetail: list, CaseSummary: { ...list, prefixItems: [{ type: "string" }] } };

    const output = await generate(NESTED, { fix: ["prefix-items"] }, { schemas });

    expect(output).toContain("export type paths = {");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS output with query arrays of other enum values compiles (Microsoft Graph)", async () => {
    const select = (values: string[]) => ({
      name: "$select",
      in: "query",
      schema: { type: "array", items: { type: "string", enum: values } },
    });
    const paths = {
      "/drives/{id}/items": operation("items", [ID, select(["id", "name"])]),
      "/drives/{id}/list/items": operation("list", [ID, select(["id", "contentType"])]),
    };

    const output = await generate(paths);

    expect(output).toContain("export type paths = {");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps one object when a referenced path item is the same type", async () => {
    const paths = {
      "/cases/{id}": operationOf("getCase", "CaseDetail"),
      "/cases/{id}/copy": { get: { $ref: "#/paths/~1cases~1{id}/get" } },
    };
    const schemas = { CaseDetail: objectWith("case_name") };

    const output = await generate(paths, {}, { schemas });

    expect(output).toContain("export interface paths {");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS without pathParamsAsTypes keeps every path a property", async () => {
    expect(await generate(OVERLAPS, { pathParamsAsTypes: false })).toContain("export interface paths {");
  });
});
