import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** `--exclude-deprecated` keeps a deprecated schema that kept output references (roadmap R10.3). */

const OLD = { type: "object", deprecated: true, properties: { id: { type: "number" } } };
const OLD_REF = { $ref: "#/components/schemas/Old" };

function documentWith(schemas: Record<string, unknown>, paths: Record<string, unknown> = {}): OpenAPI3 {
  return { openapi: "3.1.0", info: { title: "t", version: "1" }, paths, components: { schemas } } as OpenAPI3;
}

async function generate(document: OpenAPI3): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, excludeDeprecated: true }));
}

function hasOld(output: string): boolean {
  return /^ {8}Old: \{/m.test(output);
}

const withItems = (items: unknown) => ({ type: "object", properties: { list: { type: "array", items } } });

describe("--exclude-deprecated references", () => {
  it("openapiTS keeps a deprecated schema that an array's items reference, and compiles", async () => {
    const output = await generate(documentWith({ Old: OLD, Droplet: withItems(OLD_REF) }));

    expect(hasOld(output)).toBe(true);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS still leaves out a deprecated schema that nothing references", async () => {
    expect(hasOld(await generate(documentWith({ Old: OLD, Droplet: withItems({ type: "string" }) })))).toBe(false);
  });

  it("openapiTS leaves out a deprecated schema that only a dropped property references", async () => {
    const droplet = { type: "object", properties: { old: OLD_REF, name: { type: "string" } } };

    expect(hasOld(await generate(documentWith({ Old: OLD, Droplet: droplet })))).toBe(false);
  });

  it("openapiTS leaves out a deprecated schema that only a deprecated schema references", async () => {
    const older = { ...withItems(OLD_REF), deprecated: true };

    expect(hasOld(await generate(documentWith({ Old: OLD, Older: older })))).toBe(false);
  });

  it("openapiTS keeps a chain of deprecated schemas a kept one starts", async () => {
    const older = { ...withItems(OLD_REF), deprecated: true };
    const schemas = { Old: OLD, Older: older, Droplet: withItems({ $ref: "#/components/schemas/Older" }) };

    const output = await generate(documentWith(schemas));

    expect(hasOld(output)).toBe(true);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps a deprecated schema that a kept operation's response references", async () => {
    const response = { description: "", content: { "application/json": { schema: OLD_REF } } };
    const paths = { "/old": { get: { responses: { 200: response } } } };

    expect(hasOld(await generate(documentWith({ Old: OLD }, paths)))).toBe(true);
  });

  it("openapiTS leaves out a deprecated schema that only a deprecated operation references", async () => {
    const response = { description: "", content: { "application/json": { schema: OLD_REF } } };
    const paths = { "/old": { get: { deprecated: true, responses: { 200: response } } } };

    expect(hasOld(await generate(documentWith({ Old: OLD }, paths)))).toBe(false);
  });

  it("openapiTS leaves out a deprecated schema that only a deprecated path item references", async () => {
    const response = { description: "", content: { "application/json": { schema: OLD_REF } } };
    const paths = { "/old": { deprecated: true, get: { responses: { 200: response } } } };

    expect(hasOld(await generate(documentWith({ Old: OLD }, paths)))).toBe(false);
  });

  it("openapiTS leaves out a deprecated schema that only a deprecated parameter references", async () => {
    const parameter = { name: "old", in: "query", deprecated: true, schema: OLD_REF };
    const paths = { "/old": { get: { parameters: [parameter], responses: {} } } };

    expect(hasOld(await generate(documentWith({ Old: OLD }, paths)))).toBe(false);
  });

  it("openapiTS leaves out a deprecated schema that only an example or an extension names", async () => {
    const droplet = { type: "object", example: { a: OLD_REF }, "x-old": OLD_REF, properties: {} };

    expect(hasOld(await generate(documentWith({ Old: OLD, Droplet: droplet })))).toBe(false);
  });

  it("openapiTS keeps a deprecated schema whose name is escaped in the $ref", async () => {
    const schemas = { "Old/v1": OLD, Droplet: withItems({ $ref: "#/components/schemas/Old~1v1" }) };

    const output = await generate(documentWith(schemas));

    expect(output).toContain('"Old/v1": {');
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
