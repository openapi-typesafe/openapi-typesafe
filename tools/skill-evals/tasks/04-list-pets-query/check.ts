import { expect, test } from "vitest";
import { listPetNames } from "../src/pets";
import { createFakeFetch, createTestClient, empty, json, onlyRequest, REX, TOM } from "./kit";

const PAGE = { items: [REX, TOM], nextCursor: null };

test("listPetNames sends the filter as query parameters", async () => {
  const fake = createFakeFetch(() => json(PAGE));

  const names = await listPetNames(createTestClient(fake), { limit: 5, tag: "dog" });

  expect(names).toEqual(["Rex", "Tom"]);
  const url = onlyRequest(fake).url;
  expect(url.pathname).toBe("/v1/pets");
  expect(url.searchParams.get("limit")).toBe("5");
  expect(url.searchParams.get("tag")).toBe("dog");
});

test("listPetNames leaves out parameters that are not set", async () => {
  const fake = createFakeFetch(() => json(PAGE));

  await listPetNames(createTestClient(fake), {});

  expect(onlyRequest(fake).url.search).toBe("");
});

test("listPetNames throws when the request fails", async () => {
  const fake = createFakeFetch(() => empty(500));

  await expect(listPetNames(createTestClient(fake), {})).rejects.toThrow(Error);
});
