import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveSchemaSource } from "../../../src/adapters/redocly-loader/schema-source.js";
import { OpenAPITypesafeError } from "../../../src/domain/errors.js";

const CWD = pathToFileURL(`${path.resolve("work")}${path.sep}`);
const RELATIVE_FILE_URL = "file:api.yaml";

describe("resolveSchemaSource", () => {
  it.each([
    ["a string", () => RELATIVE_FILE_URL],
    ["a buffer", () => Buffer.from(RELATIVE_FILE_URL)],
    ["a stream", () => Readable.from([`${RELATIVE_FILE_URL}\n`])],
  ])(
    "resolveSchemaSource with a relative file: URL in %s resolves it in the cwd",
    async (_, source) => {
      const resolved = await resolveSchemaSource(source(), CWD);

      expect(resolved).toEqual({ kind: "url", url: new URL("api.yaml", CWD) });
    },
  );

  it.each(["http://example.com/a: b\nopenapi: 3.1.0\n", "file: api.yaml\nopenapi: 3.1.0\n"])(
    "resolveSchemaSource with YAML that starts like a URL keeps the document %j",
    async (text) => {
      expect(await resolveSchemaSource(text, CWD)).toEqual({
        kind: "text",
        text,
        origin: "string",
      });
    },
  );

  it("resolveSchemaSource with a stream that holds a URL that does not parse names the stream", async () => {
    const error = await resolveSchemaSource(Readable.from(["http://[::1/x\n"]), CWD).catch(
      (failure: unknown) => failure,
    );

    expect(error).toBeInstanceOf(OpenAPITypesafeError);
    expect(error).toMatchObject({
      code: "SCHEMA_SOURCE_INVALID",
      message: "The stream text http://[::1/x starts like a URL but is not a valid URL",
      details: { reason: "url", received: "stream", text: "http://[::1/x" },
    });
  });
});
