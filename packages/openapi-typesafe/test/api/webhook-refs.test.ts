import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** A webhook that is a `$ref` to a path item of `components/pathItems`. */

const DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "t", version: "1" },
  paths: {},
  webhooks: {
    petAdded: { $ref: "#/components/pathItems/PetEvent" },
    petRemoved: { delete: { responses: { 200: { description: "ok" } } } },
  },
  components: {
    pathItems: {
      PetEvent: {
        post: {
          requestBody: {
            content: {
              "application/json": { schema: { type: "object", properties: { id: { type: "integer" } } } },
            },
          },
          responses: { 200: { description: "ok" } },
        },
      },
    },
  },
} as unknown as OpenAPI3;

async function generate(options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(DOCUMENT, { silent: true, ...options }));
}

describe("webhook $refs", () => {
  it("openapiTS types a webhook $ref as the path item it points at", async () => {
    const output = await generate();

    expect(output).toContain('petAdded: components["pathItems"]["PetEvent"];');
  });

  it("openapiTS output reads the operations of a webhook $ref", async () => {
    const output = await generate();

    const usage = `type Body = NonNullable<webhooks["petAdded"]["post"]["requestBody"]>;
const body: Body["content"]["application/json"] = { id: 1 };`;
    expect(typeErrorsOf(`${output}\n${usage}`)).toEqual([]);
  });

  it("openapiTS keeps an inline webhook a path item", async () => {
    const output = await generate();

    expect(output).toMatch(/petRemoved: \{\n\s+parameters: \{/);
  });

  it("openapiTS with --immutable makes a webhook $ref readonly", async () => {
    const output = await generate({ immutable: true });

    expect(output).toContain('readonly petAdded: components["pathItems"]["PetEvent"];');
  });

  it("openapiTS reads a webhook that is a string as a path item, as before", async () => {
    const document = { ...DOCUMENT, webhooks: { a: "x" } } as unknown as OpenAPI3;

    const output = astToString(await openapiTS(document, { silent: true }));

    expect(output).toMatch(/export interface webhooks \{\n\s+a: \{\n\s+parameters: \{/);
  });
});
