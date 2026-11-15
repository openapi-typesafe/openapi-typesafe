import { describe, expectTypeOf, it } from "vitest";
import type { FilterKeys, PathsWithMethod } from "../../src/helpers.js";
import createClient, { type FetchOptions } from "../../src/index.js";

/**
 * A wrapper generic in the path that always reads the body with one `parseAs` gets that body as
 * `data`, as in openapi-fetch: TypeScript reads the data of the generic call through the
 * constraint of its options, whose `parseAs` is known, not as every JSON body of the paths.
 */

type Json<Body> = { headers: {}; content: { "application/json": Body } };
type Paths = {
  "/items": { get: { parameters: {}; responses: { 200: Json<string[]> } } };
  "/pets/{id}": {
    get: { parameters: { path: { id: string } }; responses: { 200: Json<{ name: string }> } };
  };
};
type GetPath = PathsWithMethod<Paths, "get">;
type GetInit<Path extends GetPath> = FetchOptions<FilterKeys<Paths[Path], "get">>;

const client = createClient<Paths>({ baseUrl: "https://api.example.com" });

describe("generic wrapper parseAs", () => {
  it("GET of a generic path with a spread init and parseAs text types data as a string", () => {
    async function getText<Path extends GetPath>(path: Path, init: GetInit<Path>) {
      const { data } = await client.GET(path, { ...init, parseAs: "text" });
      const text: string | undefined = data;
      return text;
    }

    expectTypeOf(getText<"/items">).returns.resolves.toEqualTypeOf<string | undefined>();
  });

  it("GET of a generic path with an init typed parseAs blob types data as a Blob", () => {
    async function getBlob<Path extends GetPath>(
      path: Path,
      init: GetInit<Path> & { parseAs: "blob" },
    ) {
      const { data } = await client.GET(path, init);
      const blob: Blob | undefined = data;
      return blob;
    }

    expectTypeOf(getBlob<"/items">).returns.resolves.toEqualTypeOf<Blob | undefined>();
  });

  it("GET of a generic path with its declared init types data as the JSON bodies", () => {
    async function getJSON<Path extends GetPath>(path: Path, init: GetInit<Path>) {
      const { data } = await client.GET(path, init);
      const body: string[] | { name: string } | undefined = data;
      return body;
    }

    expectTypeOf(getJSON<"/items">).returns.resolves.toEqualTypeOf<
      string[] | { name: string } | undefined
    >();
  });
});
