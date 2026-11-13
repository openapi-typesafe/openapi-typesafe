import { describe, expect, it } from "vitest";
import { createDocumentRun } from "../../src/api/document-run.js";
import { defaultGeneratorPorts } from "../../src/api/openapi-ts.js";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions } from "../../src/index.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { typeErrorsOf } from "../typescript-diagnostics.js";

/** The `read-write-refs` fix (ADR-021, upstream #1938). */

const PARTICIPANT_TYPE = { type: "string", readOnly: true, enum: ["MAIN", "CO"] };
const SECRET = { type: "string", writeOnly: true };
const TYPE_REF = { $ref: "#/components/schemas/ParticipantType" };

function documentWith(properties: Record<string, unknown>, openapi = "3.1.0"): OpenAPI3 {
  return {
    openapi,
    info: { title: "t", version: "1" },
    paths: {},
    components: {
      schemas: {
        ParticipantType: PARTICIPANT_TYPE,
        Secret: SECRET,
        Alias: TYPE_REF,
        Participant: { type: "object", required: ["kind"], properties },
      },
    },
  } as unknown as OpenAPI3;
}

async function generate(document: OpenAPI3, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(document, { silent: true, ...options }));
}

async function fixed(properties: Record<string, unknown>, options: OpenAPITSOptions = {}) {
  return generate(documentWith(properties), { fix: ["read-write-refs"], ...options });
}

const KIND = 'kind: components["schemas"]["ParticipantType"];';
const READONLY_KIND = `readonly ${KIND}`;

describe("read-write-refs fix", () => {
  it("openapiTS without the fix ignores readOnly of the referenced schema", async () => {
    expect(await generate(documentWith({ kind: TYPE_REF }))).toContain(`            ${KIND}`);
  });

  it("openapiTS with the fix makes a property readonly whose referenced schema is readOnly", async () => {
    expect(await fixed({ kind: TYPE_REF })).toContain(READONLY_KIND);
  });

  it("openapiTS with the fix does the same for OpenAPI 3.0, where the reference is the definition", async () => {
    const output = await generate(documentWith({ kind: TYPE_REF }, "3.0.3"), { fix: ["read-write-refs"] });

    expect(output).toContain(READONLY_KIND);
  });

  it("openapiTS with the fix follows a reference to a reference and an allOf member", async () => {
    const output = await fixed({
      kind: { $ref: "#/components/schemas/Alias" },
      other: { allOf: [TYPE_REF], description: "d" },
    });

    expect(output).toContain('readonly kind: components["schemas"]["Alias"];');
    expect(output).toMatch(/readonly other\?: components\["schemas"\]\["ParticipantType"\];/);
  });

  it("openapiTS with the fix does not read anyOf or oneOf members, which may not apply", async () => {
    const output = await fixed({ kind: { anyOf: [TYPE_REF, { type: "number" }] } });

    expect(output).not.toContain("readonly kind");
  });

  it("openapiTS with the fix and --read-write-markers wraps the property in $Read and $Write", async () => {
    const output = await fixed(
      { kind: TYPE_REF, secret: { $ref: "#/components/schemas/Secret" } },
      { readWriteMarkers: true },
    );

    expect(output).toContain('kind: $Read<components["schemas"]["ParticipantType"]>;');
    expect(output).toContain('secret?: $Write<components["schemas"]["Secret"]>;');
  });

  it("openapiTS with the fix and --read-write-markers adds no marker to a property both flags apply to", async () => {
    const output = await fixed(
      { secret: { allOf: [TYPE_REF, { $ref: "#/components/schemas/Secret" }] } },
      { readWriteMarkers: true },
    );

    expect(output).not.toContain("secret?: $");
  });

  it("openapiTS with the fix terminates on a recursive schema", async () => {
    const document = documentWith({ kind: TYPE_REF, self: { $ref: "#/components/schemas/Participant" } });

    expect(await generate(document, { fix: ["read-write-refs"] })).toContain(READONLY_KIND);
  });

  it("openapiTS output with the fix compiles and Writable drops the referenced readOnly key", async () => {
    const code = `${await fixed({ kind: TYPE_REF, name: { type: "string" } }, { readWriteMarkers: true })}
type Body = Writable<components["schemas"]["Participant"]>;
const body: Body = { name: "a" };
// @ts-expect-error a readOnly key is not sent
const sent: Body = { name: "a", kind: "MAIN" };`;

    expect(typeErrorsOf(code)).toEqual([]);
  });
});

describe("read-write-refs warnings", () => {
  it("createDocumentRun with the fix resolves $refs to false schemas without a warning", async () => {
    const ports = await defaultGeneratorPorts({ silent: true });
    const logger = new RecordingLogger();
    const source = JSON.stringify({
      openapi: "3.1.0",
      info: { title: "t", version: "1" },
      paths: {},
      components: {
        schemas: {
          Closed: { type: "object", additionalProperties: false, unevaluatedProperties: false },
          Use: {
            type: "object",
            properties: {
              a: { $ref: "#/components/schemas/Closed/additionalProperties" },
              u: { $ref: "#/components/schemas/Closed/unevaluatedProperties" },
            },
          },
        },
      },
    });

    await createDocumentRun(source, { silent: true, fix: ["read-write-refs"] }, { ...ports, logger });

    expect(logger.messages("warn")).toEqual([]);
  });
});
