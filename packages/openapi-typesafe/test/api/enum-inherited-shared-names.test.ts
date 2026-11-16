import { describe, expect, it } from "vitest";
import { createDocumentRun } from "../../src/api/document-run.js";
import { defaultGeneratorPorts } from "../../src/api/openapi-ts.js";
import transformSchema from "../../src/api/transform-schema.js";
import { astToString, type GeneratorOptions, type OpenAPI3 } from "../../src/index.js";

/**
 * `--enum --dedupe-enums` names a shared enum by the first schema that declares its values, also
 * when an `allOf` item that narrows an inherited enum asks for its base's enum first (ADR-021).
 */

const enumOf = (values: string[]) => ({ type: "string", enum: values });
const objectOf = (properties: Record<string, unknown>) => ({ type: "object", properties });

/** `Cat` comes first and asks for `Pet`'s enum; `Kind` is the first schema that declares it. */
const SCHEMAS: Record<string, unknown> = {
  Cat: { allOf: [{ $ref: "#/components/schemas/Pet" }, objectOf({ mode: enumOf(["a"]) })] },
  Kind: enumOf(["a", "b"]),
  Pet: objectOf({ mode: enumOf(["a", "b"]) }),
};
const DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "t", version: "1" },
  paths: {},
  components: { schemas: SCHEMAS },
} as OpenAPI3;

async function outputOf(options: GeneratorOptions): Promise<string> {
  const ports = await defaultGeneratorPorts(options);
  const { schema, ctx } = await createDocumentRun(DOCUMENT, options, ports);
  return astToString(transformSchema(schema, ctx));
}

describe("--enum --dedupe-enums with an allOf item that narrows an inherited enum", () => {
  it.each([
    ["the defaults", {}],
    ["--enum-values", { enumValues: true }],
  ])("openapiTS names the shared enum by its first declaring schema with %s", async (_, extra) => {
    const output = await outputOf({ silent: true, enum: true, dedupeEnums: true, ...extra });

    expect(output).toContain('export enum Kind {\n    a = "a",\n    b = "b"\n}');
    expect(output).toMatch(/mode\?: Kind\.a;/);
    expect(output).not.toContain("PetMode");
  });
});
