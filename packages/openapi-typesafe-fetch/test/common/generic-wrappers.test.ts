import type { HttpMethod, MediaType, PathsWithMethod } from "openapi-typesafe-helpers";
import { describe, expect, expectTypeOf, it } from "vitest";
import createClient, { type Client, type MaybeOptionalInit } from "../../src/index.js";

/**
 * Libraries wrap the client in code that is generic in the paths, as swr-openapi does. Their types
 * must keep relating: a `PathsWithMethod` of one method to one of a method still generic, and a
 * literal in an init checked against `MaybeOptionalInit` before the path is known.
 */

type Status = "available" | "sold";
type FindPets = {
  parameters: { query?: { status?: Status } };
  responses: { 200: { content: { "application/json": { id: number }[] } } };
};
type Paths = {
  "/pets": { get: FindPets; delete?: never };
  // Generated path items name every method; `keyof` of a union of them is each method.
  "/pets/{id}": {
    get?: never;
    delete: {
      parameters: { path: { id: number } };
      responses: { 204: { content?: never } };
    };
  };
};

const BASE_URL = "https://api.example.com";

/** swr-openapi's `TypesForGetRequest`: the get method as a type still generic in `Paths`. */
// biome-ignore lint/suspicious/noExplicitAny: swr-openapi's constraint, as its users write it
type GetPaths<Paths extends Record<string | number, any>> = PathsWithMethod<
  Paths,
  Extract<"get", keyof Paths[keyof Paths]>
>;

type GetInit<
  // biome-ignore lint/suspicious/noExplicitAny: swr-openapi's constraint, as its users write it
  Paths extends Record<string | number, any>,
  Path extends GetPaths<Paths>,
> = MaybeOptionalInit<Paths[Path], Extract<"get", keyof Paths[keyof Paths]>>;

/** A hook factory in the shape of swr-openapi's `createInfiniteHook`. */
// biome-ignore lint/suspicious/noExplicitAny: swr-openapi's constraint, as its users write it
function createLoader<Paths extends Record<string | number, any>, Media extends MediaType>(
  client: Client<Paths, Media>,
) {
  return <Path extends PathsWithMethod<Paths, "get">, Init extends GetInit<Paths, Path>>(
    path: Path,
    getInit: () => Init,
  ) => ({ client, path, init: getInit() });
}

describe("code generic in the paths", () => {
  it("PathsWithMethod of a method relates to PathsWithMethod of a generic method", () => {
    // biome-ignore lint/suspicious/noExplicitAny: swr-openapi's constraint, as its users write it
    type Relates<Paths extends Record<string | number, any>> =
      PathsWithMethod<Paths, "get"> extends GetPaths<Paths> ? true : false;

    expectTypeOf<Relates<Paths>>().toEqualTypeOf<true>();
  });

  it("PathsWithMethod of HttpMethod is every path with a method", () => {
    expectTypeOf<PathsWithMethod<Paths, HttpMethod>>().toEqualTypeOf<"/pets" | "/pets/{id}">();
    expectTypeOf<PathsWithMethod<Paths, "get" | "delete">>().toEqualTypeOf<never>();
  });

  it("a loader over the client keeps a literal of the init", () => {
    const client = createClient<Paths>({ baseUrl: BASE_URL, fetch: async () => Response.json([]) });
    const load = createLoader(client);

    const { path, init } = load("/pets", () => ({ params: { query: { status: "available" } } }));

    expectTypeOf(init.params.query.status).toEqualTypeOf<"available">();
    expect([path, init]).toEqual(["/pets", { params: { query: { status: "available" } } }]);
  });
});
