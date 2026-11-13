import { describe, expectTypeOf, it } from "vitest";
import type {
  ErrorResponse,
  ErrorResponseJSON,
  MediaType,
  SuccessResponse,
  SuccessResponseJSON,
} from "../../src/helpers.js";
import type { FetchResponse } from "../../src/index.js";

/**
 * Generic code over a path reads the response types of `Paths[Path]`. TypeScript relates a
 * conditional type on a type parameter through the conditional type with the parameter's
 * constraint put in, which gives the bodies of the paths. The `any` check of `createClient<any>`
 * stood outside that conditional type, and the constraint of a conditional type on anything else
 * is the union of both branches, so the whole `responses` map leaked in and a generic handler
 * failed with TS2322. Each function below fails to compile when that happens.
 */

type Problem = { title: string };
type Pet = { id: string };
type Response<Content> = { headers: {}; content: Content };
type Operation<Responses> = { responses: Responses };

type Paths = {
  "/mixed": {
    get: Operation<{
      200: Response<{ "application/json": Pet }>;
      400: Response<{ "application/problem+json": Problem }>;
      500: Response<{ "text/html": string }>;
    }>;
  };
  "/vnd": {
    get: Operation<{
      200: Response<{ "application/vnd.api+json": Pet }>;
      404: Response<{ "application/json": Problem }>;
    }>;
  };
};
type PathName = keyof Paths;
type Responses<Path extends PathName> = Paths[Path]["get"]["responses"];

function successBody<Path extends PathName>(body: SuccessResponse<Responses<Path>>): Pet {
  return body;
}

function errorBody<Path extends PathName>(body: ErrorResponse<Responses<Path>>): Problem | string {
  return body;
}

function successJSON<Path extends PathName>(body: SuccessResponseJSON<Paths[Path]["get"]>): Pet {
  return body;
}

function errorJSON<Path extends PathName>(
  body: ErrorResponseJSON<Paths[Path]["get"]>,
): Problem | string {
  return body;
}

function unwrap<Path extends PathName>(
  result: FetchResponse<Paths[Path]["get"], {}, MediaType>,
): Pet | undefined {
  if (result.error !== undefined) {
    const error: Problem | string = result.error;
    throw new Error(String(error));
  }
  return result.data;
}

describe("generic path responses", () => {
  it("SuccessResponse of a generic path is its success body", () => {
    expectTypeOf(successBody<PathName>)
      .parameter(0)
      .toEqualTypeOf<Pet>();
  });

  it("ErrorResponse of a generic path is its error bodies", () => {
    expectTypeOf(errorBody<PathName>)
      .parameter(0)
      .toEqualTypeOf<Problem | string>();
  });

  it("SuccessResponseJSON of a generic path is its success body", () => {
    expectTypeOf(successJSON<PathName>)
      .parameter(0)
      .toEqualTypeOf<Pet>();
  });

  it("ErrorResponseJSON of a generic path is its error bodies", () => {
    expectTypeOf(errorJSON<PathName>)
      .parameter(0)
      .toEqualTypeOf<Problem | string>();
  });

  it("FetchResponse of a generic path gives its data and error", () => {
    expectTypeOf(unwrap<PathName>).returns.toEqualTypeOf<Pet | undefined>();
  });
});
