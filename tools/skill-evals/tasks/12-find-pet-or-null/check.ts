import { expect, test } from "vitest";
import { findPet } from "../src/pets";
import { createFakeFetch, createTestClient, empty, json, REX } from "./kit";

test("findPet returns the pet", async () => {
  expect(await findPet(createTestClient(createFakeFetch(() => json(REX))), 1)).toEqual(REX);
});

test("findPet returns null on 404", async () => {
  const fake = createFakeFetch(() => json({ code: "not_found", message: "No pet" }, 404));

  expect(await findPet(createTestClient(fake), 9)).toBeNull();
});

test("findPet throws on a 500 without a body", async () => {
  await expect(findPet(createTestClient(createFakeFetch(() => empty(500))), 1)).rejects.toThrow(
    Error,
  );
});

test("findPet throws on a 503 with a body", async () => {
  const fake = createFakeFetch(() => json({ code: "down", message: "Maintenance" }, 503));

  await expect(findPet(createTestClient(fake), 1)).rejects.toThrow(Error);
});
