import type { QueryClient } from "@tanstack/react-query";
import type { OpenapiQueryClient } from "openapi-typesafe-react-query";
import type { components, paths } from "./api/schema";

type Pet = components["schemas"]["Pet"];

/** How long a loaded pet is reused before it is requested again. */
const PET_STALE_TIME_MS = 60_000;

/** Load a pet through the query cache. */
export async function loadPet(
  queryClient: QueryClient,
  $api: OpenapiQueryClient<paths>,
  petId: number,
): Promise<Pet> {
  return queryClient.fetchQuery(
    $api.queryOptions(
      "get",
      "/pets/{petId}",
      { params: { path: { petId } } },
      { staleTime: PET_STALE_TIME_MS },
    ),
  );
}
