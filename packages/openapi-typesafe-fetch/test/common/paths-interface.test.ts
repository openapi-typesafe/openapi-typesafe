import { describe, expectTypeOf, it } from "vitest";
import type { MediaType } from "../../src/helpers.js";
import createClient, { type ClientMethod, type ClientRequestMethod } from "../../src/index.js";

/**
 * The generator writes `export interface paths`, and an interface has no index signature, so
 * `ClientMethod` and `ClientRequestMethod` rejected it with TS2344 (upstream #2267). They take any
 * `Paths`, like `Client`. Type checks: `tsc` runs them.
 */

type Item = { id: number };

interface paths {
  "/items": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: { responses: { 200: { content: { "application/json": Item[] } } } };
    put?: never;
    post?: never;
  };
}

const client = createClient<paths>({ baseUrl: "https://api.example.com" });

describe("method types with a generated paths interface", () => {
  it("ClientMethod of an interface is the client's GET", () => {
    expectTypeOf<ClientMethod<paths, "get", MediaType>>().toEqualTypeOf(client.GET);
  });

  it("ClientRequestMethod of an interface is the client's request", () => {
    expectTypeOf<ClientRequestMethod<paths, MediaType>>().toEqualTypeOf(client.request);
  });
});
