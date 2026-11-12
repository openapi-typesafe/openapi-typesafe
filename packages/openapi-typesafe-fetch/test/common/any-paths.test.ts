// biome-ignore-all lint/suspicious/noExplicitAny: these tests cover the createClient<any> placeholder
import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  ErrorResponse,
  ErrorResponseJSON,
  SuccessResponse,
  SuccessResponseJSON,
} from "../../src/helpers.js";
import createClient, {
  type Client,
  type MethodResponse,
  type RequestBodyOption,
} from "../../src/index.js";

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

  it("GET types the data and the error as any", async () => {
    const result = await createAnyClient().GET("/users/me");

    expectTypeOf(result.data).toBeAny();
    expectTypeOf(result.error).toBeAny();
    if (result.error) {
      expectTypeOf(result).not.toBeNever();
    }
  });

  it("SuccessResponse, ErrorResponse and MethodResponse of any are any", () => {
    expectTypeOf<SuccessResponse<any>>().toBeAny();
    expectTypeOf<ErrorResponse<any>>().toBeAny();
    expectTypeOf<SuccessResponseJSON<any>>().toBeAny();
    expectTypeOf<ErrorResponseJSON<any>>().toBeAny();
    expectTypeOf<MethodResponse<Client<any>, "get", "/users/me">>().toBeAny();
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
