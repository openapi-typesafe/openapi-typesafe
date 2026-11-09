import { describe, expect, it } from "vitest";
import openapiTS, { astToString } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * Redocly 1.x bundles an external `$ref` into a component named after the raw pointer segment
 * (`a~0b`, `50%`) and points to it without escaping, so the ref read as a JSON Pointer names a
 * different key (`a~b`) or is malformed (`50%`). The loader repairs these refs (PB-14).
 */

const MAIN = new URL("../fixtures/pointer-escapes/main.yaml", import.meta.url);

async function generated(): Promise<string> {
  return astToString(await openapiTS(MAIN, { silent: true }));
}

describe("bundled refs with escaped pointer segments", () => {
  it("openapiTS with ~0, ~1 and %25 in external refs generates types that compile", async () => {
    const usage = [
      'const isOn: components["schemas"]["Tilde"] = true;',
      'const count: components["schemas"]["Slash"] = 1;',
      'const half: components["schemas"]["Percent"] = "half";',
    ].join("\n");

    expect(typeErrorsOf(`${await generated()}\n${usage}`)).toEqual([]);
  });

  it("openapiTS points each repaired ref at the bundled component key", async () => {
    const output = await generated();

    expect(output).toContain('Tilde: components["schemas"]["a~0b"];');
    expect(output).toContain('Percent: components["schemas"]["50%"];');
  });

  it("openapiTS with a malformed % escape in a local $ref fails with SCHEMA_REF_INVALID", async () => {
    const document = {
      openapi: "3.1.0",
      info: { title: "t", version: "1" },
      paths: {},
      components: { schemas: { "50%": { type: "string" }, Use: { $ref: "#/components/schemas/50%" } } },
    };

    const error = await openapiTS(document as never, { silent: true }).catch((caught: unknown) => caught);

    expect(error).toMatchObject({
      code: "SCHEMA_REF_INVALID",
      details: { reason: "malformed", refs: [{ pointer: "#/components/schemas/Use" }] },
    });
    expect((error as Error).message).toContain('"#/components/schemas/50%"');
  });
});

describe("discriminator mappings to local schemas with escaped keys", () => {
  const document = {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: {
      schemas: {
        "a~b": { type: "object", required: ["kind"], properties: { kind: { type: "string" } } },
        "c/d": { type: "object", required: ["kind"], properties: { kind: { type: "string" } } },
        Pet: {
          oneOf: [{ $ref: "#/components/schemas/a~0b" }, { $ref: "#/components/schemas/c~1d" }],
          discriminator: {
            propertyName: "kind",
            mapping: { tilde: "#/components/schemas/a~0b", slash: "#/components/schemas/c~1d" },
          },
        },
      },
    },
  };

  it("openapiTS writes each mapped schema once, under its own key", async () => {
    const output = astToString(await openapiTS(structuredClone(document) as never, { silent: true }));

    expect(output).not.toContain('"a~0b": {');
    expect(output).not.toContain('"c~1d": {');
    expect(output).toContain('kind: "tilde";');
    expect(output).toContain('Pet: components["schemas"]["a~b"] | components["schemas"]["c/d"];');
  });
});
