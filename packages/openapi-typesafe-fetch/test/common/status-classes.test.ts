import { describe, expect, expectTypeOf, it } from "vitest";
import type {
  ErrorResponse,
  ErrorStatusKey,
  OKStatusUnion,
  SuccessResponse,
  SuccessStatusKey,
} from "../../src/helpers.js";
import createClient from "../../src/index.js";

/**
 * A status is a success or an error by its first digit, as `response.ok` reads it at runtime. The
 * types classified by closed lists, so a declared 205, 208 or 226 typed `data` as no body and a
 * 419 left `error` without its body.
 */

type Accepted = { reported: true };
type Expired = { reason: "session expired" };

type Responses = {
  205: { content: { "application/json": { reset: true } } };
  208: { content: { "application/json": Accepted } };
  226: { content: { "application/json": { delta: string } } };
  302: { content: { "application/json": { location: string } } };
  304: { content: never };
  419: { content: { "application/json": Expired } };
  599: { content: { "application/json": { timeout: true } } };
};

type Paths = { "/reports": { post: { responses: Responses } } };

describe("statuses outside the named lists", () => {
  it("SuccessStatusKey has every 2XX status and ErrorStatusKey every other one", () => {
    expectTypeOf<SuccessStatusKey<Responses>>().toEqualTypeOf<205 | 208 | 226>();
    expectTypeOf<ErrorStatusKey<Responses>>().toEqualTypeOf<302 | 304 | 419 | 599>();
  });

  it("the ranges and default are classified as before", () => {
    type Ranges = {
      "1XX": unknown;
      "2XX": unknown;
      "3XX": unknown;
      "4XX": unknown;
      "5XX": unknown;
      default: unknown;
    };

    expectTypeOf<SuccessStatusKey<Ranges>>().toEqualTypeOf<"2XX">();
    expectTypeOf<ErrorStatusKey<Ranges>>().toEqualTypeOf<
      "1XX" | "3XX" | "4XX" | "5XX" | "default"
    >();
  });

  it("SuccessResponse and ErrorResponse have the bodies of those statuses", () => {
    expectTypeOf<SuccessResponse<Responses>>().toEqualTypeOf<
      { reset: true } | Accepted | { delta: string }
    >();
    expectTypeOf<ErrorResponse<Responses>>().toEqualTypeOf<
      { location: string } | Expired | { timeout: true }
    >();
    expectTypeOf<OKStatusUnion<Responses>>().toEqualTypeOf<Responses[205 | 208 | 226]>();
  });

  it("a 208 is data and a 419 is an error", async () => {
    const answers = [Response.json({ reported: true }, { status: 208 })];
    answers.push(Response.json({ reason: "session expired" }, { status: 419 }));
    const client = createClient<Paths>({
      baseUrl: "https://api.example.com",
      fetch: async () => answers.shift() as Response,
    });

    const reported = await client.POST("/reports");
    const expired = await client.POST("/reports");

    expect(reported.data).toEqual({ reported: true });
    expect(expired.error).toEqual({ reason: "session expired" });
    if (expired.error) {
      expectTypeOf(expired.error).toEqualTypeOf<
        { location: string } | Expired | { timeout: true }
      >();
    }
  });

  it("a 302 read with redirect manual is an error with its body", async () => {
    const client = createClient<Paths>({
      baseUrl: "https://api.example.com",
      fetch: async () => Response.json({ location: "/login" }, { status: 302 }),
    });

    const { data, error } = await client.POST("/reports", { redirect: "manual" });

    expect(data).toBeUndefined();
    expect(error).toEqual({ location: "/login" });
  });
});
