import { describe, expect, it } from "vitest";
import { RemoteBodyLimit } from "../../../src/adapters/redocly-loader/remote-body-limit.js";

const URL_TEXT = "https://a.example/doc.json";

/** A response whose body arrives in the given chunks; `cancelled` tells whether it was stopped. */
function streamed(chunks: readonly string[]): { response: Response; cancelled: () => boolean } {
  let isCancelled = false;
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
    cancel() {
      isCancelled = true;
    },
  });
  return { response: new Response(body), cancelled: () => isCancelled };
}

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("The read should have failed");
}

describe("RemoteBodyLimit", () => {
  it("read returns the whole body within the limits", async () => {
    const limit = new RemoteBodyLimit({ maxDocumentBytes: 10, maxTotalBytes: 10 });

    const body = await limit.read(streamed(["abc", "def"]).response, URL_TEXT);

    expect(new TextDecoder().decode(body)).toBe("abcdef");
  });

  it("read returns an empty body for a response without one", async () => {
    const limit = new RemoteBodyLimit({ maxDocumentBytes: 1, maxTotalBytes: 1 });

    expect((await limit.read(new Response(null), URL_TEXT)).byteLength).toBe(0);
  });

  it("read stops a body past the document limit and cancels the rest", async () => {
    const limit = new RemoteBodyLimit({ maxDocumentBytes: 4, maxTotalBytes: 100 });
    const { response, cancelled } = streamed(["abc", "def", "ghi"]);

    const error = await failureOf(limit.read(response, URL_TEXT));

    expect(error).toMatchObject({
      code: "SCHEMA_REF_FORBIDDEN",
      message: `Refused to load ${URL_TEXT}: its body is larger than 4 bytes once decoded`,
      details: { reason: "remote-document-too-large", maxDocumentBytes: 4 },
    });
    expect(cancelled()).toBe(true);
  });

  it("read stops the document that passes the total of the load", async () => {
    const limit = new RemoteBodyLimit({ maxDocumentBytes: 4, maxTotalBytes: 6 });
    await limit.read(streamed(["abcd"]).response, URL_TEXT);

    const error = await failureOf(limit.read(streamed(["efg"]).response, URL_TEXT));

    expect(error).toMatchObject({
      details: { reason: "remote-documents-too-large", maxTotalBytes: 6 },
    });
  });

  it("read names a limit of whole mebibytes in MiB", async () => {
    const mebibyte = 1024 * 1024;
    const limit = new RemoteBodyLimit({ maxDocumentBytes: mebibyte, maxTotalBytes: mebibyte });

    const error = await failureOf(
      limit.read(streamed(["x".repeat(mebibyte + 1)]).response, URL_TEXT),
    );

    expect((error as Error).message).toContain("larger than 1 MiB once decoded");
  });
});
