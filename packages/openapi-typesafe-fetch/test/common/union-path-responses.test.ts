import { describe, expect, expectTypeOf, it } from "vitest";
import type { ErrorResponse, SuccessResponse } from "../../src/helpers.js";
import createClient from "../../src/index.js";

/**
 * A call with a union of paths gets the response of one of them, so `data` and `error` are the
 * union of each operation's types, as the init is checked per operation (ADR-025, decision 8).
 * One response map of the union kept only the shared statuses: a path without a body in its 2XX
 * response typed the data as the content map, and a `default`-only path typed it `undefined`.
 */

type Item = { id: number };
type Problem = { detail: string };
type Paths = {
  "/items": {
    get: {
      responses: {
        200: { content: { "application/json": Item[] } };
        404: { content: { "application/json": Problem } };
      };
    };
  };
  "/empty": {
    get: { responses: { 204: { content?: never } } };
  };
  "/default-only": {
    get: { responses: { default: { content: { "application/json": { total: number } } } } };
  };
  "/text": {
    get: {
      responses: {
        200: { content: { "text/plain": string } };
        500: { content: { "application/json": { code: number } } };
      };
    };
  };
};

const BASE_URL = "https://api.example.com";
const ITEMS: Item[] = [{ id: 1 }];

function createItemsClient() {
  return createClient<Paths>({ baseUrl: BASE_URL, fetch: async () => Response.json(ITEMS) });
}

describe("a call with a union of paths", () => {
  it("types the data of a path without a body as undefined, not as the content map", async () => {
    const path = "/items" as "/items" | "/empty";

    const { data } = await createItemsClient().GET(path);

    expectTypeOf(data).toEqualTypeOf<Item[] | undefined>();
    expect(data).toEqual(ITEMS);
  });

  it("types the data of a default-only path with its default response", async () => {
    const path = "/items" as "/items" | "/default-only";

    const { data } = await createItemsClient().GET(path);

    expectTypeOf(data).toEqualTypeOf<Item[] | { total: number } | undefined>();
    expect(data).toEqual(ITEMS);
  });

  it("types the error as the union of each operation's errors", async () => {
    const path = "/items" as "/items" | "/text";

    const { data, error } = await createItemsClient().GET(path);

    expectTypeOf(data).toEqualTypeOf<Item[] | string | undefined>();
    expectTypeOf(error).toEqualTypeOf<Problem | { code: number } | undefined>();
    expect(error).toBeUndefined();
  });
});

describe("SuccessResponse and ErrorResponse of a union of response maps", () => {
  type Items = Paths["/items"]["get"]["responses"];
  type Text = Paths["/text"]["get"]["responses"];

  it("are the union of each map's responses", () => {
    expectTypeOf<SuccessResponse<Items | Text>>().toEqualTypeOf<
      SuccessResponse<Items> | SuccessResponse<Text>
    >();
    expectTypeOf<ErrorResponse<Items | Text>>().toEqualTypeOf<
      ErrorResponse<Items> | ErrorResponse<Text>
    >();
  });
});

describe("a template path key (--path-params-as-types)", () => {
  type LogLine = { responses: { 200: { content: { "text/plain": string } } } };
  type App = { id: string };
  type TemplatePaths = {
    [path: `/apps/${string}/logs/${number}`]: { get: LogLine };
  } & {
    [path: `/apps/${string}`]: {
      get: { responses: { 200: { content: { "application/json": App } } } };
    };
  };

  it("gets the response of its own key, not of the keys it overlaps", async () => {
    const client = createClient<TemplatePaths>({
      baseUrl: BASE_URL,
      fetch: async () => Response.json({ id: "a1" }),
    });
    const id: string = "a1";

    const { data } = await client.GET(`/apps/${id}`);

    expectTypeOf(data).toEqualTypeOf<App | undefined>();
    expect(data).toEqual({ id: "a1" });
  });
});
