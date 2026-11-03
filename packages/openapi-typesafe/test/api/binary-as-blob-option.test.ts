import { describe, expect, it } from "vitest";
import openapiTS, { astToString, type OpenAPI3, type OpenAPITSOptions, type SchemaObject } from "../../src/index.js";

/** `binaryAsBlob` types raw binary strings as `Blob` (roadmap R1; upstream #1214, PR #2878). */

const UPLOAD_SCHEMA: SchemaObject = {
  type: "object",
  required: ["file"],
  properties: {
    file: { type: "string", format: "binary" },
    attachments: { type: "array", items: { type: "string", format: "binary" } },
    pair: { type: "array", items: { type: "string", format: "binary" }, minItems: 2, maxItems: 2 },
    checksum: { type: "string", format: "byte", readOnly: true },
  },
};

const DOCUMENT_3_0: OpenAPI3 = {
  openapi: "3.0.3",
  info: { title: "Files", version: "1.0.0" },
  paths: {
    "/files": {
      post: {
        operationId: "uploadFile",
        parameters: [{ name: "X-Chunk", in: "header", schema: { type: "string", format: "binary" } }],
        requestBody: {
          required: true,
          content: { "multipart/form-data": { schema: { $ref: "#/components/schemas/Upload" } } },
        },
        responses: {
          200: {
            description: "The stored file",
            content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
          },
        },
      },
    },
  },
  components: { schemas: { Upload: UPLOAD_SCHEMA } },
};

const DOCUMENT_3_1: OpenAPI3 = {
  openapi: "3.1.0",
  info: { title: "Files", version: "1.0.0" },
  paths: {},
  components: {
    schemas: {
      // OpenAPI 3.1 allows a binary schema without `type`; the inherited SchemaObject type does not.
      Avatar: { contentMediaType: "image/png" } as SchemaObject,
      Form: {
        type: "object",
        required: ["image", "metadata"],
        properties: {
          image: { type: ["string", "null"], contentMediaType: "image/webp" },
          metadata: { type: "string", contentMediaType: "application/json" },
          thumbnail: { type: "string", contentMediaType: "image/png", contentEncoding: "base64" },
        },
      },
    },
  },
};

async function generate(document: OpenAPI3, options: OpenAPITSOptions = {}): Promise<string> {
  return astToString(await openapiTS(structuredClone(document), { silent: true, binaryAsBlob: true, ...options }));
}

describe("the binaryAsBlob option", () => {
  it("openapiTS without binaryAsBlob keeps binary strings as string", async () => {
    const output = await generate(DOCUMENT_3_0, { binaryAsBlob: false });

    expect(output).not.toContain("Blob");
  });

  it("openapiTS with binaryAsBlob types multipart fields, arrays and responses as Blob", async () => {
    const output = await generate(DOCUMENT_3_0);

    expect(output).toContain("            file: Blob;");
    expect(output).toContain("            attachments?: Blob[];");
    expect(output).toContain("            readonly checksum?: string;");
    expect(output).toContain('                    "application/octet-stream": Blob;');
    expect(output).toContain('                "X-Chunk"?: Blob;');
  });

  it("openapiTS with binaryAsBlob and OpenAPI 3.1 reads contentMediaType", async () => {
    const output = await generate(DOCUMENT_3_1);

    expect(output).toContain("        Avatar: Blob;");
    expect(output).toContain("            image: Blob | null;");
    expect(output).toContain("            metadata: string;");
    expect(output).toContain("            thumbnail?: string;");
  });

  it("openapiTS with binaryAsBlob and immutable makes the properties readonly, not Blob", async () => {
    const output = await generate(DOCUMENT_3_0, { immutable: true });

    expect(output).toContain("            readonly file: Blob;");
    expect(output).toContain("            readonly attachments?: readonly Blob[];");
  });

  it("openapiTS with binaryAsBlob and arrayLength writes Blob tuples", async () => {
    const output = await generate(DOCUMENT_3_0, { arrayLength: true });

    expect(output).toContain("            pair?: [\n                Blob,\n                Blob\n            ];");
  });

  it("openapiTS with binaryAsBlob and readWriteMarkers marks only the readOnly field", async () => {
    const output = await generate(DOCUMENT_3_0, { readWriteMarkers: true });

    expect(output).toContain("            file: Blob;");
    expect(output).toContain("            checksum?: $Read<string>;");
  });
});
