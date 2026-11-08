import fs from "node:fs";
import { createConfig } from "@redocly/openapi-core";
import { describe, expect, it } from "vitest";
import { createRedoclySchemaLoader } from "../../src/adapters/redocly-loader/redocly-schema-loader.js";
import { DEFAULT_REMOTE_DOCUMENT_LIMITS } from "../../src/api/default-ports.js";
import { resolveDocumentRef } from "../../src/api/document-refs.js";
import { createDocumentRun } from "../../src/api/document-run.js";
import { defaultGeneratorPorts } from "../../src/api/openapi-ts.js";
import { WARNING_CODES as DOMAIN_WARNING_CODES } from "../../src/domain/warnings.js";
import { WARNING_CODES } from "../../src/index.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";

/** Every warning ends with a stable code (docs/cli.md, "Warnings"). */

const DOCUMENT_START = 'openapi: 3.1.0\ninfo: { title: t, version: "1" }\n';

/** The warnings of a run, from the loader too, with the default rules of the CLI. */
async function warningsOf(source: string): Promise<string[]> {
  const ports = await defaultGeneratorPorts({ silent: true });
  const logger = new RecordingLogger();
  const redoc = await createConfig(
    { rules: { "operation-operationId-unique": { severity: "warn" } } },
    { extends: ["minimal"] },
  );
  const loader = createRedoclySchemaLoader({
    redoc,
    logger,
    now: ports.now,
    remoteRefTimeoutMs: 1000,
    remoteDocumentLimits: DEFAULT_REMOTE_DOCUMENT_LIMITS,
  });
  await createDocumentRun(source, { silent: true }, { ...ports, redoc, loader, logger });
  return logger.messages("warn");
}

describe("warning codes", () => {
  it("createDocumentRun with a Redocly lint warning ends it with the rule and LINT_PROBLEM", async () => {
    const operation = (path: string) =>
      `  ${path}: { get: { operationId: same, responses: { "204": { description: none } } } }`;

    const warnings = await warningsOf(`${DOCUMENT_START}paths:\n${operation("/a")}\n${operation("/b")}\n`);

    expect(warnings).toEqual([
      "Every operation must have a unique `operationId`. at #/paths/~1b/get/same, " +
        "rule operation-operationId-unique (LINT_PROBLEM)",
    ]);
  });

  it("createDocumentRun with a discriminator mapping to a non-object schema warns with DISCRIMINATOR_MAPPING_INVALID", async () => {
    const schemas = `components:
  schemas:
    Pet:
      oneOf: [{ $ref: "#/components/schemas/Name" }]
      discriminator: { propertyName: kind, mapping: { name: "#/components/schemas/Name" } }
    Name: { type: string }
`;

    const warnings = await warningsOf(`${DOCUMENT_START}paths: {}\n${schemas}`);

    expect(warnings).toEqual([
      "Discriminator mapping has an invalid schema (neither an object schema nor an allOf array): " +
        "#/components/schemas/Name => name (Discriminator: #/components/schemas/Pet) (DISCRIMINATOR_MAPPING_INVALID)",
    ]);
  });

  it("resolveDocumentRef with a missing target warns with REF_NOT_FOUND", () => {
    const logger = new RecordingLogger();

    resolveDocumentRef({ components: {} }, "#/components/schemas/Missing", { logger, silent: false });

    expect(logger.messages("warn")).toEqual(['Could not resolve $ref "#/components/schemas/Missing" (REF_NOT_FOUND)']);
  });

  it("resolveDocumentRef with a ring of refs warns with REF_CIRCULAR", () => {
    const logger = new RecordingLogger();
    const schemas = { A: { $ref: "#/components/schemas/B" }, B: { $ref: "#/components/schemas/A" } };

    resolveDocumentRef({ components: { schemas } }, "#/components/schemas/A", { logger, silent: false });

    expect(logger.messages("warn")).toEqual([
      'Could not resolve circular $ref "#/components/schemas/A" (REF_CIRCULAR)',
    ]);
  });

  it("the package entry exports every warning code, and docs/cli.md lists each one", () => {
    const docs = fs.readFileSync(new URL("../../../../docs/cli.md", import.meta.url), "utf8");

    expect(WARNING_CODES).toEqual(DOMAIN_WARNING_CODES);
    for (const code of Object.values(WARNING_CODES)) {
      expect(docs).toContain(`| \`${code}\` |`);
    }
  });
});
