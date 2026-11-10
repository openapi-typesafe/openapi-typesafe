import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/**
 * A `$ref` into the `content` of a header or parameter (ADR-026). A header with `content` is an
 * object with one member per media type, or with the `parameter-header-content` fix the type of
 * its first media type; a parameter with `content` is `string` without the fix. Neither has a
 * `content` or `schema` member, so the original's `["content"]["text/plain"]["schema"]` did not
 * compile.
 */

const COUNT = { type: "object", properties: { n: { type: "integer" } } };
const LIMIT = { type: "object", required: ["limit"], properties: { limit: { type: "integer" } } };

const DOCUMENT = {
  openapi: "3.2.0",
  info: { title: "t", version: "1" },
  paths: {
    "/a": {
      get: {
        parameters: [{ $ref: "#/components/parameters/P" }, { $ref: "#/components/parameters/Q" }],
        responses: {
          200: {
            description: "ok",
            headers: { "X-Rate": { content: { "application/json": { schema: LIMIT } } } },
          },
        },
      },
    },
  },
  components: {
    headers: {
      H: {
        required: true,
        content: { "text/plain": { schema: COUNT }, "text/csv": { schema: LIMIT } },
      },
      Named: { content: { content: { schema: COUNT } } },
      Both: { schema: COUNT, content: { "text/plain": { schema: LIMIT } } },
    },
    parameters: {
      P: { name: "filter", in: "query", content: { "application/json": { schema: COUNT } } },
      Q: { name: "q", in: "querystring", content: { "application/json": { schema: LIMIT } } },
      S: { name: "s", in: "query", schema: COUNT, content: { "application/json": { schema: LIMIT } } },
    },
    schemas: {
      PathHeader: {
        $ref: "#/paths/~1a/get/responses/200/headers/X-Rate/content/application~1json/schema/properties/limit",
      },
      HeaderProperty: { $ref: "#/components/headers/H/content/text~1plain/schema/properties/n" },
      HeaderSchema: { $ref: "#/components/headers/H/content/text~1plain/schema" },
      SecondMediaType: { $ref: "#/components/headers/H/content/text~1csv/schema/properties/limit" },
      HeaderContent: { $ref: "#/components/headers/H/content" },
      ParameterProperty: {
        $ref: "#/components/parameters/P/content/application~1json/schema/properties/n",
      },
      QueryStringProperty: {
        $ref: "#/components/parameters/Q/content/application~1json/schema/properties/limit",
      },
      IgnoredParameterContent: {
        $ref: "#/components/parameters/S/content/application~1json/schema/properties/limit",
      },
      IgnoredContent: { $ref: "#/components/headers/Both/content/text~1plain/schema/properties/limit" },
      NamedContent: { $ref: "#/components/headers/Named/content/content/schema/properties/n" },
    },
  },
} as unknown as OpenAPI3;

async function generate(options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(DOCUMENT, { silent: true, ...options }));
}

/** The type of a component schema alias, from its line in `components["schemas"]`. */
function aliasOf(output: string, name: string): string | undefined {
  return new RegExp(`^ {8}${name}: (.+);$`, "m").exec(output)?.[1];
}

/** Every alias except `NamedContent`, whose original type is kept (see the last test). */
function compilingPart(output: string): string {
  return output.replace(/^ {8}NamedContent: .+$/m, "");
}

describe("$refs into the content of a header or parameter", () => {
  it("openapiTS indexes each media type member of a header", async () => {
    const output = await generate();

    expect(aliasOf(output, "PathHeader")).toBe(
      'NonNullable<paths["/a"]["get"]["responses"]["200"]["headers"]["X-Rate"]>["application/json"]["limit"]',
    );
    expect(aliasOf(output, "HeaderProperty")).toBe('components["headers"]["H"]["text/plain"]["n"]');
    expect(aliasOf(output, "HeaderSchema")).toBe('components["headers"]["H"]["text/plain"]');
    expect(aliasOf(output, "HeaderContent")).toBe('components["headers"]["H"]');
    expect(typeErrorsOf(compilingPart(output))).toEqual([]);
  });

  it("openapiTS types a property of a string parameter's content in place", async () => {
    const output = await generate();

    expect(aliasOf(output, "ParameterProperty")).toBe("number");
    expect(aliasOf(output, "QueryStringProperty")).toBe('components["parameters"]["Q"]["limit"]');
  });

  it("openapiTS with parameter-header-content indexes the first media type's type", async () => {
    const output = await generate({ fix: ["parameter-header-content"] });

    expect(aliasOf(output, "PathHeader")).toBe(
      'NonNullable<paths["/a"]["get"]["responses"]["200"]["headers"]["X-Rate"]>["limit"]',
    );
    expect(aliasOf(output, "HeaderProperty")).toBe('components["headers"]["H"]["n"]');
    expect(aliasOf(output, "HeaderSchema")).toBe('components["headers"]["H"]');
    expect(aliasOf(output, "ParameterProperty")).toBe('components["parameters"]["P"]["n"]');
    expect(typeErrorsOf(compilingPart(output))).toEqual([]);
  });

  it("openapiTS with parameter-header-content types another media type and the map in place", async () => {
    const output = await generate({ fix: ["parameter-header-content"] });

    expect(aliasOf(output, "SecondMediaType")).toBe("number");
    expect(aliasOf(output, "HeaderContent")).not.toBe('components["headers"]["H"]');
  });

  it("openapiTS types the content next to a header's schema in place", async () => {
    const output = await generate();

    expect(aliasOf(output, "IgnoredContent")).toBe("number");
  });

  it("openapiTS with parameter-header-content types the content next to a parameter's schema in place", async () => {
    const output = await generate({ fix: ["parameter-header-content"] });

    expect(aliasOf(output, "IgnoredParameterContent")).toBe("number");
    expect(aliasOf(output, "IgnoredContent")).toBe("number");
  });

  it("openapiTS keeps the original type where a media type is named content", async () => {
    const output = await generate();

    expect(aliasOf(output, "NamedContent")).toBe('components["headers"]["Named"]["content"]["content"]["schema"]["n"]');
  });
});
