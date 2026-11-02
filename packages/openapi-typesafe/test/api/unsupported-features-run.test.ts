import { describe, expect, it } from "vitest";
import { createDocumentRun } from "../../src/api/document-run.js";
import { defaultGeneratorPorts } from "../../src/api/openapi-ts.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";

/**
 * OpenAPI 3.2 features that the types leave out must be reported, not dropped in silence
 * (pre-beta test plan, PB-12).
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
  it("createDocumentRun with OpenAPI 3.2 features warns once per use with its pointer", async () => {
    const warnings = await warningsOf(OPENAPI_3_2_DOCUMENT);

    expect(warnings).toHaveLength(3);
    expect(warnings[0]).toContain('#/paths/~1items uses the OpenAPI 3.2 "query" keyword');
    expect(warnings[1]).toContain('"querystring" keyword');
    expect(warnings[2]).toContain("application~1jsonl");
    expect(warnings[2]).toContain("docs/introduction.md#openapi-3-2-support");
  });

  it("createDocumentRun with a 3.1 document does not warn", async () => {
    const document = 'openapi: 3.1.0\ninfo: { title: t, version: "1" }\npaths: {}\n';

    expect(await warningsOf(document)).toEqual([]);
  });
});
