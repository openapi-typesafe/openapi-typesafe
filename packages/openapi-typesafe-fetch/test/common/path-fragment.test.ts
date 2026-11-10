import { describe, expect, it } from "vitest";
import createClient, { createFinalURL, createQuerySerializer } from "../../src/index.js";

/**
 * A path template with a fragment (`/docs#intro`). The query was added after the fragment, where
 * it is part of the fragment, so `fetch` never sent it.
 */

const OPTIONS = {
  baseUrl: "https://api.example.com",
  querySerializer: createQuerySerializer(),
  pathSerializer: (path: string) => path,
};

describe("a path template with a fragment", () => {
  it("createFinalURL puts the query before the fragment", () => {
    const url = createFinalURL("/docs#intro", { ...OPTIONS, params: { query: { page: 2 } } });

    expect(url).toBe("https://api.example.com/docs?page=2#intro");
  });

  it("createFinalURL joins the query of the template and keeps a ? of the fragment", () => {
    const url = createFinalURL("/docs?lang=en#faq?x", {
      ...OPTIONS,
      params: { query: { page: 2 } },
    });

    expect(url).toBe("https://api.example.com/docs?lang=en&page=2#faq?x");
  });

  it("a ? in the fragment alone does not join the query with &", () => {
    const url = createFinalURL("/docs#faq?x", { ...OPTIONS, params: { query: { page: 2 } } });

    expect(url).toBe("https://api.example.com/docs?page=2#faq?x");
  });

  it("the request has the query before the fragment, which fetch does not send", async () => {
    const urls: string[] = [];
    type Paths = {
      "/docs#intro": {
        get: {
          parameters: { query: { page: number } };
          responses: { 200: { content: { "application/json": string } } };
        };
      };
    };
    const client = createClient<Paths>({
      baseUrl: "https://api.example.com",
      fetch: async (request) => {
        urls.push(request.url);
        return Response.json("ok");
      },
    });

    await client.GET("/docs#intro", { params: { query: { page: 2 } } });

    const sent = new URL(urls[0] ?? "");
    expect(sent.searchParams.get("page")).toBe("2");
    expect(sent.hash).toBe("#intro");
  });
});
