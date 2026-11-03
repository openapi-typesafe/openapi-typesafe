import { describe, expect, it } from "vitest";
import { createDocumentRun } from "../../src/api/document-run.js";
import { defaultGeneratorPorts } from "../../src/api/openapi-ts.js";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** OpenAPI 3.2 features are typed by default (roadmap R2, ADR-020). */

const FEATURES_DOCUMENT = new URL("../../examples/openapi-3-2.yaml", import.meta.url);

async function generate(document: URL | OpenAPI3, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

/** The lines of `output` from the first that contains `start` to the closing brace at its indent. */
function blockOf(output: string, start: string): string {
  const lines = output.split("\n");
  const first = lines.findIndex((line) => line.includes(start));
  const indent = lines[first]?.search(/\S/) ?? 0;
  const last = lines.findIndex((line, index) => index > first && line.search(/\S/) === indent);
  return lines.slice(first, last + 1).join("\n");
}

/** A 3.2 document with one path item. */
function documentWith(pathItem: object, components: object = {}): OpenAPI3 {
  return {
    openapi: "3.2.0",
    info: { title: "t", version: "1" },
    paths: { "/items/{id}": pathItem },
    components,
  } as OpenAPI3;
}

const NO_CONTENT = { responses: { 204: { description: "none" } } };

/** The warnings a run of `document` logs. */
async function warningsOf(document: URL | OpenAPI3): Promise<string[]> {
  const ports = await defaultGeneratorPorts({ silent: true });
  const logger = new RecordingLogger();
  await createDocumentRun(document, { silent: true }, { ...ports, logger });
  return logger.messages("warn");
}

describe("OpenAPI 3.2 output", () => {
  it("openapiTS with the 3.2 features document compiles under strict settings", async () => {
    const output = await generate(FEATURES_DOCUMENT);

    expect(typeErrorsOf(output)).toEqual([]);
  });

  it("openapiTS writes a query operation after trace, by operationId or inline", async () => {
    const output = await generate(FEATURES_DOCUMENT);

    expect(blockOf(output, '"/flights/search": {')).toContain(
      '        trace?: never;\n        query: operations["searchFlights"];\n    };',
    );
    expect(blockOf(output, '"/flights/inline": {')).toContain("        query: {\n");
  });

  it("openapiTS writes no query member for a path item without one", async () => {
    const output = await generate(FEATURES_DOCUMENT);

    expect(blockOf(output, '"/uploads": {')).not.toContain("query: {");
    expect(blockOf(output, '"/uploads": {')).not.toMatch(/^ {8}query/m);
  });

  it("openapiTS writes additionalOperations by exact method name", async () => {
    const output = await generate(FEATURES_DOCUMENT);
    const trips = blockOf(output, '"/trips": {');

    expect(trips).toContain('        additionalOperations: {\n            SUBSCRIBE: operations["subscribe-trip"];');
    expect(trips).toContain("            purge: {");
  });

  it("openapiTS writes itemContent next to content and keeps the schema type", async () => {
    const output = await generate(FEATURES_DOCUMENT);
    const trips = blockOf(output, '"/trips": {');

    expect(trips).toContain('"application/jsonl": string;');
    expect(trips).toContain(
      'itemContent: {\n                        "application/jsonl": components["schemas"]["TripUpdate"];',
    );
  });

  it("openapiTS types an itemSchema of a streamed response inline", async () => {
    const output = await generate(FEATURES_DOCUMENT);
    const subscribe = blockOf(output, '"subscribe-trip": {');

    expect(subscribe).toContain('"text/event-stream": unknown;');
    expect(subscribe).toContain("event?: string;\n                        data: string;");
  });

  it("openapiTS types a querystring parameter as the query member", async () => {
    const output = await generate(FEATURES_DOCUMENT);

    expect(blockOf(output, "    search: {")).toContain(
      'query: components["schemas"]["Filter"];\n            header?: {',
    );
  });

  it("openapiTS writes media type components and references them from content", async () => {
    const output = await generate(FEATURES_DOCUMENT);

    expect(output).toContain("    pathItems: never;\n    mediaTypes: {\n        TripUpdates: unknown;\n    };");
    expect(blockOf(output, "        Updates: {")).toContain(
      '"application/jsonl": components["mediaTypes"]["TripUpdates"];',
    );
    expect(blockOf(output, '"/uploads": {')).toContain(
      'itemContent: {\n                    "application/jsonl": components["schemas"]["TripUpdate"];',
    );
  });

  it("openapiTS with the 3.2 features document does not warn", async () => {
    expect(await warningsOf(FEATURES_DOCUMENT)).toEqual([]);
  });
});

describe("OpenAPI 3.2 options", () => {
  it("openapiTS with excludeDeprecated writes query?: never and drops deprecated additional operations", async () => {
    const document = documentWith({
      query: { deprecated: true, ...NO_CONTENT },
      additionalOperations: { LOCK: { deprecated: true, ...NO_CONTENT }, UNLOCK: NO_CONTENT },
    });

    const output = await generate(document, { excludeDeprecated: true });

    expect(output).toContain("        query?: never;");
    expect(output).not.toMatch(/^ +LOCK: \{/m);
    expect(output).toContain("            UNLOCK: {");
  });

  it("openapiTS with excludeDeprecated and only deprecated additional operations writes no member", async () => {
    const document = documentWith({ additionalOperations: { LOCK: { deprecated: true, ...NO_CONTENT } } });

    expect(await generate(document, { excludeDeprecated: true })).not.toContain("additionalOperations");
  });

  it("openapiTS with immutable makes the new members readonly", async () => {
    const document = documentWith({
      query: NO_CONTENT,
      additionalOperations: { LOCK: NO_CONTENT },
      post: {
        requestBody: { content: { "application/jsonl": { itemSchema: { type: "string" } } } },
        ...NO_CONTENT,
      },
    });

    const output = await generate(document, { immutable: true });

    expect(output).toContain("        readonly query: {");
    expect(output).toContain("        readonly additionalOperations: {\n            readonly LOCK: {");
    expect(output).toContain('readonly itemContent: {\n                    readonly "application/jsonl": string;');
  });

  it("openapiTS with alphabetize sorts additionalOperations and itemContent keys", async () => {
    const stream = { itemSchema: { type: "string" } };
    const document = documentWith({
      additionalOperations: { UNLOCK: NO_CONTENT, LOCK: NO_CONTENT },
      get: {
        responses: {
          200: { description: "ok", content: { "text/event-stream": stream, "application/jsonl": stream } },
        },
      },
    });

    const output = await generate(document, { alphabetize: true });

    expect(output.indexOf("LOCK: {")).toBeLessThan(output.indexOf("UNLOCK: {"));
    const itemContent = blockOf(output, "itemContent: {");
    expect(itemContent.indexOf("application/jsonl")).toBeLessThan(itemContent.indexOf("text/event-stream"));
  });

  it("openapiTS with rootTypes exports media type components", async () => {
    const document = documentWith(NO_CONTENT, { mediaTypes: { Lines: { schema: { type: "string" } } } });

    const output = await generate(document, { rootTypes: true });

    expect(output).toContain("export type MediaTypeLines = components['mediaTypes']['Lines'];");
  });

  it("openapiTS with makePathsEnum lists query and additional operations", async () => {
    const document = documentWith({ query: NO_CONTENT, additionalOperations: { LOCK: NO_CONTENT } });

    const output = await generate(document, { makePathsEnum: true });

    expect(output).toContain('QueryItems = "/items/{id}"');
    expect(output).toContain('LOCKItems = "/items/{id}"');
  });

  it("openapiTS with pathParamsAsTypes reads path parameters of a query operation", async () => {
    const id = { name: "id", in: "path", required: true, schema: { type: "integer" } };
    const document = documentWith({ query: { parameters: [id], ...NO_CONTENT } });

    const output = await generate(document, { pathParamsAsTypes: true });

    // biome-ignore lint/suspicious/noTemplateCurlyInString: the expected text is a template literal type
    expect(output).toContain("[path: `/items/${number}`]: {");
  });
});

describe("OpenAPI 3.2 querystring parameters", () => {
  const filter = { $ref: "#/components/parameters/Filter" };
  const components = {
    parameters: {
      Filter: {
        name: "filter",
        in: "querystring",
        content: {
          "application/x-www-form-urlencoded": { schema: { type: "object", properties: { q: { type: "string" } } } },
        },
      },
    },
  };

  it("openapiTS types a referenced optional querystring as an optional query member", async () => {
    const output = await generate(documentWith({ get: { parameters: [filter], ...NO_CONTENT } }, components));

    expect(output).toContain('query?: components["parameters"]["Filter"];');
    expect(blockOf(output, "        Filter: {")).toContain("q?: string;");
  });

  it("openapiTS takes a querystring parameter of the path item", async () => {
    const output = await generate(documentWith({ parameters: [filter], get: NO_CONTENT }, components));

    expect(blockOf(output, "        get: {")).toContain('query?: components["parameters"]["Filter"];');
  });

  it("openapiTS types a querystring without content as string", async () => {
    const parameter = { name: "raw", in: "querystring", required: true };

    const output = await generate(documentWith({ get: { parameters: [parameter], ...NO_CONTENT } }));

    expect(blockOf(output, "        get: {")).toContain("            query: string;");
  });

  it("openapiTS next to in: query parameters keeps them and warns about the querystring", async () => {
    const limit = { name: "limit", in: "query", schema: { type: "integer" } };
    const document = documentWith({ get: { parameters: [filter, limit], ...NO_CONTENT } }, components);

    const output = await generate(document);
    const warnings = await warningsOf(document);

    expect(blockOf(output, "        get: {")).toContain("limit?: number;");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('#/paths/~1items~1{id}/get/parameters/0 is an "in: querystring" parameter');
  });
});

describe("OpenAPI 3.2 discriminators", () => {
  it("openapiTS with an allOf item whose discriminator has no propertyName omits nothing", async () => {
    const document = documentWith(NO_CONTENT, {
      schemas: {
        Pet: {
          allOf: [
            { type: "object", properties: { name: { type: "string" } }, discriminator: { defaultMapping: "Pet" } },
          ],
        },
      },
    });

    const output = await generate(document);

    expect(blockOf(output, "        Pet: {")).toContain("name?: string;");
    expect(output).not.toContain("Omit<");
  });
});
