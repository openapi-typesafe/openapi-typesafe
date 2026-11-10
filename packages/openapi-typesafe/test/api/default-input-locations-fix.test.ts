import { describe, expect, it } from "vitest";
import { createDocumentRun } from "../../src/api/document-run.js";
import { defaultGeneratorPorts } from "../../src/api/openapi-ts.js";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";

/**
 * `--default-non-nullable`: a default makes an output property required, never an input one. The
 * original finds inputs by words in the location; the `default-input-locations` fix (ADR-021) by
 * the document's structure.
 */

const PAGE = { type: "object", properties: { page: { type: "integer", default: 1 } } };
const JSON_PAGE = { "application/json": { schema: PAGE } };

const DOCUMENT = {
  openapi: "3.0.3",
  info: { title: "t", version: "1" },
  paths: {
    "/system-parameters": {
      get: { responses: { 200: { description: "ok", content: JSON_PAGE } } },
      post: { requestBody: { content: JSON_PAGE }, responses: { 204: { description: "ok" } } },
    },
  },
  components: {
    schemas: {
      Job: { type: "object", properties: { parameters: PAGE } },
    },
  },
} as unknown as OpenAPI3;

const RESPONSE_PAGE = /200: \{\n(?:.*\n){4}\s+"application\/json": \{\n(?:.*\n){1}\s+page(\??): number;/;
const BODY_PAGE = /requestBody\?: \{\n(?:.*\n){2}\s+\/\*\* @default 1 \*\/\n\s+page(\??): number;/;
const PARAMETERS_PAGE = /parameters\?: \{\n\s+\/\*\* @default 1 \*\/\n\s+page(\??): number;/;

async function optionalMarks(fix: readonly "default-input-locations"[]): Promise<string[]> {
  const output = astToString(await openapiTS(DOCUMENT, { silent: true, fix }));
  return [RESPONSE_PAGE, BODY_PAGE, PARAMETERS_PAGE].map((pattern) => output.match(pattern)?.[1] ?? "none");
}

describe("default-input-locations fix", () => {
  it("openapiTS without the fix keeps defaulted properties optional where the location names an input", async () => {
    const [response, body, parameters] = await optionalMarks([]);

    expect([response, body, parameters]).toEqual(["?", "?", "?"]);
  });

  it("openapiTS with the fix makes them required in a response and a property named parameters", async () => {
    const [response, body, parameters] = await optionalMarks(["default-input-locations"]);

    expect([response, body, parameters]).toEqual(["", "?", ""]);
  });
});

/** A `$ref` through a property with a default reads it as the output types it: optional or not. */
const OBJ = { type: "object", default: {}, properties: { x: { type: "string" } } };
const HOLDER = { type: "object", properties: { obj: OBJ } };
const REF_DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "t", version: "1" },
  paths: {
    "/x": {
      post: {
        requestBody: { content: { "application/json": { schema: HOLDER } } },
        responses: { 204: { description: "ok" } },
      },
    },
    "/y": {
      post: {
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object", properties: { ref: { $ref: "#/components/schemas/Holder" } } },
            },
          },
        },
        responses: { 204: { description: "ok" } },
      },
    },
    "/system-parameters": {
      get: {
        responses: { 200: { description: "ok", content: { "application/json": { schema: HOLDER } } } },
      },
    },
  },
  components: {
    schemas: {
      Model: { type: "object", properties: { hyperparameters: HOLDER } },
      Run: { type: "object", required: ["hyperparameters"], properties: { hyperparameters: HOLDER } },
      Holder: HOLDER,
      Body: { $ref: "#/paths/~1x/post/requestBody/content/application~1json/schema/properties/obj/properties/x" },
      Response: {
        $ref: "#/paths/~1system-parameters/get/responses/200/content/application~1json/schema/properties/obj/properties/x",
      },
      Required: { $ref: "#/components/schemas/Run/properties/hyperparameters/properties/obj/properties/x" },
      Component: {
        $ref: "#/paths/~1y/post/requestBody/content/application~1json/schema/properties/ref/properties/obj/properties/x",
      },
      Nested: { $ref: "#/components/schemas/Model/properties/hyperparameters/properties/obj/properties/x" },
    },
  },
} as unknown as OpenAPI3;

async function refTypes(fix: readonly "default-input-locations"[]): Promise<string[]> {
  const output = astToString(await openapiTS(REF_DOCUMENT, { silent: true, fix }));
  return ["Body", "Response", "Nested", "Required", "Component"].map(
    (name) => output.match(new RegExp(`${name}: (.+);`))?.[1] ?? "none",
  );
}

describe("$refs through a defaulted property", () => {
  it("openapiTS reads a defaulted property as optional where the location names an input", async () => {
    expect(await refTypes([])).toEqual([
      'NonNullable<NonNullable<paths["/x"]["post"]["requestBody"]>["content"]["application/json"]["obj"]>["x"]',
      'NonNullable<paths["/system-parameters"]["get"]["responses"]["200"]["content"]["application/json"]["obj"]>["x"]',
      'NonNullable<NonNullable<components["schemas"]["Model"]["hyperparameters"]>["obj"]>["x"]',
      'NonNullable<components["schemas"]["Run"]["hyperparameters"]["obj"]>["x"]',
      'NonNullable<NonNullable<paths["/y"]["post"]["requestBody"]>["content"]["application/json"]["ref"]>["obj"]["x"]',
    ]);
  });

  it("openapiTS with the fix reads it as required in a response and a property named parameters", async () => {
    expect(await refTypes(["default-input-locations"])).toEqual([
      'NonNullable<NonNullable<paths["/x"]["post"]["requestBody"]>["content"]["application/json"]["obj"]>["x"]',
      'paths["/system-parameters"]["get"]["responses"]["200"]["content"]["application/json"]["obj"]["x"]',
      'NonNullable<components["schemas"]["Model"]["hyperparameters"]>["obj"]["x"]',
      'components["schemas"]["Run"]["hyperparameters"]["obj"]["x"]',
      'NonNullable<NonNullable<paths["/y"]["post"]["requestBody"]>["content"]["application/json"]["ref"]>["obj"]["x"]',
    ]);
  });
});

describe("default-input-locations notice", () => {
  async function warningsOf(options: OpenAPITSOptions): Promise<string[]> {
    const ports = await defaultGeneratorPorts({ silent: true });
    const logger = new RecordingLogger();
    const source = 'openapi: 3.1.0\ninfo: { title: t, version: "1" }\npaths: {}\n';
    await createDocumentRun(source, { silent: true, ...options }, { ...ports, logger });
    return logger.messages("warn");
  }

  it("createDocumentRun with the fix and defaultNonNullable false warns", async () => {
    const warnings = await warningsOf({ fix: ["default-input-locations"], defaultNonNullable: false });

    expect(warnings).toEqual([
      'Fix "default-input-locations" has no effect without defaultNonNullable (--default-non-nullable) (FIX_NEEDS_OPTION)',
    ]);
  });

  it("createDocumentRun with the fix and the default defaultNonNullable does not warn", async () => {
    expect(await warningsOf({ fix: ["default-input-locations"] })).toEqual([]);
  });
});
