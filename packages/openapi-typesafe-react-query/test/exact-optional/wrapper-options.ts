import createFetchClient from "openapi-typesafe-fetch";
import createClient from "../../src/index.js";

/**
 * Checked with `exactOptionalPropertyTypes` by `exact-optional.test.ts`: a wrapper passes its own
 * optional options on, which are `undefined` when left out; the hooks count each of them as left
 * out.
 */

type Page = { items: string[]; next: number };

type Paths = {
  "/posts": {
    get: {
      parameters: { query?: { cursor?: number } };
      responses: { 200: { content: { "application/json": Page } } };
    };
  };
};

export interface WrapperOptions {
  keyScope?: string;
  pageParamName?: string;
}

export function makeApi(options: WrapperOptions) {
  return createClient(createFetchClient<Paths>(), { keyScope: options.keyScope });
}

export function usePosts(options: WrapperOptions) {
  return makeApi(options).useInfiniteQuery(
    "get",
    "/posts",
    {},
    {
      pageParamName: options.pageParamName,
      initialPageParam: 0,
      getNextPageParam: (last) => last.next,
    },
  );
}
