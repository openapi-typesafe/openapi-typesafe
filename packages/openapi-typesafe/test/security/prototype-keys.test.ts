import { describe, expect, it } from "vitest";
import openapiTS, { astToString } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * Keys that name `Object.prototype` members (`__proto__`, `constructor`, `prototype`) as schema,
 * property, path, parameter, operation and enum names (pre-beta test plan 10.6). A parser or a
 * map that treats them as prototype keys would drop a schema or break the output.
 */

const PROTOTYPE_KEYS = ["__proto__", "constructor", "prototype"] as const;

const documentText = JSON.stringify({
  openapi: "3.1.0",
  info: { title: "prototype keys", version: "1" },
  paths: {
    "/__proto__/{constructor}": {
      parameters: [
        { name: "constructor", in: "path", required: true, schema: { type: "string" } },
        { name: "__proto__", in: "query", schema: { type: "string" } },
        { name: "prototype", in: "header", schema: { type: "string" } },
      ],
      get: {
        operationId: "constructor",
        responses: {
          200: {
            description: "ok",
            content: { "application/json": { schema: { $ref: "#/components/schemas/__proto__" } } },
          },
        },
      },
    },
    "/prototype": { post: { operationId: "__proto__", responses: { 204: { description: "none" } } } },
  },
  components: {
    schemas: {
      // A computed key makes an own property; `__proto__: value` would set the prototype.
      ["__proto__"]: {
        type: "object",
        required: ["__proto__"],
        properties: {
          ["__proto__"]: { type: "string" },
          constructor: { type: "string", enum: [...PROTOTYPE_KEYS] },
          prototype: { $ref: "#/components/schemas/prototype" },
        },
      },
      constructor: { type: "object", additionalProperties: { type: "string" } },
      prototype: { type: "string", enum: ["__proto__", "toString", "valueOf"] },
    },
  },
});

const FLAG_SETS = [
  {},
  { enum: true, rootTypes: true, makePathsEnum: true },
  { enumValues: true, rootTypes: true, rootTypesNoSchemaPrefix: true, immutable: true },
  { pathParamsAsTypes: true, alphabetize: true, dedupeEnums: true, enum: true },
];

describe("prototype keys", () => {
  it.each(FLAG_SETS)("every prototype key is kept and the output compiles with %j", async (flags) => {
    const output = astToString(await openapiTS(documentText, { ...flags, silent: true }));

    for (const key of PROTOTYPE_KEYS) {
      expect(output).toContain(`${key}: `);
    }
    expect(output).toMatch(/"\/__proto__\/\{constructor\}"|`\/__proto__\/\$\{string\}`/);
    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("a YAML document keeps a __proto__ key as a schema", async () => {
    const yaml = [
      "openapi: 3.1.0",
      "info: { title: t, version: '1' }",
      "paths: {}",
      "components:",
      "  schemas:",
      "    __proto__: { type: object, properties: { polluted: { type: string } } }",
    ].join("\n");

    const output = astToString(await openapiTS(yaml, { silent: true }));

    expect(output).toMatch(/__proto__: \{\n\s+polluted\?: string;/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

/**
 * A map entry named `constructor` whose value has a string `name`: Redocly 1.x looks up
 * `properties.constructor`, finds `Object`, calls it, and takes the value itself for a node type.
 */
const NAMED_CONSTRUCTOR_DOCUMENTS: readonly [string, Record<string, unknown>, string][] = [
  [
    "a security scheme",
    { paths: {}, components: { securitySchemes: { constructor: { type: "apiKey", in: "header", name: "x" } } } },
    "#/components/securitySchemes/constructor",
  ],
  [
    "a response header",
    {
      paths: {
        "/a": {
          get: {
            responses: {
              200: { description: "OK", headers: { constructor: { name: "x", schema: { type: "string" } } } },
            },
          },
        },
      },
    },
    "#/paths/~1a/get/responses/200/headers/constructor",
  ],
];

const textOf = (document: Record<string, unknown>) =>
  JSON.stringify({ openapi: "3.1.0", info: { title: "t", version: "1" }, ...document });

describe("prototype keys as map entries", () => {
  it.each(["__proto__", "prototype"])("a security scheme named %s generates", async (key) => {
    const scheme = { type: "apiKey", in: "header", name: "x" };

    const output = astToString(
      await openapiTS(textOf({ paths: {}, components: { securitySchemes: { [key]: scheme } } }), { silent: true }),
    );

    expect(typeErrorsOf(output)).toEqual([]);
  });

  it.each(NAMED_CONSTRUCTOR_DOCUMENTS)(
    "%s named constructor with a `name` fails with SCHEMA_KEY_UNSUPPORTED",
    async (_, document, pointer) => {
      const generation = openapiTS(textOf(document), { silent: true });

      await expect(generation).rejects.toMatchObject({
        code: "SCHEMA_KEY_UNSUPPORTED",
        details: { keys: [{ key: "constructor", pointer }] },
      });
    },
  );
});
