import createClient from "openapi-typesafe-fetch";
import { expect, test } from "vitest";
import type { paths } from "../src/api/schema";
import { loadPet } from "../src/pets";
import { BASE_URL, createFakeFetch, createTestClient, empty, failingFetch, json, REX } from "./kit";

test("loadPet returns ok with the pet", async () => {
  expect(await loadPet(createTestClient(createFakeFetch(() => json(REX))), 1)).toEqual({
    kind: "ok",
    pet: REX,
  });
});

test("loadPet returns not-found on 404", async () => {
  const fake = createFakeFetch(() => json({ code: "not_found", message: "No pet" }, 404));

  expect(await loadPet(createTestClient(fake), 9)).toEqual({ kind: "not-found" });
});

test("loadPet returns failed with the status for an empty 500", async () => {
  expect(await loadPet(createTestClient(createFakeFetch(() => empty(500))), 1)).toEqual({
    kind: "failed",
    status: 500,
  });
});

test("loadPet returns network-error when fetch rejects", async () => {
  const client = createClient<paths>({ baseUrl: BASE_URL, fetch: failingFetch });

  expect(await loadPet(client, 1)).toEqual({ kind: "network-error" });
});
