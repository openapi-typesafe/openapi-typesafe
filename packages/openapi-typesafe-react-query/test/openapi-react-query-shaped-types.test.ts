import createFetchClient, { type MaybeOptionalInit } from "openapi-typesafe-fetch";
import type { HttpMethod, PathsWithMethod, RequiredKeysOf } from "openapi-typesafe-helpers";
import { describe, expect, it } from "vitest";
import createClient, { type OpenapiQueryClient } from "../src/index.js";

/**
 * Code written against openapi-react-query 0.5.4's types: a hook type a user copied from it, with
 * its init rule (`RequiredKeysOf<Init> extends never ? [Init?, …] : [Init, …]`), that code generic
 * in the paths assigns or casts a hook to. TypeScript relates two conditional types only when
 * their `extends` types are the same, so this compiles only if the hooks use the same rule, as
 * the fetch client does (ADR-030, decision 2). openapi-react-query 0.5.4 compiles this code.
 */

type Item = { id: number };

type Paths = {
  "/items": {
    get: { responses: { 200: { content: { "application/json": Item[] } } } };
  };
  "/items/{id}": {
    get: {
      parameters: { path: { id: number } };
      responses: { 200: { content: { "application/json": Item } } };
    };
  };
};

const BASE_URL = "https://api.example.com";

type InitWithUnknowns<Init> = Init & { [key: string]: unknown };

/**
 * openapi-react-query 0.5.4's `QueryOptionsFunction` init rule, with the options left out, and
 * `P extends {}` instead of its `Record` constraint, which generated paths fail (upstream #2267).
 */
type UpstreamQueryOptions<P extends {}> = <
  Method extends HttpMethod,
  Path extends PathsWithMethod<P, Method>,
  Init extends MaybeOptionalInit<P[Path], Method>,
>(
  method: Method,
  path: Path,
  ...rest: RequiredKeysOf<Init> extends never ? [InitWithUnknowns<Init>?, never?] : [InitWithUnknowns<Init>, never?]
) => { readonly queryKey: readonly unknown[] };

/** A helper generic in the paths, as a library built on openapi-react-query writes it. */
function queryOptionsOf<P extends {}>(api: OpenapiQueryClient<P>): UpstreamQueryOptions<P> {
  const cast = api.queryOptions as UpstreamQueryOptions<P>;
  const assigned: UpstreamQueryOptions<P> = api.queryOptions;
  return cast === assigned ? assigned : cast;
}

describe("hook types written like openapi-react-query's", () => {
  it("code generic in the paths assigns queryOptions to openapi-react-query's type", () => {
    const api = createClient(createFetchClient<Paths>({ baseUrl: BASE_URL }));
    const queryOptions = queryOptionsOf(api);

    expect(queryOptions("get", "/items").queryKey).toEqual(["get", "/items"]);
    expect(queryOptions("get", "/items/{id}", { params: { path: { id: 1 } } }).queryKey).toEqual([
      "get",
      "/items/{id}",
      { params: { path: { id: 1 } } },
    ]);
    // @ts-expect-error "/items/{id}" needs its path parameter
    queryOptions("get", "/items/{id}");
  });
});
