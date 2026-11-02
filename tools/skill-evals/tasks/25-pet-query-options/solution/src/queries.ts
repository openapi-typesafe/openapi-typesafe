import type { Client } from "openapi-typesafe-fetch";
import createClient from "openapi-typesafe-react-query";
import type { paths } from "./api/schema";

/** Typed TanStack Query options for the pet endpoints. */
export function createPetQueries(fetchClient: Client<paths>) {
  const $api = createClient(fetchClient);
  return {
    $api,
    petQuery: (petId: number) =>
      $api.queryOptions("get", "/pets/{petId}", { params: { path: { petId } } }),
    petListQuery: (tag?: string) =>
      $api.queryOptions("get", "/pets", { params: { query: tag === undefined ? {} : { tag } } }),
  };
}
