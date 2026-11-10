import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  loadFailedError,
  type RefRefusalDetails,
  refForbiddenError,
  schemaInvalidError,
} from "../../src/adapters/redocly-loader/schema-load-errors.js";
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

  it("openapiTS with a stream that fails rejects with SCHEMA_LOAD_FAILED instead of hanging", async () => {
    const stream = new Readable({
      read() {
        this.destroy(new Error("disk unplugged"));
      },
    });

    const error = await failureOf(stream);

    expect(error.code).toBe("SCHEMA_LOAD_FAILED");
    expect(error.message).toContain("disk unplugged");
  });

  it("openapiTS with a number fails with SCHEMA_SOURCE_INVALID", async () => {
    const error = await failureOf(42);

    expect(error).toMatchObject({ code: "SCHEMA_SOURCE_INVALID", details: { received: "number" } });
    expect(error.message).toBe("Expected string, object, or Buffer. Got number");
  });

  it("openapiTS with a missing file fails with SCHEMA_LOAD_FAILED and the reader's message", async () => {
    const missing = path.resolve("/no/such/openapi.yaml");

    const error = await failureOf(pathToFileURL(missing));

    expect(error).toMatchObject({ code: "SCHEMA_LOAD_FAILED", details: { source: missing } });
    expect(error.message).toContain("ENOENT");
    expect(error.cause).toBeInstanceOf(Error);
  });

  it("openapiTS with a file URL that is not a path fails with SCHEMA_LOAD_FAILED", async () => {
    // An encoded slash cannot become a file path on any platform (ERR_INVALID_FILE_URL_PATH).
    const source = new URL("file:///schemas/a%2Fb.yaml");

    const error = await failureOf(source);

    expect(error).toMatchObject({ code: "SCHEMA_LOAD_FAILED", details: { source: source.href } });
    expect(error.cause).toMatchObject({ code: "ERR_INVALID_FILE_URL_PATH" });
  });

  it.each([
    ["json", "{ not json"],
    ["yaml", "openapi: 3.1.0\ninfo: [unclosed"],
  ])("openapiTS with broken %s text fails with SCHEMA_PARSE_FAILED", async (format, text) => {
    const error = await failureOf(text);

    expect(error).toMatchObject({ code: "SCHEMA_PARSE_FAILED", details: { format } });
    expect(error.message).toBe((error.cause as Error).message);
  });

  it.each([
    ["the schema string", "openapi: 3.1.0\ninfo: [unclosed"],
    ["the schema stream", Readable.from(["openapi: 3.1.0\ninfo: [unclosed"])],
  ])("openapiTS with broken YAML text names it %s, in one line", async (name, source) => {
    const error = await failureOf(source);

    expect(error.message).toBe(`unexpected end of the stream within a flow collection in "${name}" (3:1)`);
  });

  it.each([
    ["yaml", "multi-document.yaml"],
    ["yaml", "tab-indent.yaml"],
    ["json", "truncated.json"],
  ])("openapiTS with a broken %s file %s fails with SCHEMA_PARSE_FAILED and names it", async (format, name) => {
    const file = new URL(`../fixtures/broken/${name}`, import.meta.url);

    const error = await failureOf(file);

    expect(error).toMatchObject({ code: "SCHEMA_PARSE_FAILED", details: { format } });
    expect(error.message).toContain(name);
  });

  it.each(["./openapi.yaml", "/abs/openapi.json", "C:\\api\\openapi.yml"])(
    "openapiTS with the path string %s fails with SCHEMA_SOURCE_INVALID and a hint",
    async (path) => {
      const error = await failureOf(path);

      expect(error).toMatchObject({ code: "SCHEMA_SOURCE_INVALID", details: { reason: "path" } });
      expect(error.message).toContain("pathToFileURL");
    },
  );

  it("openapiTS with a stream that holds only a YAML string names the stream (G14)", async () => {
    const error = await failureOf(Readable.from(["hello world"]));

    expect(error).toMatchObject({
      code: "SCHEMA_SOURCE_INVALID",
      details: { reason: "path", received: "stream", text: "hello world" },
    });
    expect(error.message).toMatch(/^The stream held only the YAML string "hello world", not an OpenAPI document\./);
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

/** One refusal of each reason; the `Record` fails to compile when a reason is added or removed. */
const REFUSALS: Readonly<Record<RefRefusalDetails["reason"], RefRefusalDetails>> = {
  "outside-local-root": { reason: "outside-local-root", localRoot: "file:///root/" },
  "host-not-allowed": { reason: "host-not-allowed", allowedHosts: [] },
  "local-ref-from-remote": { reason: "local-ref-from-remote", base: "https://a.test/a.yaml" },
  "too-many-remote-documents": { reason: "too-many-remote-documents", maxDocuments: 1 },
  "remote-document-too-large": { reason: "remote-document-too-large", maxDocumentBytes: 1 },
  "remote-documents-too-large": { reason: "remote-documents-too-large", maxTotalBytes: 1 },
  "remote-documents-too-many-nodes": { reason: "remote-documents-too-many-nodes", maxNodes: 1 },
};

describe("the documented details keys (docs/node.md, Errors)", () => {
  const docs = fs.readFileSync(new URL("../../../../docs/node.md", import.meta.url), "utf8");
  const reasonRow = docs.split("\n").find((line) => line.startsWith("| `SCHEMA_REF_FORBIDDEN` | `reason`"));

  it.each(Object.entries(REFUSALS))("refForbiddenError with %s gives ref and reason", (reason, details) => {
    const error = refForbiddenError("https://user:secret@a.test/b.yaml", details);

    expect(error.details).toMatchObject({ ref: "https://***@a.test/b.yaml", reason });
    expect(reasonRow).toContain(`\`${reason}\``);
  });
});
