import { describe, expect, it } from "vitest";
import { defaultGeneratorPorts, generateDocument } from "../../src/api/openapi-ts.js";
import { RecordingLogger } from "../fakes/cli-dependencies.js";

const BROKEN_REF_SCHEMA = `openapi: 3.1.0
info: { title: t, version: "1" }
paths: {}
components:
  schemas:
    A: { $ref: "./missing.yaml" }
`;

describe("defaultGeneratorPorts", () => {
  it("defaultGeneratorPorts with a logger gives it the loader's problem lines too", async () => {
    const logger = new RecordingLogger();
    const ports = await defaultGeneratorPorts({}, logger);

    await expect(generateDocument(BROKEN_REF_SCHEMA, {}, ports)).rejects.toMatchObject({
      code: "SCHEMA_INVALID",
    });

    expect(logger.messages("error")).toEqual([expect.stringMatching(/^Can't resolve \$ref: .*missing\.yaml/)]);
  });
});
