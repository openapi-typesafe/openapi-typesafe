import { describe, expectTypeOf, it } from "vitest";
import type {
  ErrorResponse,
  ErrorResponseJSON,
  MediaType,
  PathsWithMethod,
  ResponseObjectMap,
  SuccessResponse,
  SuccessResponseJSON,
} from "../../src/helpers.js";
import createClient, { type Client, type MaybeOptionalInit } from "../../src/index.js";

/**
 * Code generic in the operation or in the paths (a library that takes any client) reads the
 * response types of a type parameter. They must stay unknown types there, not types that fit any
 * type: TypeScript reads them through the constraint of the parameter, and a constraint of
 * `never` or `any` let `data` and `error` be assigned to a `number`. A caller still gets the
 * bodies of its paths. Each `@ts-expect-error` below fails to compile when that happens.
 */

// biome-ignore lint/suspicious/noExplicitAny: the constraint of an operation, as the helpers take it
type AnyOperation = Record<string | number, any>;
type Json<Body> = { headers: {}; content: { "application/json": Body } };
type Paths = {
  "/items": {
    get: { parameters: {}; responses: { 200: Json<string[]>; 404: Json<{ code: number }> } };
  };
};
type Items = Paths["/items"]["get"];

/** A library function over any client: it returns what the client gives. */
function createGetter<ClientPaths extends {}, Media extends MediaType>(
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
    // @ts-expect-error the data of an unknown path is no number
    const dataNumber: number = data ?? 0;
    // @ts-expect-error the data of an unknown path is not always undefined
    const dataUndefined: undefined = data;
    // @ts-expect-error the error of an unknown path is no number
    const errorNumber: number = error ?? 0;
    return [dataNumber, dataUndefined, errorNumber, data] as const;
  };
}

describe("response types of generic operations", () => {
  it("SuccessResponse and ErrorResponse of a generic operation fit no unrelated type", () => {
    function bodies<Operation extends AnyOperation>(
      success: SuccessResponse<ResponseObjectMap<Operation>>,
      error: ErrorResponse<ResponseObjectMap<Operation>>,
    ) {
      // @ts-expect-error the success body of an unknown operation is no number
      const successNumber: number = success;
      // @ts-expect-error the success body of an unknown operation is not undefined
      const successUndefined: undefined = success;
      // @ts-expect-error the error body of an unknown operation is no number
      const errorNumber: number = error;
      return [successNumber, successUndefined, errorNumber];
    }

    expectTypeOf(bodies<Items>).parameters.toEqualTypeOf<[string[], { code: number }]>();
  });

  it("SuccessResponseJSON and ErrorResponseJSON of a generic operation fit no unrelated type", () => {
    function bodies<Operation extends AnyOperation>(
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

  it("ResponseObjectMap of a type without responses is never", () => {
    expectTypeOf<ResponseObjectMap<{ parameters: {} }>>().toBeNever();
  });

  it("GET of a library generic in the paths gives the caller its bodies", async () => {
    const get = createGetter(createClient<Paths>({ baseUrl: "https://api.example.com" }));

    const call = () => get("/items", {});

    expectTypeOf(call).returns.resolves.toEqualTypeOf<
      readonly [number, undefined, number, string[] | undefined]
    >();
  });
});
