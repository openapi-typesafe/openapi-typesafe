import type { FilterKeys, PathsWithMethod } from "openapi-typesafe-helpers";
import { describe, expect, expectTypeOf, it } from "vitest";
import createClient, { type FetchOptions } from "../../src/index.js";

/**
 * Wrappers generic in the path that type the init as `FetchOptions` of the operation, a common
 * pattern with openapi-fetch. The client's init type for a generic path must take that type
 * (TS2345 in rc.3), while a concrete call keeps the init rules of ADR-030 and ADR-025.
 */

type Pet = { id: string; name: string };
type Paths = {
  "/pets/{id}": {
    parameters: { path: { id: string } };
    get: {
      parameters: { path: { id: string }; query?: { expand?: boolean } };
      requestBody?: never;
      responses: { 200: { content: { "application/json": Pet } } };
    };
    post?: never;
  };
  "/pets": {
    parameters: { query?: never };
    get: {
      parameters: { query?: { limit?: number } };
      requestBody?: never;
      responses: { 200: { content: { "application/json": Pet[] } } };
    };
    post: {
      parameters: { query?: never };
      requestBody: { content: { "application/json": { name: string } } };
      responses: { 201: { content: { "application/json": Pet } } };
    };
  };
};

type GetPath = PathsWithMethod<Paths, "get">;
type PostPath = PathsWithMethod<Paths, "post">;

const BASE_URL = "https://api.example.com";
const PET: Pet = { id: "1", name: "Rex" };

function createPetClient() {
  return createClient<Paths>({ baseUrl: BASE_URL, fetch: async () => Response.json(PET) });
}

describe("wrappers that type the init as FetchOptions", () => {
  const client = createPetClient();

  function getByFilterKeys<Path extends GetPath>(
    path: Path,
    init: FetchOptions<FilterKeys<Paths[Path], "get">>,
  ) {
    return client.GET(path, init);
  }

  function getByIndex<Path extends GetPath>(path: Path, init: FetchOptions<Paths[Path]["get"]>) {
    return client.GET(path, init);
  }

  function post<Path extends PostPath>(
    path: Path,
    init: FetchOptions<FilterKeys<Paths[Path], "post">>,
  ) {
    return client.POST(path, init);
  }

  function request<Path extends GetPath>(
    path: Path,
    init: FetchOptions<FilterKeys<Paths[Path], "get">>,
  ) {
    return client.request("get", path, init);
  }

  it("GET takes FetchOptions of FilterKeys of a generic path", async () => {
    const { data } = await getByFilterKeys("/pets/{id}", { params: { path: { id: "1" } } });

    expectTypeOf(data).toEqualTypeOf<Pet | undefined>();
    expect(data).toEqual(PET);
  });

  it("GET takes FetchOptions of an indexed generic path", async () => {
    const { data } = await getByIndex("/pets", { params: { query: { limit: 1 } } });

    expectTypeOf(data).toEqualTypeOf<Pet[] | undefined>();
    expect(data).toEqual(PET);
  });

  it("POST takes FetchOptions of a generic path", async () => {
    const { data } = await post("/pets", { body: { name: "Rex" } });

    expectTypeOf(data).toEqualTypeOf<Pet | undefined>();
    expect(data).toEqual(PET);
  });

  it("request takes FetchOptions of a generic path", async () => {
    const { data } = await request("/pets/{id}", { params: { path: { id: "1" } } });

    expect(data).toEqual(PET);
  });

  it("a wrapper still checks the init of the path it is called with", () => {
    // @ts-expect-error "/pets/{id}" needs its path parameter
    expect(() => getByFilterKeys("/pets/{id}", {})).toBeDefined();
    // @ts-expect-error the body of "/pets" needs a name
    expect(() => post("/pets", { body: {} })).toBeDefined();
  });
});

describe("FetchOptions", () => {
  it("of a union of operations is the union of their inits", () => {
    type Union = FetchOptions<Paths["/pets"]["get"] | Paths["/pets/{id}"]["get"]>;

    expectTypeOf<Union>().toEqualTypeOf<
      FetchOptions<Paths["/pets"]["get"]> | FetchOptions<Paths["/pets/{id}"]["get"]>
    >();
  });

  it("of one operation keeps its required params", () => {
    expectTypeOf<FetchOptions<Paths["/pets/{id}"]["get"]>["params"]>().toEqualTypeOf<{
      path: { id: string };
      query?: { expand?: boolean };
    }>();
  });

  it("a concrete call with a variable of FetchOptions type compiles", async () => {
    const client = createPetClient();
    const init: FetchOptions<Paths["/pets/{id}"]["get"]> = { params: { path: { id: "1" } } };

    const { data } = await client.GET("/pets/{id}", init);

    expect(data).toEqual(PET);
  });
});
