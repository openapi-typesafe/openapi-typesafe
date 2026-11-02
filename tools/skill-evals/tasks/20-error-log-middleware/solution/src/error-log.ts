import type { Middleware } from "openapi-typesafe-fetch";

export interface FailedResponseEntry {
  method: string;
  schemaPath: string;
  status: number;
}

/** Reports every failed response; the response itself passes through unchanged. */
export function createErrorLogMiddleware(log: (entry: FailedResponseEntry) => void): Middleware {
  return {
    onResponse({ request, response, schemaPath }) {
      if (!response.ok) {
        log({ method: request.method, schemaPath, status: response.status });
      }
      return undefined;
    },
  };
}
