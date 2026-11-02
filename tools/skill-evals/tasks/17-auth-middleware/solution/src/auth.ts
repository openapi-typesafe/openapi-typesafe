import type { Middleware } from "openapi-typesafe-fetch";

/** The operations the document marks as public (`security: []`): no token is sent to them. */
const PUBLIC_OPERATIONS: ReadonlySet<string> = new Set(["POST /auth/login", "GET /health"]);

/** Adds a bearer token from `getToken` to every request of a private operation. */
export function createAuthMiddleware(getToken: () => Promise<string>): Middleware {
  return {
    async onRequest({ request, schemaPath }) {
      if (PUBLIC_OPERATIONS.has(`${request.method} ${schemaPath}`)) {
        return undefined;
      }
      request.headers.set("Authorization", `Bearer ${await getToken()}`);
      return request;
    },
  };
}
