import type { HttpMethod, PathsWithMethod } from "openapi-typesafe-helpers";
import { describe, expect, expectTypeOf, it } from "vitest";
import createClient, {
  type Client,
  type FetchResponse,
  type MaybeOptionalInit,
} from "../../src/index.js";

/**
 * Wrappers generic in the path, as permit-cli writes them against openapi-fetch: the wrapper
 * declares `FetchResponse<Paths[Path][Method], Init, Media>` with its own `Media` and returns what
 * the client gives. TypeScript cannot check an init built in the wrapper against a generic path,
 * so the client's call gets the init type `MaybeOptionalInit` of the path, which is also what it
 * infers when that check fails. The response of that call must relate to the declared one.
 */

type Pet = { id: string; name: string };
type PetOperation<Parameters> = {
  parameters: Parameters;
  requestBody?: never;
  responses: {
    200: { content: { "application/json": Pet; "text/plain": string } };
    404: { content: { "application/json": { detail: string } } };
  };
};
type PetMethods<Parameters> = { [Method in HttpMethod]: PetOperation<Parameters> };
type Paths = {
  // The init is required: a path parameter.
  "/pets/{id}": PetMethods<{ path: { id: string } }>;
  // The init may be left out.
  "/pets": PetMethods<{ query?: { limit?: number } }>;
};

type ClientMedia = `${string}/${string}`;
type JsonMedia = "application/json";
type InitOf<Path extends keyof Paths, Method extends HttpMethod> = MaybeOptionalInit<
  Paths[Path],
  Method
> & {
  [key: string]: unknown;
};
type WrappedResponse<Path extends keyof Paths, Method extends HttpMethod, Init> = Promise<
  FetchResponse<Paths[Path][Method], Init, JsonMedia>
>;

const BASE_URL = "https://api.example.com";
const PET: Pet = { id: "1", name: "Rex" };
const PET_INIT = { params: { path: { id: "1" } } };

/** One wrapper per client method, each returning the client's response as permit-cli does. */
function createWrappers(client: Client<Paths, ClientMedia>) {
  return {
    GET: <
      Path extends PathsWithMethod<Paths, "get">,
      Init extends MaybeOptionalInit<Paths[Path], "get">,
    >(
      path: Path,
      init: InitOf<Path, "get">,
    ): WrappedResponse<Path, "get", Init> =>
      client.GET<Path, MaybeOptionalInit<Paths[Path], "get">>(path, init),
    PUT: <
      Path extends PathsWithMethod<Paths, "put">,
      Init extends MaybeOptionalInit<Paths[Path], "put">,
    >(
      path: Path,
      init: InitOf<Path, "put">,
    ): WrappedResponse<Path, "put", Init> =>
      client.PUT<Path, MaybeOptionalInit<Paths[Path], "put">>(path, init),
    POST: <
      Path extends PathsWithMethod<Paths, "post">,
      Init extends MaybeOptionalInit<Paths[Path], "post">,
    >(
      path: Path,
      init: InitOf<Path, "post">,
    ): WrappedResponse<Path, "post", Init> =>
      client.POST<Path, MaybeOptionalInit<Paths[Path], "post">>(path, init),
    DELETE: <
      Path extends PathsWithMethod<Paths, "delete">,
      Init extends MaybeOptionalInit<Paths[Path], "delete">,
    >(
      path: Path,
      init: InitOf<Path, "delete">,
    ): WrappedResponse<Path, "delete", Init> =>
      client.DELETE<Path, MaybeOptionalInit<Paths[Path], "delete">>(path, init),
    OPTIONS: <
      Path extends PathsWithMethod<Paths, "options">,
      Init extends MaybeOptionalInit<Paths[Path], "options">,
    >(
      path: Path,
      init: InitOf<Path, "options">,
    ): WrappedResponse<Path, "options", Init> =>
      client.OPTIONS<Path, MaybeOptionalInit<Paths[Path], "options">>(path, init),
    HEAD: <
      Path extends PathsWithMethod<Paths, "head">,
      Init extends MaybeOptionalInit<Paths[Path], "head">,
    >(
      path: Path,
      init: InitOf<Path, "head">,
    ): WrappedResponse<Path, "head", Init> =>
      client.HEAD<Path, MaybeOptionalInit<Paths[Path], "head">>(path, init),
    PATCH: <
      Path extends PathsWithMethod<Paths, "patch">,
      Init extends MaybeOptionalInit<Paths[Path], "patch">,
    >(
      path: Path,
      init: InitOf<Path, "patch">,
    ): WrappedResponse<Path, "patch", Init> =>
      client.PATCH<Path, MaybeOptionalInit<Paths[Path], "patch">>(path, init),
    TRACE: <
      Path extends PathsWithMethod<Paths, "trace">,
      Init extends MaybeOptionalInit<Paths[Path], "trace">,
    >(
      path: Path,
      init: InitOf<Path, "trace">,
    ): WrappedResponse<Path, "trace", Init> =>
      client.TRACE<Path, MaybeOptionalInit<Paths[Path], "trace">>(path, init),
    QUERY: <
      Path extends PathsWithMethod<Paths, "query">,
      Init extends MaybeOptionalInit<Paths[Path], "query">,
    >(
      path: Path,
      init: InitOf<Path, "query">,
    ): WrappedResponse<Path, "query", Init> =>
      client.QUERY<Path, MaybeOptionalInit<Paths[Path], "query">>(path, init),
    request: <
      Path extends PathsWithMethod<Paths, "get">,
      Init extends MaybeOptionalInit<Paths[Path], "get">,
    >(
      path: Path,
      init: InitOf<Path, "get">,
    ): WrappedResponse<Path, "get", Init> =>
      client.request<"get", Path, MaybeOptionalInit<Paths[Path], "get">>("get", path, init),
  };
}

/** permit-cli's shape: destructure the response and build a new one with another error type. */
async function getWithMessage<
  Path extends PathsWithMethod<Paths, "get">,
  Init extends MaybeOptionalInit<Paths[Path], "get">,
>(
  client: Client<Paths, ClientMedia>,
  path: Path,
  init: InitOf<Path, "get">,
): Promise<
  Omit<FetchResponse<Paths[Path]["get"], Init, JsonMedia>, "error"> & { error: string | null }
> {
  const { data, response, error } = await client.GET<Path, MaybeOptionalInit<Paths[Path], "get">>(
    path,
    init,
  );
  return { data, response, error: error ? JSON.stringify(error) : null };
}

function createPetClient() {
  return createClient<Paths, ClientMedia>({
    baseUrl: BASE_URL,
    fetch: async (request) =>
      request.url.endsWith("/pets/1") ? Response.json(PET) : Response.json([]),
  });
}

describe("wrappers generic in the path", () => {
  it("each method's response relates to FetchResponse of the operation with the wrapper's media", async () => {
    const wrappers = createWrappers(createPetClient());

    const responses = await Promise.all([
      wrappers.GET("/pets/{id}", PET_INIT),
      wrappers.PUT("/pets/{id}", PET_INIT),
      wrappers.POST("/pets/{id}", PET_INIT),
      wrappers.DELETE("/pets/{id}", PET_INIT),
      wrappers.OPTIONS("/pets/{id}", PET_INIT),
      wrappers.PATCH("/pets/{id}", PET_INIT),
      wrappers.QUERY("/pets/{id}", PET_INIT),
    ]);
    const { response } = await wrappers.HEAD("/pets", {});

    expect(responses.map(({ data }) => data)).toEqual(responses.map(() => PET));
    expect(response.ok).toBe(true);
    // Node.js does not send TRACE with `new Request()`; the wrapper above checks its types.
    await expect(wrappers.TRACE("/pets/{id}", PET_INIT)).rejects.toThrow();
  });

  it("request() relates the same way", async () => {
    const { request } = createWrappers(createPetClient());

    const { data } = await request("/pets/{id}", PET_INIT);

    expect(data).toEqual(PET);
  });

  it("a wrapper that rebuilds the response keeps its data type", async () => {
    const result = await getWithMessage(createPetClient(), "/pets/{id}", PET_INIT);

    expectTypeOf(result.data).toEqualTypeOf<Pet | undefined>();
    expect(result).toMatchObject({ data: PET, error: null });
  });
});
