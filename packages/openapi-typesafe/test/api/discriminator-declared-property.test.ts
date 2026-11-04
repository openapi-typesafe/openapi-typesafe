import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * A schema that inherits a discriminator through `allOf` and declares the property itself (the
 * Apple SiriKit Cloud Media API): the object type got the property twice, `class: "Child";` and
 * `class?: "Child";`, which does not compile (TS2300).
 */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const SCHEMAS = {
  Base: {
    type: "object",
    required: ["class"],
    properties: { class: { type: "string" } },
    discriminator: { propertyName: "class" },
  },
  Child: {
    allOf: [ref("Base")],
    properties: {
      class: { type: "string", enum: ["Child"], description: "The class name." },
      size: { type: "number" },
    },
  },
};

async function generate(options: OpenAPITSOptions = {}): Promise<string> {
  const document = {
    openapi: "3.0.3",
    info: { title: "t", version: "1" },
    paths: {},
    components: { schemas: SCHEMAS },
  };
  return astToString(await openapiTS(structuredClone(document) as unknown as OpenAPI3, { silent: true, ...options }));
}

describe("a discriminator property the schema declares itself", () => {
  it.each([[{}], [{ enum: true }], [{ immutable: true }]])("openapiTS with %j declares it once", async (options) => {
    const output = await generate(options);

    expect(output.match(/ class\??: /g)).toHaveLength(2);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps the declared property, required, with its description", async () => {
    const output = await generate();

    expect(output).toContain(`             * @description The class name.
             * @enum {string}
             */
            class: "Child";
            size?: number;`);
  });

  it("openapiTS gives a type that a value with the declared value has", async () => {
    const code = `${await generate({ enum: true })}
const child: components["schemas"]["Child"] = { class: ChildClass.Child, size: 1 };
// @ts-expect-error the property is required
const missing: components["schemas"]["Child"] = { size: 1 };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });
});
