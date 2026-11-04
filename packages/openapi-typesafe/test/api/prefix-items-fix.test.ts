import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `prefix-items` fix (ADR-021, upstream #1892, PR #1893; JSON Schema 2020-12 §10.3.1). */

const NUMBER = { type: "number" };
const STRING = { type: "string" };

function documentWith(point: Record<string, unknown>): OpenAPI3 {
  return {
    openapi: "3.1.0",
    info: { title: "t", version: "1" },
    paths: {},
    components: { schemas: { Point: { type: "array", prefixItems: [NUMBER, STRING], ...point } } },
  } as OpenAPI3;
}

async function generate(point: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(documentWith(point), { silent: true, ...options }));
}

async function fixed(point: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return generate(point, { fix: ["prefix-items"], ...options });
}

/** The printed `Point` type, on one line. */
function pointOf(output: string): string {
  const match = /Point: (\[[\s\S]*?\]|readonly \[[\s\S]*?\]);\n/.exec(output);
  return (match?.[1] ?? "").replace(/\s*\n\s*/g, " ");
}

describe("prefix-items fix", () => {
  it("openapiTS without the fix closes the tuple and requires every element", async () => {
    expect(pointOf(await generate({ items: NUMBER }))).toBe("[ number, string ]");
  });

  it("openapiTS with the fix types the items after the prefix with items", async () => {
    expect(pointOf(await fixed({ items: NUMBER, minItems: 2 }))).toBe("[ number, string, ...number[] ]");
  });

  it("openapiTS with the fix allows any further item without items", async () => {
    expect(pointOf(await fixed({ minItems: 2 }))).toBe("[ number, string, ...unknown[] ]");
  });

  it("openapiTS with the fix closes the tuple with items or unevaluatedItems false", async () => {
    expect(pointOf(await fixed({ items: false, minItems: 2 }))).toBe("[ number, string ]");
    expect(pointOf(await fixed({ unevaluatedItems: false, minItems: 2 }))).toBe("[ number, string ]");
  });

  it("openapiTS with the fix types further items with unevaluatedItems and contains", async () => {
    expect(pointOf(await fixed({ unevaluatedItems: STRING, minItems: 2 }))).toBe("[ number, string, ...string[] ]");
    expect(pointOf(await fixed({ unevaluatedItems: false, contains: NUMBER, minItems: 2 }))).toBe(
      "[ number, string, ...number[] ]",
    );
    expect(pointOf(await fixed({ unevaluatedItems: STRING, contains: NUMBER, minItems: 2 }))).toBe(
      "[ number, string, ...(string | number)[] ]",
    );
  });

  it("openapiTS with the fix ignores unevaluatedItems next to items, which evaluates every item", async () => {
    expect(pointOf(await fixed({ items: NUMBER, unevaluatedItems: false, minItems: 2 }))).toBe(
      "[ number, string, ...number[] ]",
    );
  });

  it("openapiTS with the fix makes the elements after minItems optional", async () => {
    expect(pointOf(await fixed({ items: false }))).toBe("[ number?, string? ]");
    expect(pointOf(await fixed({ items: false, minItems: 1 }))).toBe("[ number, string? ]");
  });

  it("openapiTS with the fix parenthesizes an optional union element", async () => {
    const output = await fixed({ prefixItems: [{ type: ["string", "null"] }], items: false });

    expect(pointOf(output)).toBe("[ (string | null)? ]");
  });

  it("openapiTS with the fix and --array-length adds no length tuples around the tuple", async () => {
    const output = await fixed({ items: false, minItems: 1, maxItems: 2 }, { arrayLength: true });

    expect(pointOf(output)).toBe("[ number, string? ]");
  });

  it("openapiTS with the fix and --immutable makes the tuple readonly", async () => {
    const output = await fixed({ items: false, minItems: 2 }, { immutable: true });

    expect(pointOf(output)).toBe("readonly [ number, string ]");
  });

  it("openapiTS output with the fix accepts the arrays the schema allows", async () => {
    const code = `${await fixed({ items: NUMBER, minItems: 1 })}
type Point = components["schemas"]["Point"];
const short: Point = [1];
const long: Point = [1, "a", 2, 3];
// @ts-expect-error an item after the prefix is a number
const wrong: Point = [1, "a", "b"];`;

    expect(typeErrorsOf(code)).toEqual([]);
  });
});
