import { describe, expect, it } from "vitest";
import createClient from "../../src/index.js";

/**
 * What the client returns for each kind of body, which the response types describe
 * (`json-media-types.test-d.ts`): it parses a JSON body of any JSON media type, returns any other
 * error body as text, and rejects a success body that is not JSON under the default `parseAs`.
 */

type Problem = { title: string };
type Pet = { id: string };
type Response<Content> = { headers: {}; content: Content };

type Paths = {
  "/report": {
    get: {
      responses: {
        200: Response<{ "application/vnd.api+json": Pet; "text/plain": string }>;
        400: Response<{ "application/problem+json": Problem }>;
        500: Response<{ "text/html": string }>;
      };
    };
  };
};

const HTML_PAGE = "<h1>Bad gateway</h1>";

function clientAnswering(body: string, init: ResponseInit) {
  return createClient<Paths, `${string}/json`>({
    baseUrl: "https://api.example.com",
    fetch: async () => new Response(body, init),
  });
}

function answer(status: number, contentType: string): ResponseInit {
  return { status, headers: { "Content-Type": contentType } };
}

describe("bodies of JSON and other media types", () => {
  it("GET of a problem+json error returns the parsed body", async () => {
    const client = clientAnswering('{"title":"Not allowed"}', answer(400, "application/problem+json"));

    const { error } = await client.GET("/report");

    expect(error).toEqual({ title: "Not allowed" });
  });

  it("GET of an HTML error returns the text", async () => {
    const client = clientAnswering(HTML_PAGE, answer(500, "text/html"));

    const { error } = await client.GET("/report");

    expect(error).toBe(HTML_PAGE);
  });

  it("GET of a vnd.api+json success with parameters returns the parsed body", async () => {
    const contentType = "application/vnd.api+json; charset=utf-8";
    const client = clientAnswering('{"id":"1"}', answer(200, contentType));

    const { data } = await client.GET("/report");

    expect(data).toEqual({ id: "1" });
  });

  it("GET of a text success rejects under the default parseAs", async () => {
    const client = clientAnswering("ok", answer(200, "text/plain"));

    await expect(client.GET("/report")).rejects.toThrow(SyntaxError);
  });

  it("GET of a text success with parseAs text returns the text", async () => {
    const client = clientAnswering("ok", answer(200, "text/plain"));

    const { data } = await client.GET("/report", { parseAs: "text" });

    expect(data).toBe("ok");
  });
});
