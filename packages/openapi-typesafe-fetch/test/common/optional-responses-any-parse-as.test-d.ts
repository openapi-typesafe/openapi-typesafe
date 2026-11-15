import { describe, expectTypeOf, it } from "vitest";
import type { ResponseObjectMap } from "../../src/helpers.js";
import createClient from "../../src/index.js";

/**
 * Two hand-written shapes: an operation whose `responses` may be `undefined` or left out keeps the
 * bodies of the map it holds, and a `parseAs` typed `any` (read from an untyped config) types the
 * data as `any`, as in openapi-fetch, since the client returns the parsed body.
 */

type Json<Body> = { headers: {}; content: { "application/json": Body } };
type Count = { 200: Json<number> };
type Paths = {
  "/maybe": { get: { parameters: {}; responses: Count | undefined } };
  "/optional": { get: { parameters: {}; responses?: Count } };
  "/items": { get: { parameters: {}; responses: { 200: Json<string[]> } } };
};

const client = createClient<Paths>({ baseUrl: "https://api.example.com" });
// biome-ignore lint/suspicious/noExplicitAny: a parseAs read from an untyped config
const config: { parseAs: any } = JSON.parse('{"parseAs":"json"}');

describe("optional responses and an any parseAs", () => {
  it("ResponseObjectMap of responses that may be undefined is the map", () => {
    expectTypeOf<ResponseObjectMap<Paths["/maybe"]["get"]>>().toEqualTypeOf<Count>();
    expectTypeOf<ResponseObjectMap<Paths["/optional"]["get"]>>().toEqualTypeOf<Count>();
  });

  it("GET of responses that may be undefined types data as the body", async () => {
    const call = () => client.GET("/maybe");
    const callOptional = () => client.GET("/optional");

    expectTypeOf<Awaited<ReturnType<typeof call>>["data"]>().toEqualTypeOf<number | undefined>();
    expectTypeOf<Awaited<ReturnType<typeof callOptional>>["data"]>().toEqualTypeOf<
      number | undefined
    >();
  });

  it("GET with a parseAs typed any types data as any", async () => {
    const call = () => client.GET("/items", { parseAs: config.parseAs });
    const callOptional = (parseAs?: typeof config.parseAs) => client.GET("/items", { parseAs });

    expectTypeOf<Awaited<ReturnType<typeof call>>["data"]>().toBeAny();
    expectTypeOf<Awaited<ReturnType<typeof callOptional>>["data"]>().toBeAny();
  });
});
