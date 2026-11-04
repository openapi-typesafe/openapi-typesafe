import { describe, expect, expectTypeOf, it } from "vitest";
import createClient, { type RequestBodyOption } from "../../src/index.js";

/**
 * `createClient<any>()` (a placeholder before the schema is generated) knows nothing about an
 * operation, so the init is optional. `RequestBodyOption<any>` was `{ body?: never } | { body: any }`:
 * a conditional type on `any` takes both branches, and the second one requires `body` (upstream
 * #2526).
 */

const BASE_URL = "https://api.example.com";

function createAnyClient(methods: string[] = []) {
  return createClient<any>({
    baseUrl: BASE_URL,
    fetch: async (request) => {
      methods.push(request.method);
      return Response.json({ ok: true });
    },
  });
}

describe("createClient<any>", () => {
  it("RequestBodyOption of any makes the body optional", () => {
    expectTypeOf<RequestBodyOption<any>>().toEqualTypeOf<{ body?: any }>();
  });

  it("GET without an init sends the request", async () => {
    const methods: string[] = [];
    const client = createAnyClient(methods);

    const { data } = await client.GET("/users/me");

    expect(methods).toEqual(["GET"]);
    expect(data).toEqual({ ok: true });
  });

  it("POST takes an init with or without a body", async () => {
    const methods: string[] = [];
    const client = createAnyClient(methods);

    await client.POST("/users");
    await client.POST("/users", { body: { name: "Ada" } });
    await client.request("post", "/users");

    expect(methods).toEqual(["POST", "POST", "POST"]);
  });
});
