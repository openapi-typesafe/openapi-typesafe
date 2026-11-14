import { describe, expectTypeOf, it } from "vitest";
import createClient from "../../src/index.js";

/**
 * `client.request(method, path, init)` types `data` by `parseAs` as the method calls do. While the
 * method is not fixed, TypeScript reads the init's contextual type through the method and path
 * constraints; the literals of the init (`parseAs: "text"`, an enum in the body) must keep their
 * types there, or the init falls back to its declared type and `data` to the JSON body.
 */

type Pet = { id: string };
type Status = "available" | "sold";
type Json<Body> = { headers: {}; content: { "application/json": Body } };

type Paths = {
  "/pets": {
    get: {
      parameters: { query?: { status?: Status; tags?: string[] } };
      requestBody?: never;
      responses: { 200: Json<Pet[]> };
    };
    post: {
      parameters: { query?: never };
      requestBody: { content: { "application/json": { kind: "dog" | "cat" } } };
      responses: { 201: Json<Pet> };
    };
  };
  "/pets/{id}": {
    get: {
      parameters: { path: { id: string } };
      requestBody?: never;
      responses: { 200: Json<Pet> };
    };
  };
};

const client = createClient<Paths>({ baseUrl: "https://api.example.com" });

describe("request() parseAs", () => {
  it("request with parseAs text types data as a string", async () => {
    const { data } = await client.request("get", "/pets", { parseAs: "text" });

    expectTypeOf(data).toEqualTypeOf<string | undefined>();
  });

  it("request with parseAs stream types data as the body stream", async () => {
    const { data } = await client.request("get", "/pets", { parseAs: "stream" });

    expectTypeOf(data).toEqualTypeOf<Response["body"] | undefined>();
  });

  it("request with parseAs and literal params types data by parseAs", async () => {
    const { data } = await client.request("get", "/pets", {
      parseAs: "text",
      params: { query: { status: "available", tags: ["a"] } },
    });

    expectTypeOf(data).toEqualTypeOf<string | undefined>();
  });

  it("request with parseAs and a literal body types data by parseAs", async () => {
    const { data } = await client.request("post", "/pets", {
      parseAs: "blob",
      body: { kind: "dog" },
    });

    expectTypeOf(data).toEqualTypeOf<Blob | undefined>();
  });

  it("request with parseAs on a path with a required init types data by parseAs", async () => {
    const { data } = await client.request("get", "/pets/{id}", {
      parseAs: "arrayBuffer",
      params: { path: { id: "1" } },
    });

    expectTypeOf(data).toEqualTypeOf<ArrayBuffer | undefined>();
  });

  it("request without parseAs types data as the JSON body", async () => {
    const { data } = await client.request("get", "/pets", { params: { query: {} } });

    expectTypeOf(data).toEqualTypeOf<Pet[] | undefined>();
  });
});
