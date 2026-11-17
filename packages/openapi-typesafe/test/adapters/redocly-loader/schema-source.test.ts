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

      expect(resolved).toEqual({
        kind: "url",
        url: new URL("api.yaml", CWD),
        written: RELATIVE_FILE_URL,
      });
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

  it.each([
    ["a URL", () => new URL("s3://user:secret@bucket/a.yaml")],
    ["a string", () => "s3://user:secret@bucket/a.yaml"],
    ["a stream", () => Readable.from(["S3://user:secret@bucket/a.yaml\n"])],
  ])(
    "resolveSchemaSource with an s3: URL as %s fails with SCHEMA_SOURCE_INVALID",
    async (_, source) => {
      const error = await resolveSchemaSource(source(), CWD).catch((failure: unknown) => failure);

      expect(error).toBeInstanceOf(OpenAPITypesafeError);
      expect(error).toMatchObject({
        code: "SCHEMA_SOURCE_INVALID",
        message:
          "The schema s3://***@bucket/a.yaml is a s3: URL, which the generator cannot read. " +
          "Pass a file path, a file: URL or an http(s) URL",
        details: { reason: "unsupported-scheme", received: "url", text: "s3://***@bucket/a.yaml" },
      });
    },
  );

  it.each(["https://example.com/a.yaml", "HTTP://example.com/a.yaml", "file:api.yaml"])(
    "resolveSchemaSource with the URL %s that the generator reads resolves it",
    async (location) => {
      expect(await resolveSchemaSource(location, CWD)).toEqual({
        kind: "url",
        url: new URL(location, CWD),
        written: location,
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

  it.each([
    ["http:tok:SECRET@[::1/x?key=SECRET", "http:***@[::1/x?***"],
    ["HTTP:\\\\[::1\\x?key=SECRET", "HTTP:\\\\[::1\\x?***"],
  ])(
    "resolveSchemaSource with the text %j that does not parse hides its secrets",
    async (location, shown) => {
      const error = await resolveSchemaSource(location, CWD).catch((failure: unknown) => failure);

      expect(error).toMatchObject({
        message: `The string ${shown} starts like a URL but is not a valid URL`,
        details: { reason: "url", received: "string", text: shown },
      });
    },
  );
});

describe("resolveSchemaSource with the text a URL was written as", () => {
  it("resolveSchemaSource with a URL and its text keeps the text", async () => {
    const written = "http://example.com/my root.yaml";

    const resolved = await resolveSchemaSource(new URL(written), CWD, written);

    expect(resolved).toEqual({ kind: "url", url: new URL(written), written });
  });

  it("resolveSchemaSource with a URL alone has no text", async () => {
    const resolved = await resolveSchemaSource(new URL("http://example.com/a.yaml"), CWD);

    expect(resolved).not.toHaveProperty("written");
  });
});
