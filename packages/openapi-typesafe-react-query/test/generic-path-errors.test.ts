import createFetchClient, { type FetchOptions } from "openapi-typesafe-fetch";
import type { FilterKeys, PathsWithMethod } from "openapi-typesafe-helpers";
import { describe, expectTypeOf, it } from "vitest";
import createClient, { type QueryError } from "../src/index.js";

/**
 * A hook wrapper generic in the path reads the error of `Paths[Path]`. The error type gave the
 * whole `responses` map next to the error bodies, so assigning the hook's error to the bodies the
 * paths declare failed with TS2322. `usePathError` fails to compile when that happens.
 */

type Item = { id: number };
type Problem = { title: string };
type Paths = {
  "/items": {
    get: {
      parameters: { query?: { limit?: number } };
      responses: {
        200: { content: { "application/json": Item[] } };
        400: { content: { "application/problem+json": Problem } };
      };
    };
  };
  "/items/{id}": {
    get: {
      parameters: { path: { id: number } };
      responses: {
        200: { content: { "application/json": Item } };
        404: { content: { "text/html": string } };
      };
    };
  };
};

type GetPath = PathsWithMethod<Paths, "get">;
type GetInit<Path extends GetPath> = FetchOptions<FilterKeys<Paths[Path], "get">>;

const $api = createClient(createFetchClient<Paths>({ baseUrl: "https://api.example.com" }));

function usePathError<Path extends GetPath>(
  path: Path,
  init: GetInit<Path>,
): QueryError<Problem | string> | null {
  return $api.useQuery("get", path, init).error;
}

describe("hook wrappers generic in the path", () => {
  it("useQuery error of a generic path is its error bodies", () => {
    expectTypeOf(usePathError<GetPath>).returns.toEqualTypeOf<QueryError<
      Problem | string
    > | null>();
  });
});
