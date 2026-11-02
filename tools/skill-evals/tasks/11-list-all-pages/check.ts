import { expect, test } from "vitest";
import { listAllPets } from "../src/pets";
import { createFakeFetch, createTestClient, empty, json, REX, TOM } from "./kit";

const PAGES: Record<string, unknown> = {
  first: { items: [REX], nextCursor: 10 },
  "10": { items: [TOM], nextCursor: 20 },
  "20": { items: [{ ...REX, id: 3, name: "Bo" }], nextCursor: null },
};

test("listAllPets follows nextCursor until it is null", async () => {
  const fake = createFakeFetch((request) => {
    const cursor = new URL(request.url).searchParams.get("cursor") ?? "first";
    return json(PAGES[cursor]);
  });

  const pets = await listAllPets(createTestClient(fake), "dog");

  expect(pets.map((pet) => pet.name)).toEqual(["Rex", "Tom", "Bo"]);
  expect(fake.requests.map((request) => request.url.searchParams.get("cursor"))).toEqual([
    null,
    "10",
    "20",
  ]);
  expect(fake.requests.every((request) => request.url.searchParams.get("tag") === "dog")).toBe(
    true,
  );
});

test("listAllPets throws when a page fails", async () => {
  let calls = 0;
  const fake = createFakeFetch(() => (calls++ === 0 ? json(PAGES.first) : empty(500)));

  await expect(listAllPets(createTestClient(fake))).rejects.toThrow(Error);
});
