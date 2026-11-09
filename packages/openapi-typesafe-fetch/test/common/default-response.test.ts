import { describe, expect, expectTypeOf, it } from "vitest";
import type { SuccessResponse } from "../../src/helpers.js";
import createClient from "../../src/index.js";

/**
 * The `default` response describes every status code the operation does not declare (OpenAPI,
 * Responses Object). With no 2XX response declared, a success can only be a `default` one, but
 * `data` was `never` (upstream #1862). With a 2XX response declared, `default` stays an error.
 */

type Version = { specifiedVersion: string };
type Problem = { message: string };

type Paths = {
  "/versions": {
    get: { responses: { default: { content: { "application/json": Version } } } };
  };
  "/versions/{id}": {
    get: {
      parameters: { path: { id: string } };
      responses: {
        404: { content: { "application/json": Problem } };
        default: { content: { "application/json": Version } };
      };
    };
  };
  "/items": {
    get: {
      responses: {
        200: { content: { "application/json": string[] } };
        default: { content: { "application/json": Problem } };
      };
    };
  };
};

const BASE_URL = "https://api.example.com";

function clientAnswering(body: unknown) {
  return createClient<Paths>({ baseUrl: BASE_URL, fetch: async () => Response.json(body) });
}

describe("operations without a 2XX response", () => {
  it("SuccessResponse of only a default response is the default content", () => {
    type Responses = Paths["/versions"]["get"]["responses"];

    expectTypeOf<SuccessResponse<Responses>>().toEqualTypeOf<Version>();
  });

  it("GET of only a default response types and returns data", async () => {
    const client = clientAnswering({ specifiedVersion: "v6" });

    const { data, error } = await client.GET("/versions");

    expectTypeOf(data).toEqualTypeOf<Version | undefined>();
    expectTypeOf(error).toEqualTypeOf<Version | undefined>();
    expect(data?.specifiedVersion).toBe("v6");
  });

  it("GET of an error and a default response types data as the default content", async () => {
    const client = clientAnswering({ specifiedVersion: "v6" });

    const { data, error } = await client.GET("/versions/{id}", { params: { path: { id: "1" } } });

    expectTypeOf(data).toEqualTypeOf<Version | undefined>();
    expectTypeOf(error).toEqualTypeOf<Problem | Version | undefined>();
    expect(data).toEqual({ specifiedVersion: "v6" });
  });
});

describe("operations with a 2XX response", () => {
  it("GET of a 200 and a default response keeps default as the error only", async () => {
    const client = clientAnswering(["a"]);

    const { data, error } = await client.GET("/items");

    expectTypeOf(data).toEqualTypeOf<string[] | undefined>();
    expectTypeOf(error).toEqualTypeOf<Problem | undefined>();
    expect(data).toEqual(["a"]);
  });
});
