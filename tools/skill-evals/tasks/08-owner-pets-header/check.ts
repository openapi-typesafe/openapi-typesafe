import { expect, test } from "vitest";
import { listOwnerPets } from "../src/owners";
import { createFakeFetch, createTestClient, empty, json, onlyRequest, REX } from "./kit";

test("listOwnerPets sends the owner id in the path and the request id as a header", async () => {
  const fake = createFakeFetch(() => json([REX]));

  const pets = await listOwnerPets(createTestClient(fake), "o 1", "req-42");

  expect(pets).toEqual([REX]);
  const request = onlyRequest(fake);
  expect(request.url.pathname).toBe("/v1/owners/o%201/pets");
  expect(request.headers.get("X-Request-Id")).toBe("req-42");
});

test("listOwnerPets throws when the request fails", async () => {
  await expect(
    listOwnerPets(createTestClient(createFakeFetch(() => empty(500))), "o-1", "r"),
  ).rejects.toThrow(Error);
});
