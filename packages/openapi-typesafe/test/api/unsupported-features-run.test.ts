import { describe, expect, it } from "vitest";
import { createDocumentRun } from "../../src/api/document-run.js";
import { defaultGeneratorPorts } from "../../src/api/openapi-ts.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";

/**
 * OpenAPI 3.2 uses that the types leave out must be reported, not dropped in silence
 * (pre-beta test plan, PB-12). Since ADR-020 only a querystring next to query parameters is left.
 */

const OPENAPI_3_2_DOCUMENT = `
openapi: 3.2.0
info: { title: t, version: "1" }
paths:
  /items:
    query:
      responses: { "204": { description: none } }
    get:
      parameters:
        - { name: limit, in: query, schema: { type: integer } }
        - { name: filter, in: querystring, content: { text/plain: { schema: { type: string } } } }
      responses:
        "200":
          description: ok
          content: { application/jsonl: { itemSchema: { type: object } } }
`;

async function warningsOf(source: string): Promise<string[]> {
  const ports = await defaultGeneratorPorts({ silent: true });
  const logger = new RecordingLogger();
  await createDocumentRun(source, { silent: true }, { ...ports, logger });
  return logger.messages("warn");
}

describe("unsupported feature warnings", () => {
  it("createDocumentRun warns once for a querystring next to query parameters, with its pointer", async () => {
    const warnings = await warningsOf(OPENAPI_3_2_DOCUMENT);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('#/paths/~1items/get/parameters/1 is an "in: querystring" parameter');
    expect(warnings[0]).toMatch(/docs\/introduction\.md#openapi-3-2-support \(QUERYSTRING_NEXT_TO_QUERY\)$/);
  });

  it("createDocumentRun with a 3.1 document does not warn", async () => {
    const document = 'openapi: 3.1.0\ninfo: { title: t, version: "1" }\npaths: {}\n';

    expect(await warningsOf(document)).toEqual([]);
  });
});
