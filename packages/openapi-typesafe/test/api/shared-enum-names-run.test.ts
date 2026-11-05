import { describe, expect, it } from "vitest";
import { FirstSchemaNameRecorder } from "../../src/api/discriminator-enum-names.js";
import { createDocumentRun } from "../../src/api/document-run.js";
import { defaultGeneratorPorts } from "../../src/api/openapi-ts.js";
import transformSchema from "../../src/api/transform-schema.js";
import type { GeneratorOptions } from "../../src/types.js";

/** How a run names the enums that `--dedupe-enums` shares (ADR-021, ADR-024). */

const REQUEST = { name: "/Pet/kind", isComponentSchema: false, values: ["a"], metadata: [] };

const DOCUMENT = {
  openapi: "3.1.0",
  info: { title: "t", version: "1" },
  paths: {},
  components: { schemas: { Kind: { type: "string", enum: ["a", "b"] } } },
};

describe("FirstSchemaNameRecorder", () => {
  it("chosenNames gives the first declaring schema's name, not a reference's", () => {
    const recorder = new FirstSchemaNameRecorder();

    recorder.nameOf("key", "PetKind", { ...REQUEST, isOwnerReference: true });
    recorder.nameOf("key", "OtherKind", REQUEST);
    recorder.nameOf("key", "LaterKind", REQUEST);
    const names = recorder.chosenNames();

    expect(names.nameOf("key", "RunName", REQUEST)).toBe("OtherKind");
    expect(names.nameOf("other", "RunName", REQUEST)).toBe("RunName");
  });
});

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
