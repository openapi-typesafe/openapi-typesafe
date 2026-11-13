// @vitest-environment node
// Node's own Request: jsdom's does not reach Node's fetch types.
import { QueryClient } from "@tanstack/react-query";
import createFetchClient from "openapi-typesafe-fetch";
import { describe, expect, it } from "vitest";
import createClient from "../src/index.js";

/**
 * TanStack Query's filters (`setQueriesData`, `invalidateQueries`, `removeQueries`) match a key
 * as a prefix and compare objects by their own members. A Date or a `Number` object has none, so
 * a key that held one matched the queries of every other value. A filter with the key of one
 * query must match that query only.
 */

type Paths = {
  "/reports": {
    get: {
      parameters: { query?: { from?: string; n?: number } };
      responses: { 200: { content: { "application/json": string } } };
    };
    post: {
      requestBody: { content: { "application/json": unknown } };
      responses: { 200: { content: { "application/json": string } } };
    };
  };
  "/reports/{day}": {
    get: {
      parameters: { path: { day: string }; header?: { "X-Since"?: string } };
      responses: { 200: { content: { "application/json": string } } };
    };
  };
};

const FETCHED = "fetched";
const DAY_MS = 86_400_000;
const WRITTEN = "written";

/** A client whose server answers every request with the same text. */
function reportClient() {
  return createClient(
    createFetchClient<Paths>({
      baseUrl: "https://api.example.com",
      fetch: async () => Response.json(FETCHED),
    }),
  );
}

type Api = ReturnType<typeof reportClient>;
type OptionsOf = (api: Api, value: number) => { queryKey: readonly unknown[] };

/** Fetch the queries of two values, write into the first by a filter, and read the second. */
async function secondAfterWritingFirst(optionsOf: OptionsOf): Promise<unknown> {
  const $api = reportClient();
  const queryClient = new QueryClient();
  const first = optionsOf($api, 1);
  const second = optionsOf($api, 2);
  await queryClient.fetchQuery(first as never);
  await queryClient.fetchQuery(second as never);

  queryClient.setQueriesData({ queryKey: first.queryKey }, () => WRITTEN);

  expect(queryClient.getQueryData(first.queryKey)).toBe(WRITTEN);
  return queryClient.getQueryData(second.queryKey);
}

/** A date of `day` days after the epoch. */
function dayDate(day: number): Date {
  return new Date(day * DAY_MS);
}

describe("query key filters", () => {
  it("setQueriesData with a Date query param leaves the query of another date", async () => {
    const second = await secondAfterWritingFirst(($api, day) =>
      $api.queryOptions("get", "/reports", {
        params: { query: { from: dayDate(day) as unknown as string } },
      }),
    );

    expect(second).toBe(FETCHED);
  });

  it("setQueriesData with a Date path param leaves the query of another date", async () => {
    const second = await secondAfterWritingFirst(($api, day) =>
      $api.queryOptions("get", "/reports/{day}", {
        params: { path: { day: dayDate(day) as unknown as string } },
      }),
    );

    expect(second).toBe(FETCHED);
  });

  it("setQueriesData with a Date header param leaves the query of another date", async () => {
    const second = await secondAfterWritingFirst(($api, day) =>
      $api.queryOptions("get", "/reports/{day}", {
        params: { path: { day: "x" }, header: { "X-Since": dayDate(day) as unknown as string } },
      }),
    );

    expect(second).toBe(FETCHED);
  });

  it("setQueriesData with a Date in a body leaves the query of another date", async () => {
    const second = await secondAfterWritingFirst(($api, day) =>
      $api.queryOptions("post", "/reports", { body: { from: dayDate(day) } }),
    );

    expect(second).toBe(FETCHED);
  });

  it("setQueriesData with a Number object body leaves the query of another number", async () => {
    const second = await secondAfterWritingFirst(($api, value) =>
      $api.queryOptions("post", "/reports", { body: new Number(value) }),
    );

    expect(second).toBe(FETCHED);
  });

  it("setQueriesData with a String object body leaves the query of another text", async () => {
    const second = await secondAfterWritingFirst(($api, length) =>
      $api.queryOptions("post", "/reports", { body: new String("a".repeat(length)) }),
    );

    expect(second).toBe(FETCHED);
  });

  it("setQueriesData with a toJSON object body leaves the query of another form", async () => {
    const second = await secondAfterWritingFirst(($api, value) =>
      $api.queryOptions("post", "/reports", { body: { price: { toJSON: () => value } } }),
    );

    expect(second).toBe(FETCHED);
  });

  it("setQueriesData with a toJSON form of a Date leaves the query of another date", async () => {
    const second = await secondAfterWritingFirst(($api, day) =>
      $api.queryOptions("post", "/reports", {
        body: { period: { toJSON: () => ({ at: dayDate(day) }) } },
      }),
    );

    expect(second).toBe(FETCHED);
  });

  it("setQueriesData with a NaN query param writes into its own query", async () => {
    const $api = reportClient();
    const queryClient = new QueryClient();
    const options = $api.queryOptions("get", "/reports", { params: { query: { n: Number.NaN } } });
    await queryClient.fetchQuery(options);

    queryClient.setQueriesData({ queryKey: options.queryKey }, () => WRITTEN);

    expect(queryClient.getQueryData(options.queryKey)).toBe(WRITTEN);
  });

  it("setQueriesData with a NaN in a body writes into its own query", async () => {
    const $api = reportClient();
    const queryClient = new QueryClient();
    const options = $api.queryOptions("post", "/reports", { body: { n: Number.NaN } });
    await queryClient.fetchQuery(options);

    queryClient.setQueriesData({ queryKey: options.queryKey }, () => WRITTEN);

    expect(queryClient.getQueryData(options.queryKey)).toBe(WRITTEN);
  });
});
