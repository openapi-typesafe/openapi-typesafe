import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `discriminator-values` fix: a schema keeps its own mapping (ADR-024, #2200). */

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const CONTENT_TYPE = { contentType: { type: "string" } };

/**
 * Upstream #2200, smaller: `Element` has a discriminator without a mapping; `Content` has its own,
 * with a mapping, and `allOf`s `Element`. `Article` comes before `Content`, `Video` after it.
 */
const SCHEMAS = {
  Article: { type: "object", allOf: [ref("Content")], properties: { text: { type: "string" } } },
  Content: {
    type: "object",
    required: ["contentType"],
    allOf: [ref("Element")],
    properties: CONTENT_TYPE,
    discriminator: {
      propertyName: "contentType",
      mapping: { article: ref("Article").$ref, video: ref("Video").$ref },
    },
  },
  Element: { type: "object", properties: CONTENT_TYPE, discriminator: { propertyName: "contentType" } },
  Video: { type: "object", allOf: [ref("Content")], properties: { url: { type: "string" } } },
};

function documentWith(schemas: Record<string, unknown>): OpenAPI3 {
  return { openapi: "3.0.1", info: { title: "t", version: "1" }, paths: {}, components: { schemas } } as OpenAPI3;
}

async function generate(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(documentWith(structuredClone(schemas)), { silent: true, ...options }));
}

async function fixed(schemas: Record<string, unknown>, options: OpenAPITSOptions = {}): Promise<string> {
  return generate(schemas, { fix: ["discriminator-values"], ...options });
}

/** The literal `contentType` values of the output, in order. */
function valuesOf(output: string): string[] {
  return [...output.matchAll(/contentType: ("[^"]*");/g)].map((match) => match[1] ?? "");
}

describe("discriminator-values fix, own mapping", () => {
  it("openapiTS without the fix loses the mapping for schemas after the owner", async () => {
    expect(valuesOf(await generate(SCHEMAS))).toEqual(['"article"', '"Video"']);
  });

  it("openapiTS with the fix gives every schema its mapped value", async () => {
    expect(valuesOf(await fixed(SCHEMAS))).toEqual(['"article"', '"video"']);
  });

  it("openapiTS with the fix does not depend on the order of the schemas", async () => {
    const { Video, ...rest } = SCHEMAS;

    expect(valuesOf(await fixed({ Video, ...rest }))).toEqual(['"video"', '"article"']);
  });

  it("openapiTS with the fix keeps an own discriminator next to an inline one", async () => {
    const inline = { discriminator: { propertyName: "contentType" } };
    const schemas = { ...SCHEMAS, Content: { ...SCHEMAS.Content, allOf: [inline] } };

    expect(valuesOf(await fixed(schemas))).toEqual(['"article"', '"video"']);
  });

  it("openapiTS with the fix gives types that a mapped value has", async () => {
    const code = `${await fixed(SCHEMAS)}
const video: components["schemas"]["Video"] = { contentType: "video", url: "u" };
// @ts-expect-error the schema name is not the mapped value
const named: components["schemas"]["Video"] = { contentType: "Video" };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });

  it("openapiTS with the fix still passes an inherited discriminator on", async () => {
    const schemas = { ...SCHEMAS, Clip: { allOf: [ref("Video")] } };

    expect(await fixed(schemas)).toContain('contentType: "Clip";');
  });
});
