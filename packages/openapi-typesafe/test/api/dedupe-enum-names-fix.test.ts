import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `dedupe-enum-names` fix (ADR-021, upstream #1683). */

const VALUES = ["active", "inactive"];

/** An object schema with one inline enum property. */
function holder(property: string, values: readonly string[] = VALUES) {
  return { type: "object", properties: { [property]: { type: "string", enum: values } } };
}

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: { schemas },
  } as unknown as OpenAPI3;
}

const OPTIONS: OpenAPITSOptions = { silent: true, enum: true, dedupeEnums: true };

async function generate(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}) {
  return astToString(await openapiTS(documentWith(schemas), { ...OPTIONS, ...options }));
}

async function fixed(schemas: Record<string, unknown>) {
  return generate(schemas, { fix: ["dedupe-enum-names"] });
}

function enumNames(output: string): string[] {
  return [...output.matchAll(/export enum (\w+)/g)].map((match) => match[1] as string);
}

describe("dedupe-enum-names fix", () => {
  it("openapiTS without the fix names a shared enum after the first schema in the document", async () => {
    const before = await generate({ Pet: holder("state"), Owner: holder("status") });
    const after = await generate({ Alpha: holder("mode"), Pet: holder("state"), Owner: holder("status") });

    expect(enumNames(before)).toEqual(["PetState"]);
    expect(enumNames(after)).toEqual(["AlphaMode"]);
  });

  it("openapiTS with the fix prefers a component schema that is the enum itself", async () => {
    const output = await fixed({
      Pet: holder("state"),
      Status: { type: "string", enum: VALUES },
    });

    expect(enumNames(output)).toEqual(["Status"]);
    expect(output).toContain("state?: Status;");
  });

  it("openapiTS with the fix takes the shortest name, whatever the document order", async () => {
    const first = await fixed({ LongOwner: holder("status"), Pet: holder("state") });
    const second = await fixed({ Pet: holder("state"), LongOwner: holder("status") });

    expect(enumNames(first)).toEqual(["PetState"]);
    expect(enumNames(second)).toEqual(["PetState"]);
  });

  it("openapiTS with the fix breaks a tie in length by code-unit order", async () => {
    const output = await fixed({ Pet: holder("state"), Cat: holder("state") });

    expect(enumNames(output)).toEqual(["CatState"]);
    expect(output).toContain("state?: CatState;");
  });

  it("openapiTS with the fix keeps a shared name when a schema with a longer name is added first", async () => {
    const before = await fixed({ Pet: holder("state") });
    const after = await fixed({ Alpha: holder("modeOfAlpha"), Pet: holder("state") });

    expect(enumNames(before)).toEqual(["PetState"]);
    expect(enumNames(after)).toEqual(["PetState"]);
  });

  it("openapiTS with the fix skips a name another enum already has", async () => {
    // `Pet-` and `Pet` both give `PetState`, for enums with other values.
    const output = await fixed({
      "Pet-": holder("state", ["x"]),
      Zebra: holder("state", ["x"]),
      Pet: holder("state"),
      Longer: holder("state"),
    });

    expect(enumNames(output)).toEqual(["ZebraState", "PetState"]);
  });

  it("openapiTS with the fix keeps enums with other values apart", async () => {
    const output = await fixed({ Pet: holder("state"), Owner: holder("state", ["x", "y"]) });

    expect(enumNames(output)).toEqual(["PetState", "OwnerState"]);
  });

  it("openapiTS with the fix changes nothing without --dedupe-enums", async () => {
    const schemas = { Pet: holder("state"), Owner: holder("status") };

    const output = await generate(schemas, { dedupeEnums: false, fix: ["dedupe-enum-names"] });

    expect(output).toBe(await generate(schemas, { dedupeEnums: false }));
  });

  it("openapiTS output with the fix compiles and both properties take the shared enum", async () => {
    const code = `${await fixed({ LongOwner: holder("status"), Pet: holder("state") })}
const owner: components["schemas"]["LongOwner"] = { status: PetState.active };
const pet: components["schemas"]["Pet"] = { state: PetState.inactive };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });
});
