import { QueryClient } from "@tanstack/react-query";
import createQueryClient from "openapi-typesafe-react-query";
import { expect, test } from "vitest";
import { invalidatePetLists } from "../src/cache";
import { createFakeFetch, createTestClient, json, REX } from "./kit";

test("invalidatePetLists invalidates every pet list and no single pet", async () => {
  const fake = createFakeFetch((request) =>
    new URL(request.url).pathname === "/v1/pets"
      ? json({ items: [REX], nextCursor: null })
      : json(REX),
  );
  const $api = createQueryClient(createTestClient(fake));
  const queryClient = new QueryClient();
  const allPets = $api.queryOptions("get", "/pets");
  const dogs = $api.queryOptions("get", "/pets", { params: { query: { tag: "dog" } } });
  const rex = $api.queryOptions("get", "/pets/{petId}", { params: { path: { petId: 1 } } });
  await queryClient.fetchQuery(allPets);
  await queryClient.fetchQuery(dogs);
  await queryClient.fetchQuery(rex);

  await invalidatePetLists(queryClient);

  expect(queryClient.getQueryState(allPets.queryKey)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(dogs.queryKey)?.isInvalidated).toBe(true);
  expect(queryClient.getQueryState(rex.queryKey)?.isInvalidated).toBe(false);
});
