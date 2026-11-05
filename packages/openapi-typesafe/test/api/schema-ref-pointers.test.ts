import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3 } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * A schema `$ref` into another schema's keywords or through an optional value. The original
 * indexed each pointer segment by name, which does not compile there (ADR-026); where it compiles
 * through an index signature it stays, and the `ref-pointers` fix corrects it.
 */

const LIST = "#/paths/~1items/get/responses/200/content/application~1json/schema";
const OBJECT = { type: "object", properties: { time: { type: "string" } } };

function documentWith(schemas: Record<string, unknown>, paths: Record<string, unknown> = {}) {
  return {
    openapi: "3.1.0",
    info: { title: "Test", version: "1.0.0" },
    paths: {
      "/items": {
        get: {
          responses: {
            200: {
              description: "OK",
              content: { "application/json": { schema: { type: "array", items: OBJECT } } },
            },
          },
        },
      },
      ...paths,
    },
    components: { schemas },
  } as unknown as OpenAPI3;
}

async function generate(document: OpenAPI3, options: object = {}): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

describe("schema $refs whose original type does not compile", () => {
  it("openapiTS maps media type schemas and items to the generated shape", async () => {
    const document = documentWith({
      Copy: { type: "object", properties: { time: { $ref: `${LIST}/items/properties/time` } } },
    });

    const output = await generate(document);

    expect(output).toContain(
      'time?: paths["/items"]["get"]["responses"]["200"]["content"]["application/json"][number]["time"];',
    );
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS looks through an optional or nullable value with NonNullable", async () => {
    const document = documentWith({
      List: {
        type: "object",
        properties: {
          rows: { type: ["array", "null"], items: { type: "object", properties: { name: { type: "string" } } } },
          owner: { type: "object", properties: { id: { type: "string" } } },
        },
      },
      Copy: {
        type: "object",
        properties: {
          name: { $ref: "#/components/schemas/List/properties/rows/items/properties/name" },
          id: { $ref: "#/components/schemas/List/properties/owner/properties/id" },
        },
      },
    });

    const output = await generate(document);

    expect(output).toContain('name?: NonNullable<components["schemas"]["List"]["rows"]>[number]["name"];');
    expect(output).toContain('id?: NonNullable<components["schemas"]["List"]["owner"]>["id"];');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS writes the target inline where the pointer crosses a keyword with no type", async () => {
    const document = documentWith(
      {
        Base: {
          allOf: [{ type: "object", properties: { id: { type: "integer" } } }],
          definitions: {
            Code: { type: "string", enum: ["a", "b"] },
            Alias: { $ref: "#/components/schemas/Base/definitions/Code" },
          },
        },
        Copy: {
          type: "object",
          properties: {
            id: { $ref: "#/components/schemas/Base/allOf/0/properties/id" },
            code: { $ref: "#/components/schemas/Base/definitions/Code" },
            alias: { $ref: "#/components/schemas/Base/definitions/Alias" },
            limit: { $ref: "#/paths/~1search/get/parameters/0/schema" },
          },
        },
      },
      {
        "/search": {
          get: {
            parameters: [{ name: "limit", in: "query", schema: { type: "integer", maximum: 9 } }],
            responses: { 200: { description: "OK" } },
          },
        },
      },
    );

    const output = await generate(document);

    expect(output).toContain("id?: number;");
    expect(output).toContain('code?: "a" | "b";');
    expect(output).toContain('alias?: "a" | "b";');
    expect(output).toContain("limit?: number;");
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps the original type of a target that points back at itself", async () => {
    const document = documentWith({
      Tree: {
        type: "object",
        definitions: {
          Node: { type: "object", properties: { next: { $ref: "#/components/schemas/Tree/definitions/Node" } } },
        },
        properties: { root: { $ref: "#/components/schemas/Tree/definitions/Node" } },
      },
    });

    const output = await generate(document);

    expect(output).toContain('root?: components["schemas"]["Tree"]["definitions"]["Node"];');
  });

  it("openapiTS makes the keys of an optional $ref target required through NonNullable", async () => {
    const document = documentWith({
      Devices: {
        type: "object",
        properties: { entity: { type: "object", properties: { id: { type: "integer" } } } },
      },
      Device: {
        allOf: [{ $ref: "#/components/schemas/Devices/properties/entity" }],
        required: ["id"],
      },
    });

    const output = await generate(document);

    expect(output).toContain('WithRequired<NonNullable<components["schemas"]["Devices"]["entity"]>, "id">');
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("schema $refs whose original type compiles", () => {
  const BAG = "#/paths/~1bag/get/responses/200/content/application~1json/schema";
  const document = documentWith(
    { Copy: { type: "object", properties: { bag: { $ref: BAG } } } },
    {
      "/bag": {
        get: {
          responses: {
            200: { description: "OK", content: { "application/json": { schema: OBJECT } } },
          },
        },
      },
    },
  );
  const media = 'paths["/bag"]["get"]["responses"]["200"]["content"]["application/json"]';

  it("openapiTS corrects the type where no index signature admits the keyword", async () => {
    const output = await generate(document);

    expect(output).toContain(`bag?: ${media};`);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS keeps the type an index signature admits", async () => {
    const output = await generate(document, { additionalProperties: true });

    expect(output).toContain(`bag?: ${media}["schema"];`);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS corrects the type an index signature admits with the ref-pointers fix", async () => {
    const output = await generate(document, { additionalProperties: true, fix: ["ref-pointers"] });

    expect(output).toContain(`bag?: ${media};`);
  });
});

describe("schema $refs into an allOf with additional properties", () => {
  const B = "#/components/schemas/B";
  const document = documentWith({
    A: {
      type: "object",
      properties: { k: { $ref: `${B}/allOf/0/properties/k` }, j: { $ref: `${B}/allOf/1` } },
    },
    B: {
      allOf: [
        { type: "object", properties: { k: { type: "string", enum: ["k1"] } } },
        { type: "object", properties: { j: { type: "number" } } },
      ],
    },
  });

  // `B["allOf"]` compiles through `[key: string]: unknown`, but `unknown` has no key `0`.
  it("openapiTS corrects a pointer that indexes a member typed unknown", async () => {
    const output = await generate(document, { additionalProperties: true });

    expect(output).toContain('k?: "k1";');
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("schema $refs into a schema typed unknown", () => {
  // A schema with no type and no object keywords is `unknown`, which has no keys at all.
  it("openapiTS corrects a pointer that indexes a schema typed unknown", async () => {
    const document = documentWith({
      X: {
        type: "object",
        required: ["free"],
        properties: { free: { "x-inner": { type: "string", enum: ["i"] } } },
      },
      A: {
        type: "object",
        properties: { a: { $ref: "#/components/schemas/X/properties/free/x-inner" } },
      },
    });

    const output = await generate(document);

    expect(output).toContain('a?: "i";');
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("schema $refs into response headers", () => {
  const header = (required: boolean) => ({
    required,
    schema: { type: "object", properties: { limit: { type: "integer" } } },
  });
  const document = documentWith({
    Copy: {
      type: "object",
      properties: {
        optional: { $ref: "#/components/responses/R/headers/X-Rate/schema/properties/limit" },
        required: { $ref: "#/components/responses/R/headers/X-Must/schema/properties/limit" },
      },
    },
  });
  const response = { description: "OK", headers: { "X-Rate": header(false), "X-Must": header(true) } };
  Object.assign(document.components ?? {}, { responses: { R: response } });
  const headers = 'components["responses"]["R"]["headers"]';

  it("openapiTS looks through a header that is not required with NonNullable", async () => {
    const output = await generate(document);

    expect(output).toContain(`optional?: NonNullable<${headers}["X-Rate"]>["limit"];`);
    expect(output).toContain(`required?: ${headers}["X-Must"]["limit"];`);
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("schema $refs into path item parameters", () => {
  const parameter = { name: "q", in: "query", schema: { type: "string", enum: ["x", "y"] } };
  const document = documentWith(
    {
      Copy: {
        type: "object",
        properties: {
          q: { $ref: "#/paths/~1search/parameters/0/schema" },
          w: { $ref: "#/webhooks/hook/parameters/0/schema" },
        },
      },
    },
    { "/search": { parameters: [parameter], get: { responses: { 200: { description: "OK" } } } } },
  );

  const hook = { parameters: [{ ...parameter, name: "w" }], post: { responses: {} } };
  Object.assign(document, { webhooks: { hook } });

  it("openapiTS writes the target of a path item parameter inline", async () => {
    const output = await generate(document);

    expect(output).not.toContain('["parameters"]["0"]');
    expect(output).toMatch(/Copy: \{\n\s+q\?: "x" \| "y";\n\s+w\?: "x" \| "y";/);
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("schema $refs into a schema with allOf next to properties", () => {
  const LIST = { type: "array", items: OBJECT };
  const document = documentWith({
    Base: {
      type: "object",
      properties: { list: LIST },
      allOf: [{ type: "object", properties: { z: { type: "boolean" } } }],
    },
    Copy: {
      type: "object",
      properties: {
        item: { $ref: "#/components/schemas/Base/properties/list/items" },
      },
    },
  });

  it("openapiTS reads the one part of the intersection that has the key", async () => {
    const output = await generate(document);

    expect(output).toContain('item?: NonNullable<components["schemas"]["Base"]["list"]>[number];');
    expect(typeErrorsOf(output)).toEqual([]);
  });
});

describe("schema $refs into a schema whose type its keywords do not change", () => {
  // `type: object` without properties is `Record<string, never>`: every key is `never`, so the
  // original compiles. `type: string` ignores `items`: the original indexes `string`.
  const document = documentWith({
    Shared: { type: "object", definitions: { Money: OBJECT } },
    Bag: { type: "object", items: { type: "string" } },
    Text: { type: "string", items: { type: "number" } },
    Copy: {
      type: "object",
      properties: {
        money: { $ref: "#/components/schemas/Shared/definitions/Money" },
        bag: { $ref: "#/components/schemas/Bag/items" },
        text: { $ref: "#/components/schemas/Text/items" },
      },
    },
  });

  it("openapiTS keeps the original type where Record<string, never> admits the key", async () => {
    const output = await generate(document);

    expect(output).toContain('money?: components["schemas"]["Shared"]["definitions"]["Money"];');
    expect(output).toContain('bag?: components["schemas"]["Bag"]["items"];');
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS writes items of a schema that is no array inline", async () => {
    const output = await generate(document);

    expect(output).toContain("text?: number;");
  });

  it("openapiTS writes those targets inline with the ref-pointers fix", async () => {
    const output = await generate(document, { fix: ["ref-pointers"] });

    expect(output).toContain("bag?: string;");
    expect(output).toMatch(/money\?: \{\n\s+time\?: string;\n\s+\};/);
    expect(typeErrorsOf(output)).toEqual([]);
  });
});
