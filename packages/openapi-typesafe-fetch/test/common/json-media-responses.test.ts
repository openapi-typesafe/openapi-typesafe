import { describe, expect, expectTypeOf, it } from "vitest";
import type { ErrorResponseJSON, SuccessResponseJSON } from "../../src/helpers.js";
import createClient from "../../src/index.js";

/**
 * A response with a `content` map but no media type of the ones asked for added its whole map to
 * the union: the error of `ErrorResponseJSON` for a `text/html` 500 was `{ "text/html": string }`,
 * a body no response has. Such a response now adds nothing.
 */

type Operation = {
  responses: {
    200: { headers: {}; content: { "text/plain": string } };
    302: { headers: {}; content: { "text/plain": string } };
    404: { headers: {}; content: { "application/json": { message: string } } };
    500: { headers: {}; content: { "text/html": string } };
  };
};

type Paths = { "/report": { get: Operation } };

function jsonClient(body: string) {
  return createClient<Paths, `${string}/json`>({
    baseUrl: "https://api.example.com",
    fetch: async () => new Response(body, { headers: { "Content-Type": "text/plain" } }),
  });
}

describe("JSON helper types for responses without a JSON body", () => {
  it("ErrorResponseJSON has only the JSON error bodies", () => {
    expectTypeOf<ErrorResponseJSON<Operation>>().toEqualTypeOf<{ message: string }>();
  });

  it("SuccessResponseJSON of a text-only success is never", () => {
    expectTypeOf<SuccessResponseJSON<Operation>>().toBeNever();
  });

  it("a JSON-only client types the error with the JSON error bodies only", async () => {
    const { error } = await jsonClient("ok").GET("/report", { parseAs: "text" });

    expectTypeOf(error).toEqualTypeOf<{ message: string } | undefined>();
  });

  it("a JSON-only client with parseAs text types the data as a string", async () => {
    const { data } = await jsonClient("ok").GET("/report", { parseAs: "text" });

    expectTypeOf(data).toEqualTypeOf<string | undefined>();
    expect(data).toBe("ok");
  });

  it("a JSON-only client keeps a JSON success body", () => {
    type JsonOperation = {
      responses: {
        200: { headers: {}; content: { "application/json": { id: number } } };
        500: { headers: {}; content: { "text/html": string } };
      };
    };

    expectTypeOf<SuccessResponseJSON<JsonOperation>>().toEqualTypeOf<{ id: number }>();
    expectTypeOf<ErrorResponseJSON<JsonOperation>>().toBeNever();
  });
});
