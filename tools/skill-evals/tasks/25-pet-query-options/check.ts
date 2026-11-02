import { QueryClient } from "@tanstack/react-query";
import { expect, test } from "vitest";
import { createPetQueries } from "../src/queries";
import { createFakeFetch, createTestClient, json, onlyRequest, REX } from "./kit";

test("petQuery fetches the pet with a key that names the operation", async () => {
  const fake = createFakeFetch(() => json(REX));
  const { petQuery } = createPetQueries(createTestClient(fake));

  const pet = await new QueryClient().fetchQuery(petQuery(1));

  expect(pet).toEqual(REX);
  expect(petQuery(1).queryKey.slice(0, 2)).toEqual(["get", "/pets/{petId}"]);
  expect(onlyRequest(fake).url.pathname).toBe("/v1/pets/1");
});

test("petListQuery sends the tag only when it is given", async () => {
  const fake = createFakeFetch(() => json({ items: [REX], nextCursor: null }));
  const { petListQuery } = createPetQueries(createTestClient(fake));
  const queryClient = new QueryClient();

  const page = await queryClient.fetchQuery(petListQuery("dog"));
  await queryClient.fetchQuery(petListQuery());

  expect(page.items).toEqual([REX]);
  expect(fake.requests.map((request) => request.url.search)).toEqual(["?tag=dog", ""]);
});
