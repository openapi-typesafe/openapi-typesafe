import { describe, expect, it } from "vitest";
import createClient from "../../src/index.js";

/** Response bodies that are not JSON (ADR-041). */

const BASE_URL = "https://api.example.com";
const PROXY_PAGE = `<html><body><h1>502 Bad Gateway</h1>${"<p>nginx</p>".repeat(20)}</body></html>`;
const EXCERPT_LENGTH = 100;

type Paths = {
  "/greeting": {
    get: {
      responses: {
        200: { content: { "application/json": { text: string } } };
        400: { content: { "application/json": { code: number } } };
      };
    };
  };
};

/** A client whose fetch answers every request with `answer()`. */
function clientAnswering(answer: () => Response) {
  return createClient<Paths>({ baseUrl: BASE_URL, fetch: async () => answer() });
}

function typedResponse(body: string, contentType: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": contentType } });
}

/** A response without any Content-Type header. */
function untypedResponse(body: string, status = 200) {
  const response = new Response(body, { status });
  response.headers.delete("Content-Type");
  return response;
}

describe("JSON by default, as in openapi-fetch", () => {
  it("a text/plain body with JSON is parsed as JSON", async () => {
    const client = clientAnswering(() => new Response(JSON.stringify({ text: "hi" })));

    const { data } = await client.GET("/greeting");

    expect(data).toEqual({ text: "hi" });
  });

  it("a JSON body is parsed, with or without Content-Length", async () => {
    const withLength = clientAnswering(() => Response.json({ text: "hi" }));
    const chunked = clientAnswering(() => untypedResponse('{"text":"hi"}'));

    expect((await withLength.GET("/greeting")).data).toEqual({ text: "hi" });
    expect((await chunked.GET("/greeting")).data).toEqual({ text: "hi" });
  });

  it('parseAs "text" reads a text body', async () => {
    const client = clientAnswering(() => typedResponse("hello", "text/plain"));

    expect((await client.GET("/greeting", { parseAs: "text" })).data).toBe("hello");
  });
});

describe("a success body that is not JSON", () => {
  it("an HTML page throws a SyntaxError that names the response", async () => {
    const client = clientAnswering(() => typedResponse(PROXY_PAGE, "application/json"));

    const failure = await client.GET("/greeting").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SyntaxError);
    const message = (failure as SyntaxError).message;
    expect(message).toContain("Response 200 (application/json) is not JSON; set `parseAs`:");
    expect(message).toContain(JSON.stringify(PROXY_PAGE.slice(0, EXCERPT_LENGTH)));
    expect(message).not.toContain(PROXY_PAGE.slice(0, EXCERPT_LENGTH + 1));
    expect((failure as SyntaxError).cause).toBeInstanceOf(SyntaxError);
  });

  it('a text/* body points to parseAs "text"', async () => {
    const client = clientAnswering(() => typedResponse("hello", "text/plain; charset=utf-8"));

    await expect(client.GET("/greeting")).rejects.toThrow(
      'Response 200 (text/plain; charset=utf-8) is not JSON; set `parseAs: "text"`: "hello"',
    );
  });

  it("the error says when the response has no Content-Type", async () => {
    const client = clientAnswering(() => untypedResponse("oops", 201));

    await expect(client.GET("/greeting")).rejects.toThrow(
      'Response 201 (no Content-Type) is not JSON; set `parseAs`: "oops"',
    );
  });
});

describe("an error body", () => {
  it("a JSON error body is parsed", async () => {
    const client = clientAnswering(() => Response.json({ code: 7 }, { status: 400 }));

    expect((await client.GET("/greeting")).error).toEqual({ code: 7 });
  });

  it("an error body that is not JSON stays text", async () => {
    const client = clientAnswering(() => typedResponse(PROXY_PAGE, "text/html", 502));

    const { error, response } = await client.GET("/greeting");

    expect(error).toBe(PROXY_PAGE);
    expect(response.status).toBe(502);
  });
});
