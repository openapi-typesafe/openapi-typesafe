import { describe, expectTypeOf, it } from "vitest";
import type {
  ErrorResponse,
  ErrorResponseJSON,
  HttpMethod,
  MediaType,
  OperationObject,
  PathsWithMethod,
  ResponseObjectMap,
  SuccessResponse,
  SuccessResponseJSON,
} from "../../src/helpers.js";
import createClient, {
  type Client,
  type FetchResponse,
  type MaybeOptionalInit,
  type PathOperation,
} from "../../src/index.js";

/**
 * Code generic in its operation or its paths reads the response types through the constraint of
 * the type parameter. A constraint that leaves the responses open (`{ responses: any }`,
 * `OperationObject`, `Record<string, any>` paths, openapi-react-query's
 * `Record<string, Record<HttpMethod, {}>>`) must not give types that fit any type, while a concrete
 * `any` operation still gives `any`. Each `@ts-expect-error` fails to compile when one fits.
 */

type Json<Body> = { headers: {}; content: { "application/json": Body } };
type Items = { parameters: {}; responses: { 200: Json<string[]>; 404: Json<{ code: number }> } };
type Paths = { "/items": { get: Items } & Record<HttpMethod, {}> };
type OpenPaths = Record<string, Record<HttpMethod, {}>>;
// biome-ignore lint/suspicious/noExplicitAny: the constraint that swr-openapi's users write
type AnyPaths = Record<string, any>;

/** A library function over any client of `OpenPaths`, in openapi-react-query's shape. */
function createGetter<ClientPaths extends OpenPaths, Media extends MediaType>(
  client: Client<ClientPaths, Media>,
) {
  return async <
    Path extends PathsWithMethod<ClientPaths, "get">,
    Init extends MaybeOptionalInit<ClientPaths[Path], "get">,
  >(
    path: Path,
    init: Init,
  ) => {
    const { data, error } = await client.GET<Path, Init>(path, init as never);
    // @ts-expect-error the error of an unknown path is no number
    const errorNumber: number = error ?? 0;
    // @ts-expect-error the error of an unknown path is not undefined
    const errorUndefined: undefined = error ?? undefined;
    return [errorNumber, errorUndefined, data, error] as const;
  };
}

describe("response types of a type parameter with an open constraint", () => {
  it("SuccessResponseJSON of an operation with any responses fits no unrelated type", () => {
    // biome-ignore lint/suspicious/noExplicitAny: the open constraint under test
    function bodies<Operation extends { responses: any }>(
      success: SuccessResponseJSON<Operation>,
      error: ErrorResponseJSON<Operation>,
    ) {
      // @ts-expect-error the JSON success body of an unknown operation is no number
      const successNumber: number = success;
      // @ts-expect-error the JSON error body of an unknown operation is no number
      const errorNumber: number = error;
      return [successNumber, errorNumber];
    }

    expectTypeOf(bodies<Items>).parameters.toEqualTypeOf<[string[], { code: number }]>();
  });

  it("SuccessResponse of an OperationObject map fits no unrelated type", () => {
    function bodies<Operation extends OperationObject>(
      success: SuccessResponse<ResponseObjectMap<Operation>>,
      error: ErrorResponse<ResponseObjectMap<Operation>>,
    ) {
      // @ts-expect-error the success body of an unknown operation is no number
      const successNumber: number = success;
      // @ts-expect-error the error body of an unknown operation is not undefined
      const errorUndefined: undefined = error;
      return [successNumber, errorUndefined];
    }

    type ItemsOperation = Items & { requestBody: never };

    expectTypeOf(bodies<ItemsOperation>).parameters.toEqualTypeOf<[string[], { code: number }]>();
  });

  it("FetchResponse of an operation with any responses types data and error as unknown", () => {
    // biome-ignore lint/suspicious/noExplicitAny: the open constraint under test
    function read<Operation extends { responses: any }>(
      response: FetchResponse<Operation, {}, MediaType>,
    ) {
      // @ts-expect-error the data of an unknown operation is no number
      const dataNumber: number = response.data ?? 0;
      // @ts-expect-error the error of an unknown operation is no number
      const errorNumber: number = response.error ?? 0;
      return [dataNumber, errorNumber];
    }

    expectTypeOf(read<Items>)
      .parameter(0)
      .toEqualTypeOf<FetchResponse<Items, {}, MediaType>>();
  });

  it("FetchResponse of a post on open paths types data as no number", () => {
    function read<ClientPaths extends OpenPaths, Path extends PathsWithMethod<ClientPaths, "post">>(
      response: FetchResponse<PathOperation<ClientPaths, Path, "post">, {}, MediaType>,
    ) {
      // @ts-expect-error the data of an unknown path is no number
      const dataNumber: number = response.data ?? 0;
      return dataNumber;
    }

    expectTypeOf(read).returns.toEqualTypeOf<number>();
  });

  it("GET of a library over open paths gives the caller its bodies", async () => {
    const get = createGetter(createClient<Paths>({ baseUrl: "https://api.example.com" }));

    const call = () => get("/items", {});

    expectTypeOf(call).returns.resolves.toEqualTypeOf<
      readonly [number, undefined, string[] | undefined, { code: number } | undefined]
    >();
  });

  it("GET of a library over paths of any types data and error as no number", async () => {
    async function getItems<
      ClientPaths extends AnyPaths,
      Path extends PathsWithMethod<ClientPaths, "get">,
      Init extends MaybeOptionalInit<ClientPaths[Path], "get">,
    >(client: Client<ClientPaths>, path: Path, init: Init) {
      const { data, error } = await client.GET<Path, Init>(path, init as never);
      // @ts-expect-error the data of a path of any paths is no number
      const dataNumber: number = data ?? 0;
      // @ts-expect-error the error of a path of any paths is no number
      const errorNumber: number = error ?? 0;
      return [dataNumber, errorNumber];
    }

    expectTypeOf(getItems<Paths, "/items", {}>).returns.resolves.toEqualTypeOf<number[]>();
  });

  it("FetchResponse of a concrete operation with any responses types data and error as any", () => {
    // biome-ignore lint/suspicious/noExplicitAny: a hand-written operation that says nothing
    type Untyped = { parameters: {}; responses: any };

    expectTypeOf<FetchResponse<Untyped, {}, MediaType>["error"]>().toBeAny();
    expectTypeOf<SuccessResponseJSON<Untyped>>().toBeAny();
    expectTypeOf<ErrorResponseJSON<Untyped>>().toBeAny();
  });
});
