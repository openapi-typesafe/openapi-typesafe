import { QueryClient } from "@tanstack/react-query";
import createQueryClient from "openapi-typesafe-react-query";
import { expect, test } from "vitest";
import { loadPet } from "../src/pet-loader";
import { createFakeFetch, createTestClient, empty, json, REX } from "./kit";

test("loadPet requests a pet once and then serves it from the cache", async () => {
  const fake = createFakeFetch(() => json(REX));
  const $api = createQueryClient(createTestClient(fake));
  const queryClient = new QueryClient();

  const first = await loadPet(queryClient, $api, 1);
  const second = await loadPet(queryClient, $api, 1);

  expect(first).toEqual(REX);
  expect(second).toEqual(REX);
  expect(fake.requests).toHaveLength(1);
});

test("loadPet rejects for an empty 500", async () => {
  const $api = createQueryClient(createTestClient(createFakeFetch(() => empty(500))));

  const outcome = await loadPet(new QueryClient(), $api, 1).then(
    () => "resolved",
    () => "rejected",
  );

  expect(outcome).toBe("rejected");
});
