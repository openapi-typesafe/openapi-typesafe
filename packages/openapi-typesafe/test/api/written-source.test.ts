import { describe, expect, it } from "vitest";
import { defaultGeneratorPorts, generateDocument } from "../../src/api/openapi-ts.js";
import type { LoadedSchema, SchemaLoader, SchemaLoadRequest } from "../../src/application/ports/schema-loader.js";
import type { OpenAPI3 } from "../../src/types.js";

/** The text a `URL` source was written as reaches the loader, which names the root after it. */

const DOCUMENT = { openapi: "3.1.0", info: { title: "t", version: "1" }, paths: {} } as OpenAPI3;

/** A loader that records each request and returns one fixed document. */
class RecordingLoader implements SchemaLoader {
  readonly requests: SchemaLoadRequest[] = [];

  async load(request: SchemaLoadRequest): Promise<LoadedSchema> {
    this.requests.push(request);
    return { document: DOCUMENT, localFiles: [] };
  }
}

describe("generateDocument with the text a URL was written as", () => {
  it("generateDocument passes the text to the loader", async () => {
    const loader = new RecordingLoader();
    const ports = { ...(await defaultGeneratorPorts({ silent: true })), loader };
    const written = "http://example.com/my root.yaml";

    await generateDocument(new URL(written), { silent: true }, ports, written);

    expect(loader.requests.map((request) => request.writtenSource)).toEqual([written]);
  });

  it("generateDocument without the text passes none", async () => {
    const loader = new RecordingLoader();
    const ports = { ...(await defaultGeneratorPorts({ silent: true })), loader };

    await generateDocument(new URL("http://example.com/a.yaml"), { silent: true }, ports);

    expect(loader.requests.map((request) => request.writtenSource)).toEqual([undefined]);
  });
});
