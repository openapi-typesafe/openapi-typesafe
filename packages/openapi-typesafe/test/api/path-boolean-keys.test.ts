import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** `--path-params-as-types` with `boolean` path parameters: `${boolean}` takes no index signature. */

const parameter = (name: string, type: string) => ({ name, in: "path", required: true, schema: { type } });
const operation = (...parameters: unknown[]) => ({
  get: { parameters, responses: { 200: { description: "ok" } } },
});

async function generate(paths: Record<string, unknown>, pathParamsAsTypes = true): Promise<string> {
  const document = { openapi: "3.1.0", info: { title: "t", version: "1" }, paths } as OpenAPI3;
  return astToString(await openapiTS(document, { silent: true, pathParamsAsTypes }));
}

const FLAGS = { "/flags/{enabled}": operation(parameter("enabled", "boolean")) };
const MIXED = { "/a/{n}/b/{on}": operation(parameter("n", "integer"), parameter("on", "boolean")) };

describe("--path-params-as-types boolean path parameters", () => {
  it("openapiTS writes a boolean parameter as the keys true and false", async () => {
    const output = await generate(FLAGS);

    expect(output).toContain('    "/flags/true": {');
    expect(output).toContain('    "/flags/false": {');
    expect(output).not.toContain("boolean}");
  });

  it("openapiTS keeps the other placeholders in each key", async () => {
    const output = await generate(MIXED);

    expect(output).toContain(`[path: \`/a/\${number}/b/true\`]: {`);
    expect(output).toContain(`[path: \`/a/\${number}/b/false\`]: {`);
  });

  it("openapiTS writes 2ⁿ keys for n boolean parameters", async () => {
    const output = await generate({
      "/{x}/{y}": operation(parameter("x", "boolean"), parameter("y", "boolean")),
    });

    for (const key of ["/true/true", "/true/false", "/false/true", "/false/false"]) {
      expect(output).toContain(`"${key}": {`);
    }
  });

  it("openapiTS output with boolean keys compiles and finds the path by its URL", async () => {
    const code = `${await generate({ ...FLAGS, ...MIXED })}
const url = "/flags/true" as const;
type Flags = paths[typeof url]["get"]["parameters"]["path"];
const flags: Flags = { enabled: true };
type Mixed = paths["/a/1/b/false"]["get"]["parameters"]["path"];
const mixed: Mixed = { n: 1, on: false };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });

  it("openapiTS keeps a path of the document that a boolean key repeats", async () => {
    const output = await generate({ ...FLAGS, "/flags/true": operation() });

    expect(output.match(/"\/flags\/true": \{/g)).toHaveLength(1);
    expect(output).toContain('    "/flags/false": {');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS writes the keys of the first of two paths that give the same URLs", async () => {
    const output = await generate({ ...FLAGS, "/flags/{on}": operation(parameter("on", "boolean")) });

    expect(output.match(/"\/flags\/true": \{/g)).toHaveLength(1);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS output with a $ref into a boolean path compiles", async () => {
    const code = await generate({ ...FLAGS, "/toggles/{enabled}": { $ref: "#/paths/~1flags~1%7Benabled%7D" } });

    expect(code).toContain(`"/toggles/{enabled}": paths[\`/flags/\${boolean}\`];`);
    expect(typeErrorsOf(code)).toEqual([]);
  });

  it("openapiTS keeps the URL without --path-params-as-types", async () => {
    expect(await generate(FLAGS, false)).toContain('"/flags/{enabled}": {');
  });
});
