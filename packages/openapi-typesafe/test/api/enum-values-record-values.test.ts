import { describe, expect, it } from "vitest";
import { defaultGeneratorPorts, generateDeclarations } from "../../src/api/openapi-ts.js";
import { astToString } from "../../src/index.js";
import type { GeneratorOptions } from "../../src/types.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--enum-values` arrays of an `additionalProperties` enum: `[string]` of the owner reads the
 * index signature, which also holds the types of the owner's properties and patterns.
 */

const VALUE_ENUM = { type: "string", enum: ["x", "y"] };
const VALUE_ONLY = { additionalProperties: VALUE_ENUM };

async function run(schemas: Record<string, unknown>, options: GeneratorOptions = {}) {
  const document = {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: { schemas },
  };
  const ports = await defaultGeneratorPorts({ silent: true });
  const logger = new RecordingLogger();
  const declarations = await generateDeclarations(
    JSON.stringify(document),
    { silent: true, enumValues: true, ...options },
    { ...ports, logger },
  );
  return { output: astToString(declarations), warnings: logger.messages("warn") };
}

const STATS = {
  type: "object",
  properties: { total: { type: "integer" } },
  additionalProperties: VALUE_ENUM,
};
const OWN_VALUES = 'export const statsValues: ReadonlyArray<"x" | "y"> = ["x", "y"];';

describe("--enum-values arrays of additionalProperties values", () => {
  it("generateDeclarations types the array by its values next to properties", async () => {
    const { output, warnings } = await run({ Stats: STATS });

    expect(output).toContain(OWN_VALUES);
    expect(warnings).toEqual([]);
    expect(typeErrorsOf(`${output}\nconst bad: (typeof statsValues)[number] = 5;`)).not.toEqual([]);
  });

  it("generateDeclarations types the array by its values next to patternProperties", async () => {
    const { output } = await run({
      Stats: { type: "object", patternProperties: { "^n": { type: "integer" } }, ...VALUE_ONLY },
    });

    expect(output).toContain(OWN_VALUES);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("generateDeclarations keeps [string] where the signature holds only the value", async () => {
    const { output } = await run({ Stats: { type: "object", ...VALUE_ONLY } });

    expect(output).toContain('ReadonlyArray<FlattenedDeepRequired<components>["schemas"]["Stats"][string]>');
  });

  it("generateDeclarations keeps [string] when every property is left out", async () => {
    const deprecated = { total: { type: "integer", deprecated: true } };
    const { output } = await run({ Stats: { ...STATS, properties: deprecated } }, { excludeDeprecated: true });

    expect(output).toContain('["Stats"][string]>');
  });

  it("generateDeclarations types an inline copy of a $ref to the value by its values", async () => {
    const { output } = await run(
      {
        Use: {
          type: "object",
          properties: { v: { $ref: "#/components/schemas/Stats/additionalProperties" } },
        },
        Stats: STATS,
      },
      { fix: ["ref-pointers"] },
    );

    expect(output).toContain(OWN_VALUES);
    expect(output).not.toContain('["Stats"][string]>');
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
