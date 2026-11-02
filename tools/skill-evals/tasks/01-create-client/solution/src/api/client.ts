import createClient from "openapi-typesafe-fetch";
import type { paths } from "./schema";

/** The typed client of the Pet Clinic API. */
export function createApiClient(
  baseUrl: string,
  fetchImpl?: (request: Request) => Promise<Response>,
) {
  return createClient<paths>(fetchImpl === undefined ? { baseUrl } : { baseUrl, fetch: fetchImpl });
}

export type ApiClient = ReturnType<typeof createApiClient>;
