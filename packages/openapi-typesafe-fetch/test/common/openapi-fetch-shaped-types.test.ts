import type {
  HttpMethod,
  MediaType,
  PathsWithMethod,
  RequiredKeysOf,
} from "openapi-typesafe-helpers";
import { describe, expect, expectTypeOf, it } from "vitest";
import createClient, {
  type Client,
  type FetchResponse,
  type MaybeOptionalInit,
  wrapAsPathBasedClient,
} from "../../src/index.js";

/**
 * Code written against openapi-fetch's types: client types a user copied from openapi-fetch 0.17
 * (it does not export `InitParam`), and hook factories in the shape of swr-openapi 5.6.0 and
 * openapi-react-query 0.5.4, which take `Client` and `MaybeOptionalInit` and check the init with
 * their own `RequiredKeysOf<Init> extends never`. These packages import openapi-fetch; with
 * `openapi-fetch` aliased to this package (docs/fetch/index.md) they get these types.
 */

type Pet = { id: string; name: string };
type Paths = {
  "/pets": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: {
      parameters: { query?: { limit?: number } };
      responses: { 200: { content: { "application/json": Pet[] } } };
    };
    put?: never;
  };
  "/pets/{id}": {
    parameters: { query?: never; header?: never; path?: never; cookie?: never };
    get: {
      parameters: { path: { id: string } };
      responses: { 200: { content: { "application/json": Pet } } };
    };
    put?: never;
  };
};

const BASE_URL = "https://api.example.com";
const PET: Pet = { id: "1", name: "Rex" };

// openapi-fetch 0.17's types, as a user copies them.
type UpstreamInitParam<Init> =
  RequiredKeysOf<Init> extends never
    ? [(Init & { [key: string]: unknown })?]
    : [Init & { [key: string]: unknown }];

type UpstreamClientMethod<
  // biome-ignore lint/suspicious/noExplicitAny: openapi-fetch's constraint, as its users copy it
  P extends Record<string, any>,
  Method extends HttpMethod,
  Media extends MediaType,
> = <Path extends PathsWithMethod<P, Method>, Init extends MaybeOptionalInit<P[Path], Method>>(
  url: Path,
  ...init: UpstreamInitParam<Init>
) => Promise<FetchResponse<P[Path][Method], Init, Media>>;

// biome-ignore lint/suspicious/noExplicitAny: openapi-fetch's constraint, as its users copy it
type UpstreamClient<P extends Record<string, any>, Media extends MediaType = MediaType> = {
  GET: UpstreamClientMethod<P, "get", Media>;
};

type UpstreamClientForPath<
  // biome-ignore lint/suspicious/noExplicitAny: openapi-fetch's constraint, as its users copy it
  PathInfo extends Record<string | number, any>,
  Media extends MediaType,
> = {
  [Method in keyof PathInfo as Uppercase<string & Method>]: <
    Init extends MaybeOptionalInit<PathInfo, Method>,
  >(
    ...init: UpstreamInitParam<Init>
  ) => Promise<FetchResponse<PathInfo[Method], Init, Media>>;
};

type UpstreamPathBasedClient<
  // biome-ignore lint/suspicious/noExplicitAny: openapi-fetch's constraint, as its users copy it
  P extends Record<string | number, any>,
  Media extends MediaType = MediaType,
> = {
  [Path in keyof P]: UpstreamClientForPath<P[Path], Media>;
};

/** swr-openapi 5.6.0's `createQueryHook` without its SWR types (and `Exact` from type-fest). */
function createQueryHook<P extends {}, Media extends MediaType>(client: Client<P, Media>) {
  return <Path extends PathsWithMethod<P, "get">, Init extends MaybeOptionalInit<P[Path], "get">>(
    path: Path,
    ...[init]: RequiredKeysOf<Init> extends never ? [(Init | null)?] : [Init | null]
  ) => ({ client, path, init });
}

/** openapi-react-query 0.5.4's `useQuery` rest parameter, without the TanStack types. */
type ReactQueryInit<Init> =
  RequiredKeysOf<Init> extends never
    ? [(Init & { [key: string]: unknown })?]
    : [Init & { [key: string]: unknown }];

function createQueryOptions<P extends {}, Media extends MediaType>(client: Client<P, Media>) {
  return <
    Method extends HttpMethod,
    Path extends PathsWithMethod<P, Method>,
    Init extends MaybeOptionalInit<P[Path], Method>,
  >(
    method: Method,
    path: Path,
    ...[init]: ReactQueryInit<Init>
  ) => ({ client, key: [method, path, init] as const });
}

function createPetClient() {
  return createClient<Paths>({
    baseUrl: BASE_URL,
    fetch: async (request) => Response.json(request.url.endsWith("/pets") ? [PET] : PET),
  });
}

describe("client types written like openapi-fetch's", () => {
  it("a client type copied from openapi-fetch takes the client", async () => {
    const client: UpstreamClient<Paths> = createPetClient();

    const { data } = await client.GET("/pets/{id}", { params: { path: { id: "1" } } });

    expect(data).toEqual(PET);
  });

  it("code generic in the paths casts the client to a type copied from openapi-fetch", () => {
    const wrap = <P extends {}>(client: Client<P>) => client as UpstreamClient<P>;

    expectTypeOf(wrap(createPetClient())).toEqualTypeOf<UpstreamClient<Paths>>();
  });

  it("code generic in the paths casts the path-based client to a type copied from openapi-fetch", async () => {
    const wrap = <P extends {}>(client: Client<P>) =>
      wrapAsPathBasedClient(client) as UpstreamPathBasedClient<P>;
    const client = wrap(createPetClient());

    const { data } = await client["/pets/{id}"].GET({ params: { path: { id: "1" } } });

    expect(data).toEqual(PET);
  });

  it("the path-based client offers only the methods of a path, and a missing one is optional", () => {
    const client = wrapAsPathBasedClient(createPetClient());

    // @ts-expect-error `parameters` is not a method
    expect(client["/pets"].PARAMETERS).toBeUndefined();
    expectTypeOf<
      undefined extends (typeof client)["/pets"]["PUT"] ? true : false
    >().toEqualTypeOf<true>();
    expectTypeOf<
      undefined extends (typeof client)["/pets"]["GET"] ? true : false
    >().toEqualTypeOf<false>();
  });
});

describe("hook factories in the shape of swr-openapi and openapi-react-query", () => {
  it("an swr-openapi query hook infers the paths and checks the init", () => {
    const useQuery = createQueryHook(createPetClient());

    const { path, init } = useQuery("/pets/{id}", { params: { path: { id: "1" } } });
    // @ts-expect-error "/pets/{id}" needs its path parameter
    useQuery("/pets/{id}");
    useQuery("/pets");

    expectTypeOf(path).toEqualTypeOf<"/pets/{id}">();
    expect(init).toEqual({ params: { path: { id: "1" } } });
  });

  it("an openapi-react-query query options function infers the paths and checks the init", () => {
    const queryOptions = createQueryOptions(createPetClient());

    const { key } = queryOptions("get", "/pets/{id}", { params: { path: { id: "1" } } });
    // @ts-expect-error "/pets/{id}" needs its path parameter
    queryOptions("get", "/pets/{id}");

    expect(key).toEqual(["get", "/pets/{id}", { params: { path: { id: "1" } } }]);
  });

  it("a consumer's own init check requires the init for a union of paths when one needs it", () => {
    const useQuery = createQueryHook(createPetClient());
    const path = "/pets/{id}" as "/pets" | "/pets/{id}";

    // @ts-expect-error "/pets/{id}" needs its path parameter
    useQuery(path);

    expectTypeOf<
      undefined extends MaybeOptionalInit<Paths["/pets"], "get"> ? true : false
    >().toEqualTypeOf<true>();
    expectTypeOf<
      undefined extends MaybeOptionalInit<Paths["/pets"] | Paths["/pets/{id}"], "get">
        ? true
        : false
    >().toEqualTypeOf<false>();
  });
});
