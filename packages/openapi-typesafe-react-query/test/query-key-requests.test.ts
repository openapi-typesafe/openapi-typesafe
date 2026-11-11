// @vitest-environment node
// Node's own File and FormData: jsdom's do not reach Node's Request.
import { QueryClient } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import { describe, expect, it } from "vitest";
import createClient from "../src/index.js";

type Match = { label: string };
type Paths = {
  "/match": {
    post: {
      requestBody: { content: { "multipart/form-data": { image: Blob } } };
      responses: { 200: { content: { "application/json": Match } } };
    };
  };
  "/items": {
    get: {
      parameters: { query?: { cursor?: string }; header?: { "X-Tenant"?: string } };
      responses: { 200: { content: { "application/json": string[] } } };
    };
  };
};

const BASE_URL = "https://api.example.com";
const MULTIPART = { "Content-Type": "multipart/form-data" } as const;
const STALE_TIME_MS = 60_000;

/** A client whose server names the file it got. */
function matchClient() {
  const fetchClient = createFetchClient<Paths>({
    baseUrl: BASE_URL,
    fetch: async (request: Request) => {
      if (request.method === "GET") {
        return Response.json([]);
      }
      const image = (await request.formData()).get("image") as File;
      return Response.json({ label: `result for ${image.name}` });
    },
  });
  return createClient(fetchClient);
}

describe("query keys of requests", () => {
  it("queryOptions with another File in a multipart object body fetches that file", async () => {
    const $api = matchClient();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { staleTime: STALE_TIME_MS } },
    });
    const cat = new File(["meow"], "cat.png", { type: "image/png" });
    const dog = new File(["woof woof"], "dog.jpg", { type: "image/jpeg" });
    const options = (image: File) =>
      $api.queryOptions("post", "/match", { headers: MULTIPART, body: { image } });

    await queryClient.fetchQuery(options(cat));
    const data = await queryClient.fetchQuery(options(dog));

    expect(data).toEqual({ label: "result for dog.jpg" });
  });

  it("queryOptions with only undefined params and headers shares the key of no init", () => {
    const $api = matchClient();
    const plain = $api.queryOptions("get", "/items").queryKey;

    expect($api.queryOptions("get", "/items", { params: {} }).queryKey).toEqual(plain);
    expect(
      $api.queryOptions("get", "/items", { params: { query: { cursor: undefined } } }).queryKey,
    ).toEqual(plain);
    expect(
      $api.queryOptions("get", "/items", { headers: { "X-Tenant": undefined } }).queryKey,
    ).toEqual(plain);
  });
});
