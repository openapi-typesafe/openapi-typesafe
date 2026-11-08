import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { warnLegacyCallback } from "../../src/api/legacy-callback-warning.js";
import { defaultGeneratorPorts, generateDeclarations } from "../../src/api/openapi-ts.js";
import type { RunContext } from "../../src/api/run-context.js";
import { DEPRECATION_CODES as DOMAIN_DEPRECATION_CODES } from "../../src/domain/deprecations.js";
import { DEPRECATION_CODES, type GeneratorOptions, type OpenAPI3 } from "../../src/index.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";
import { RecordingDeprecations } from "../fakes/recording-deprecations.js";

/** Every deprecation of what 2.0 removes is a Node.js DeprecationWarning (ADR-004 amendment). */

const DOCUMENT: OpenAPI3 = {
  openapi: "3.1.0",
  info: { title: "Test", version: "1.0.0" },
  paths: {},
  components: {
    schemas: { Item: { type: "object", properties: { name: { type: "string" } } } },
  },
};

/** The deprecations and warnings of one run with in-memory reporters. */
async function reportsOf(options: GeneratorOptions) {
  const logger = new RecordingLogger();
  const deprecations = new RecordingDeprecations();
  const ports = { ...(await defaultGeneratorPorts({ silent: true })), logger, deprecations };

  await generateDeclarations(DOCUMENT, options, ports);

  return { codes: deprecations.codes(), warnings: logger.messages("warn") };
}

describe("deprecations", () => {
  it("warnLegacyCallback reports once per run and callback, with the callback's code", () => {
    const deprecations = new RecordingDeprecations();
    const ctx = { silent: true, deprecations } as unknown as RunContext;

    warnLegacyCallback(ctx, "transform");
    warnLegacyCallback(ctx, "transform");
    warnLegacyCallback(ctx, "transformProperty");

    expect(deprecations.reports).toEqual([
      {
        code: "OPENAPI_TYPESAFE_DEP_TS_TRANSFORM",
        message: expect.stringMatching(/^`transform` returned a TypeScript node\. .*irCallbacks: true/),
      },
      {
        code: "OPENAPI_TYPESAFE_DEP_TS_TRANSFORM_PROPERTY",
        message: expect.stringContaining("removed in 2.0"),
      },
    ]);
  });

  it("a run with TypeScript-node callbacks reports each form, also when silent", async () => {
    const reports = await reportsOf({
      silent: true,
      transform: (schema) =>
        schema.type === "string" ? ts.factory.createLiteralTypeNode(ts.factory.createNull()) : undefined,
      postTransform: (type) => type,
      transformProperty: (property) => property,
    });

    expect(reports.codes).toEqual([
      "OPENAPI_TYPESAFE_DEP_TS_TRANSFORM",
      "OPENAPI_TYPESAFE_DEP_TS_POST_TRANSFORM",
      "OPENAPI_TYPESAFE_DEP_TS_TRANSFORM_PROPERTY",
    ]);
    expect(reports.warnings).toEqual([]);
  });

  it("a run with IR callbacks reports nothing", async () => {
    const reports = await reportsOf({ irCallbacks: true, postTransform: (type) => type });

    expect(reports.codes).toEqual([]);
  });

  it("Node.js shows each code once per process, for the callbacks and stringToAST", async () => {
    const fixture = fileURLToPath(new URL("../fixtures/deprecations-twice.ts", import.meta.url));
    const viteNode = fileURLToPath(new URL("../../node_modules/.bin/vite-node", import.meta.url));

    const { stderr } = await execa(viteNode, [fixture]);

    expect(stderr.match(/DeprecationWarning/g)).toHaveLength(3);
    for (const code of [
      "OPENAPI_TYPESAFE_DEP_TS_POST_TRANSFORM",
      "OPENAPI_TYPESAFE_DEP_TS_TRANSFORM_PROPERTY",
      "OPENAPI_TYPESAFE_DEP_STRING_TO_AST",
    ]) {
      expect(stderr.split(`[${code}] DeprecationWarning`)).toHaveLength(2);
    }
  }, 30_000);

  it("--no-deprecation hides them", async () => {
    const fixture = fileURLToPath(new URL("../fixtures/deprecations-twice.ts", import.meta.url));
    const viteNode = fileURLToPath(new URL("../../node_modules/.bin/vite-node", import.meta.url));

    const { stderr } = await execa(viteNode, [fixture], { env: { NODE_OPTIONS: "--no-deprecation" } });

    expect(stderr).not.toContain("DeprecationWarning");
  }, 30_000);

  it("the package entry exports every code, and docs/node.md lists each one", () => {
    const docs = fs.readFileSync(new URL("../../../../docs/node.md", import.meta.url), "utf8");

    expect(DEPRECATION_CODES).toEqual(DOMAIN_DEPRECATION_CODES);
    for (const code of Object.values(DEPRECATION_CODES)) {
      expect(docs).toContain(`| \`${code}\` |`);
    }
  });
});
