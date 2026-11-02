import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { loadFailedError, schemaInvalidError } from "../../src/adapters/redocly-loader/schema-load-errors.js";
import openapiTS, { type OpenAPITypesafeError } from "../../src/index.js";

const INFO = { title: "Test", version: "1.0" };

async function failureOf(source: unknown): Promise<OpenAPITypesafeError> {
  try {
    await openapiTS(source as never, { silent: true });
  } catch (error) {
    return error as OpenAPITypesafeError;
  }
  throw new Error("openapiTS should have failed");
}

describe("schema load errors", () => {
  it("openapiTS with no source fails with SCHEMA_SOURCE_EMPTY", async () => {
    const error = await failureOf("");

    expect(error).toMatchObject({
      code: "SCHEMA_SOURCE_EMPTY",
      message: "Empty schema. Please specify a URL, file path, or Redocly Config",
    });
  });

  it("openapiTS with an empty stream fails with SCHEMA_SOURCE_EMPTY", async () => {
    const error = await failureOf(Readable.from([""]));

    expect(error).toMatchObject({ code: "SCHEMA_SOURCE_EMPTY", message: "Can’t parse empty schema" });
  });

  it("openapiTS with a number fails with SCHEMA_SOURCE_INVALID", async () => {
    const error = await failureOf(42);

    expect(error).toMatchObject({ code: "SCHEMA_SOURCE_INVALID", details: { received: "number" } });
    expect(error.message).toBe("Expected string, object, or Buffer. Got number");
  });

  it("openapiTS with a missing file fails with SCHEMA_LOAD_FAILED and the reader's message", async () => {
    const error = await failureOf(new URL("file:///no/such/openapi.yaml"));

    expect(error).toMatchObject({
      code: "SCHEMA_LOAD_FAILED",
      details: { source: "/no/such/openapi.yaml" },
    });
    expect(error.message).toContain("ENOENT");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it.each([
    ["json", "{ not json"],
    ["yaml", "openapi: 3.1.0\ninfo: [unclosed"],
  ])("openapiTS with broken %s text fails with SCHEMA_PARSE_FAILED", async (format, text) => {
    const error = await failureOf(text);

    expect(error).toMatchObject({ code: "SCHEMA_PARSE_FAILED", details: { format } });
    expect(error.message).toBe((error.cause as Error).message);
  });

  it("openapiTS with OpenAPI 2.0 fails with SCHEMA_VERSION_UNSUPPORTED and the version", async () => {
    const error = await failureOf({ openapi: "2.0", info: INFO });

    expect(error).toMatchObject({
      code: "SCHEMA_VERSION_UNSUPPORTED",
      message: "Unsupported OpenAPI version: 2.0",
      details: { openapi: "2.0", swagger: undefined },
    });
  });

  it("openapiTS with lint errors fails with SCHEMA_INVALID listing every error", async () => {
    const schema = {
      openapi: "3.1.0",
      info: INFO,
      components: { schemas: { A: { $ref: "#/components/schemas/Missing" } } },
    };

    const error = await failureOf(schema);

    expect(error.code).toBe("SCHEMA_INVALID");
    expect(error.details.problems).toEqual([error.message]);
    expect(error.message).toMatch(/^Can't resolve \$ref/);
  });
});

describe("schema load error factories", () => {
  it("loadFailedError with a thrown non-error uses its text as the message", () => {
    const error = loadFailedError("/a.yaml", "socket hang up");

    expect(error).toMatchObject({ code: "SCHEMA_LOAD_FAILED", message: "socket hang up" });
    expect(error.cause).toBe("socket hang up");
  });

  it("schemaInvalidError without problems has an empty message", () => {
    expect(schemaInvalidError([])).toMatchObject({ message: "", details: { problems: [] } });
  });
});
