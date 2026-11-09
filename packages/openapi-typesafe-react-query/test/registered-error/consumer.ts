// Compiled on its own by `registered-error.test.ts`: the `Register` below would change the error
// type of every other test.
import createFetchClient from "openapi-typesafe-fetch";
import createClient, { isResponseError, type ResponseError } from "../../src/index.js";
import type { paths } from "../fixtures/api.js";

declare module "@tanstack/react-query" {
  interface Register {
    defaultError: unknown;
  }
}

type IsUnknown<T> = unknown extends T ? true : false;

const $api = createClient(createFetchClient<paths>());

export function useReadError(): unknown {
  const { error } = $api.useQuery("get", "/blogposts/{post_id}", {
    params: { path: { post_id: "5" } },
  });
  const isUnknown: IsUnknown<typeof error> = true;
  if (isResponseError(error)) {
    const failed: ResponseError = error;
    return [isUnknown, failed.status];
  }
  if (error instanceof Error) {
    return error.message;
  }
  return isUnknown;
}
