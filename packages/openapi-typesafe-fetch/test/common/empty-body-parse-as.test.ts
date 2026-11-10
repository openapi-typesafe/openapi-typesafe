import { describe, expect, it } from "vitest";
import createClient from "../../src/index.js";

/**
 * An empty success body with `parseAs` other than JSON. Its type is `string`, `Blob`,
 * `ArrayBuffer` or the body stream, but a `Content-Length: 0`, a 204 or a HEAD answer gave
 * `undefined`, while the same empty body without a length gave `""`.
 */

type Paths = {
  "/files": {
    get: { responses: { 200: { content: { "text/plain": string } } } };
    head: { responses: { 200: { content: { "text/plain": string } } } };
    delete: { responses: { 204: { content?: never } } };
  };
};

function clientAnswering(answer: () => Response) {
  return createClient<Paths>({ baseUrl: "https://api.example.com", fetch: async () => answer() });
}

const emptyWithLength = () => new Response("", { headers: { "Content-Length": "0" } });

describe("an empty body read with parseAs", () => {
  it('parseAs "text" reads it as an empty string', async () => {
    const { data } = await clientAnswering(emptyWithLength).GET("/files", { parseAs: "text" });

    expect(data).toBe("");
  });

  it('parseAs "blob" reads it as an empty Blob', async () => {
    const { data } = await clientAnswering(emptyWithLength).GET("/files", { parseAs: "blob" });

    expect(data).toBeInstanceOf(Blob);
    expect(data?.size).toBe(0);
  });

  it('parseAs "arrayBuffer" reads it as an empty ArrayBuffer', async () => {
    const client = clientAnswering(emptyWithLength);

    const { data } = await client.GET("/files", { parseAs: "arrayBuffer" });

    expect(data).toBeInstanceOf(ArrayBuffer);
    expect(data?.byteLength).toBe(0);
  });

  it('parseAs "stream" gives the body stream of the response', async () => {
    const { data, response } = await clientAnswering(emptyWithLength).GET("/files", {
      parseAs: "stream",
    });

    expect(data).toBe(response.body);
    expect(data).not.toBeUndefined();
  });

  it("a 204 and an answer to HEAD read as text are empty strings", async () => {
    const noContent = clientAnswering(() => new Response(null, { status: 204 }));
    const headClient = clientAnswering(() => new Response(null));

    const deleted = await noContent.DELETE("/files", { parseAs: "text" });
    const head = await headClient.HEAD("/files", { parseAs: "text" });

    expect(deleted.data).toBe("");
    expect(head.data).toBe("");
  });

  it("an empty body is no data for JSON and no error", async () => {
    const noContent = clientAnswering(() => new Response(null, { status: 204 }));
    const failed = clientAnswering(
      () => new Response("", { status: 503, headers: { "Content-Length": "0" } }),
    );

    const deleted = await noContent.DELETE("/files");
    const unavailable = await failed.GET("/files", { parseAs: "text" });

    expect(deleted.data).toBeUndefined();
    expect(unavailable.error).toBeUndefined();
  });
});
