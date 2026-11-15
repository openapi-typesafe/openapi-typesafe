import { describe, expectTypeOf, it } from "vitest";
import type { ErrorResponseJSON, SuccessResponseJSON } from "../../src/helpers.js";

/**
 * The JSON helpers of a union of operations are the union of each operation's: each one picks the
 * JSON media types of its own responses, also of the status codes the others do not have, and
 * its media types pick nothing in the others.
 */

type Response<Content> = { headers: {}; content: Content };
type Operation<Responses> = { parameters: {}; responses: Responses };

type Items = Operation<{
  200: Response<{ "application/json": { a: 1 } }>;
  400: Response<{ "application/json": { e: 1 } }>;
}>;
type Pets = Operation<{
  201: Response<{ "application/vnd.api+json": { b: 1 }; "text/html": string }>;
  404: Response<{ "application/problem+json": { p: 1 }; "text/html": string }>;
}>;
type Wide = Operation<{ 200: Response<Record<string, { w: 1 }>> }>;
type Message = Operation<{
  200: Response<{ "message/http; msgtype=application/json": { m: 1 }; "application/json": 1 }>;
  500: Response<{ "message/http; msgtype=application/json": { m: 1 }; "application/json": 2 }>;
}>;

describe("JSON helpers of a union of operations", () => {
  it("ErrorResponseJSON of a union of operations is the union of their JSON errors", () => {
    expectTypeOf<ErrorResponseJSON<Items | Pets>>().toEqualTypeOf<{ e: 1 } | { p: 1 }>();
  });

  it("SuccessResponseJSON of a union of operations is the union of their JSON bodies", () => {
    expectTypeOf<SuccessResponseJSON<Items | Pets>>().toEqualTypeOf<{ a: 1 } | { b: 1 }>();
  });

  it("ErrorResponseJSON of a union does not pick by another operation's media types", () => {
    expectTypeOf<ErrorResponseJSON<Wide | Message>>().toEqualTypeOf<2>();
  });

  it("SuccessResponseJSON of a union does not pick by another operation's media types", () => {
    expectTypeOf<SuccessResponseJSON<Wide | Message>>().toEqualTypeOf<{ w: 1 } | 1>();
  });
});
