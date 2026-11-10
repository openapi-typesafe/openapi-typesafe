import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** `const: null` is the value null (JSON Schema §6.1.3). */

async function generate(value: Record<string, unknown>, openapi = "3.1.0"): Promise<string> {
  const document = {
    openapi,
    info: { title: "t", version: "1" },
    paths: {},
    components: {
      schemas: { Cleared: { type: "object", required: ["value"], properties: { value } } },
    },
  } as unknown as OpenAPI3;
  return astToString(await openapiTS(document, { silent: true }));
}

describe("const null", () => {
  it.each([[{ const: null }], [{ type: "null", const: null }], [{ type: ["string", "null"], const: null }]])(
    "openapiTS types %j as null",
    async (value) => {
      expect(await generate(value)).toContain("value: null;");
    },
  );

  it("openapiTS types an OpenAPI 3.0 nullable const null as null", async () => {
    expect(await generate({ type: "string", nullable: true, const: null }, "3.0.3")).toContain("value: null;");
  });

  it("openapiTS output takes null and no other value", async () => {
    const output = await generate({ const: null });

    const usage = `const cleared: components["schemas"]["Cleared"] = { value: null };
// @ts-expect-error a const null takes no string
const other: components["schemas"]["Cleared"] = { value: "x" };`;
    expect(typeErrorsOf(`${output}\n${usage}`)).toEqual([]);
  });
});
