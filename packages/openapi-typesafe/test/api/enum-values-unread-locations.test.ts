import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * `--enum-values` arrays whose location the check of ADR-027 cannot read as TypeScript does, or
 * read as another type: each is typed by its own values, so the output compiles. A location it
 * reads keeps its pointer.
 */

const enumOf = (...values: string[]) => ({ type: "string", enum: values });
const objectOf = (properties: Record<string, unknown>, more: Record<string, unknown> = {}) => ({
  type: "object",
  properties,
  ...more,
});

function documentOf(schemas: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const components = { schemas, ...extra };
  return { openapi: "3.1.0", info: { title: "t", version: "1" }, paths: {}, components };
}

async function generate(document: object): Promise<string> {
  const options = { silent: true, enumValues: true };
  return astToString(await openapiTS(document as OpenAPI3, options));
}

const TUPLE_OF_TUPLES = documentOf(
  {},
  {
    parameters: {
      Sort: {
        name: "sort",
        in: "query",
        schema: {
          type: "array",
          prefixItems: [{ type: "array", prefixItems: [enumOf("v7"), enumOf("v7")] }],
        },
      },
    },
  },
);

const OMIT_OF_A_UNION = documentOf({
  V3: objectOf({ type: { type: "string" } }),
  V4: objectOf({ type: { type: "string" } }),
  Shape: {
    type: "array",
    prefixItems: [
      {
        allOf: [
          objectOf(
            { type: { type: "string" }, mode: objectOf({ Kind: enumOf("a", "b") }) },
            {
              required: ["type"],
              oneOf: [{ $ref: "#/components/schemas/V3" }, { $ref: "#/components/schemas/V4" }],
              discriminator: { propertyName: "type" },
              additionalProperties: enumOf("a", "b"),
            },
          ),
        ],
      },
      objectOf({ kind: enumOf("b") }, { additionalProperties: objectOf({ Kind: enumOf("a") }) }),
    ],
  },
});

describe("--enum-values arrays at locations the check cannot read", () => {
  it("openapiTS types an array at a tuple of another length by its values", async () => {
    const output = await generate(TUPLE_OF_TUPLES);

    expect(output).toContain('componentsParametersSortValues: ReadonlyArray<"v7"> = ["v7"];');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types an array at a method of a tuple member by its values", async () => {
    const schemas = { Pet: { type: "array", prefixItems: [enumOf("v2"), objectOf({ sort: enumOf("d") })] } };

    const output = await generate(documentOf(schemas));

    expect(output).toContain('petSortValues: ReadonlyArray<"d"> = ["d"];');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types an array read through Omit of a union by its values", async () => {
    const output = await generate(OMIT_OF_A_UNION);

    expect(output).toContain('shapeModeKindValues: ReadonlyArray<"a" | "b"> = ["a", "b"];');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it.each([
    [
      "an allOf of an object and an array property",
      {
        allOf: [
          objectOf({ mode: objectOf({ Kind: enumOf("b") }) }),
          objectOf({ mode: { type: "array", items: enumOf("c") } }),
        ],
      },
    ],
    [
      "a property of an object and an array",
      objectOf({ mode: { allOf: [objectOf({ Kind: enumOf("b") }), { type: "array", items: enumOf("c") }] } }),
    ],
  ])("openapiTS types an array under %s by its values", async (_name, owner) => {
    const output = await generate(documentOf({ Owner: owner }));

    expect(output).toContain('ownerModeKindValues: ReadonlyArray<"b"> = ["b"];');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps the pointer of an enum next to an allOf item that only describes", async () => {
    const values = Array.from({ length: 70 }, (_, index) => `E${index}`);
    const event = objectOf({ type: { allOf: [enumOf(...values), { description: "d" }] } });

    const output = await generate(documentOf({ Event: event }));

    expect(output).toContain(
      'eventTypeValues: ReadonlyArray<FlattenedDeepRequired<components>["schemas"]["Event"]["type"]>',
    );
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS types an enum under an array allOf item that only describes by its values", async () => {
    const items = { type: "array", items: objectOf({ kind: enumOf("a", "b") }) };
    const holder = objectOf({ list: { allOf: [items, { description: "d" }] } });

    const output = await generate(documentOf({ Holder: holder }));

    expect(output).toContain('holderListKindValues: ReadonlyArray<"a" | "b">');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps the pointer under allOf items that make a property partly an array", async () => {
    const empty = { type: "object", additionalProperties: false };
    const common = objectOf({ result: { anyOf: [empty, { type: "array", items: empty }] } });
    const check = {
      allOf: [
        { $ref: "#/components/schemas/Common" },
        objectOf({ result: objectOf({ status: enumOf("ok", "error") }) }),
      ],
    };

    const output = await generate(documentOf({ Common: common, Check: check }));

    expect(output).toContain(
      'checkResultStatusValues: ReadonlyArray<FlattenedDeepRequired<components>["schemas"]["Check"]["result"]["status"]>',
    );
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("schema $refs through a position of an array", () => {
  it("openapiTS types a $ref through an array of a single allOf item in place", async () => {
    const schemas = {
      Pet: { allOf: [{ type: "object", additionalProperties: { type: "array", items: enumOf("v3", "v4") } }] },
      Holder: objectOf({ p2: { $ref: "#/components/schemas/Pet/allOf/0/additionalProperties/items" } }),
    };

    const output = astToString(await openapiTS(documentOf(schemas) as OpenAPI3, { silent: true }));

    expect(output).toContain('p2?: "v3" | "v4";');
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
