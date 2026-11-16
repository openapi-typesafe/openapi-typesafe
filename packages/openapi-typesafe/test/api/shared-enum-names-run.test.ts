import { describe, expect, it } from "vitest";
import { createDocumentRun } from "../../src/api/document-run.js";
import { defaultGeneratorPorts } from "../../src/api/openapi-ts.js";
import transformSchema from "../../src/api/transform-schema.js";
import type { GeneratorOptions } from "../../src/types.js";

/** How a run names the enums that `--dedupe-enums` shares (ADR-021, ADR-024). */

const DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "t", version: "1" },
  paths: {},
  components: { schemas: { Kind: { type: "string", enum: ["a", "b"] } } },
};

describe("transformSchema footer", () => {
  it("transformSchema keeps the footer a run has already", async () => {
    const options: GeneratorOptions = {
      silent: true,
      enum: true,
      dedupeEnums: true,
      fix: ["discriminator-values"],
    };
    const ports = await defaultGeneratorPorts(options);
    const { schema, ctx } = await createDocumentRun(JSON.stringify(DOCUMENT), options, ports);

    transformSchema(schema, ctx);
    const footer = ctx.runFooter;
    transformSchema(schema, ctx);

    expect(footer).toBeDefined();
    expect(ctx.runFooter).toBe(footer);
  });
});
