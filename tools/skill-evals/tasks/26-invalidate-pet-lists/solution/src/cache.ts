import type { QueryClient } from "@tanstack/react-query";

/**
 * openapi-typesafe-react-query keys are `[method, path, init]`, so `["get", "/pets"]` is a prefix of
 * every `GET /pets` query and of no `GET /pets/{petId}` query.
 */
export async function invalidatePetLists(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: ["get", "/pets"] });
}
