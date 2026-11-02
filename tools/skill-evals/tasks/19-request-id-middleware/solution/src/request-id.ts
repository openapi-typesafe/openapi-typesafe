import type { Middleware } from "openapi-typesafe-fetch";

const REQUEST_ID_HEADER = "X-Request-Id";

/** Gives every request an `X-Request-Id`, unless the caller already set one. */
export function createRequestIdMiddleware(nextId: () => string): Middleware {
  return {
    onRequest({ request }) {
      if (request.headers.has(REQUEST_ID_HEADER)) {
        return undefined;
      }
      request.headers.set(REQUEST_ID_HEADER, nextId());
      return request;
    },
  };
}
