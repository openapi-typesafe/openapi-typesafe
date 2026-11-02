import createFetchClient from "openapi-typesafe-fetch";
import createClient from "openapi-typesafe-react-query";
import type { paths } from "./schema";

/** The TanStack Query client of the Pet Clinic API. */
export function createApi(baseUrl: string, fetchImpl?: (request: Request) => Promise<Response>) {
  const fetchClient = createFetchClient<paths>(
    fetchImpl === undefined ? { baseUrl } : { baseUrl, fetch: fetchImpl },
  );
  return createClient(fetchClient);
}
